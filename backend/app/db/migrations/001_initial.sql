-- Ghost Bus schema v3 (build-plan step 2). Apply to Neon via the DIRECT connection:
--   python -m app.db.migrate
-- Design: "Data model (Neon Postgres) - v3, enforceable". Enforces version-scoped static,
-- the four identities, complete (NOT NULL) incident identity, immutable per-cycle
-- assessments, transition-sequence ordering, and a leader_epoch column for write fencing.

begin;

-- ---------- static, version-scoped ----------
create table if not exists static_feed_versions (
  version_id        bigserial primary key,
  source_url        text,
  source_hash       text,
  feed_version      text,
  allowlist_version text,
  imported_at       timestamptz,
  feed_start        date,
  feed_end          date,
  status            text not null check (status in ('importing','valid','active','superseded'))
);
create unique index if not exists one_active_version
  on static_feed_versions ((true)) where status = 'active';

create table if not exists agency (
  version_id      bigint not null references static_feed_versions,
  agency_id       text   not null,
  agency_timezone text   not null,
  primary key (version_id, agency_id)
);

create table if not exists routes (
  version_id       bigint not null references static_feed_versions,
  route_id         text   not null,
  agency_id        text,
  route_short_name text,
  route_long_name  text,
  route_type       smallint,
  primary key (version_id, route_id),
  foreign key (version_id, agency_id) references agency
);

create table if not exists trips (
  version_id           bigint not null references static_feed_versions,
  trip_id              text   not null,
  route_id             text   not null,
  service_id           text   not null,
  operator_id          text,
  direction_id         smallint,
  trip_headsign        text,
  effective_start_secs int,
  effective_end_secs   int,
  primary key (version_id, trip_id),
  foreign key (version_id, route_id) references routes
);

create table if not exists stops (
  version_id bigint not null references static_feed_versions,
  stop_id    text   not null,
  stop_code  text,
  stop_name  text,
  stop_lat   double precision,
  stop_lon   double precision,
  primary key (version_id, stop_id)
);

create table if not exists stop_times (
  version_id     bigint not null references static_feed_versions,
  trip_id        text   not null,
  stop_sequence  int    not null,
  stop_id        text   not null,
  arrival_secs   int,
  departure_secs int,
  primary key (version_id, trip_id, stop_sequence),
  foreign key (version_id, trip_id) references trips,
  foreign key (version_id, stop_id) references stops
);

create table if not exists calendar (
  version_id bigint not null references static_feed_versions,
  service_id text   not null,
  monday boolean, tuesday boolean, wednesday boolean, thursday boolean,
  friday boolean, saturday boolean, sunday boolean,
  start_date date, end_date date,
  primary key (version_id, service_id)
);

create table if not exists calendar_dates (
  version_id     bigint   not null references static_feed_versions,
  service_id     text     not null,
  date           date     not null,
  exception_type smallint not null check (exception_type in (1, 2)),
  primary key (version_id, service_id, date)
);

-- ---------- identity 2: source snapshots (immutable, deduplicated) ----------
create table if not exists source_snapshots (
  snapshot_id    bigserial primary key,
  feed_kind      text not null check (feed_kind in ('vehicles','trip_updates')),
  feed_timestamp timestamptz not null,
  canonical_hash text not null,
  incrementality text,
  entity_count   int check (entity_count >= 0),
  ingested_at    timestamptz,
  ingest_state   text not null check (ingest_state in ('staging','complete','rejected')),
  unique (feed_kind, feed_timestamp, canonical_hash)
);

-- ---------- identity 1: acquisition attempts ----------
create table if not exists acquisition_attempts (
  attempt_id         bigserial primary key,
  feed_kind          text not null check (feed_kind in ('vehicles','trip_updates')),
  started_at         timestamptz,
  finished_at        timestamptz,
  http_status        int,
  transport_outcome  text not null,
  source_snapshot_id bigint references source_snapshots,
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

-- ---------- observations (keyed by source identity) ----------
create table if not exists vehicle_observations (
  snapshot_id                bigint not null references source_snapshots,
  entity_id                  text   not null,
  trip_id                    text,
  trip_schedule_relationship text,
  service_date               date,
  start_time                 text,
  route_id                   text,
  latitude  double precision check (latitude  is null or latitude  between  -90 and  90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  vehicle_timestamp          timestamptz,
  raw                        jsonb,
  primary key (snapshot_id, entity_id)
);

create table if not exists trip_update_observations (
  snapshot_id                bigint not null references source_snapshots,
  entity_id                  text   not null,
  trip_id                    text,
  trip_schedule_relationship text,
  update_present             boolean,
  predicted_due_secs         int,
  prediction_timestamp       timestamptz,
  service_date               date,
  start_time                 text,
  trip_properties            jsonb,
  raw                        jsonb,
  primary key (snapshot_id, entity_id)
);

-- ---------- identity 4: expected instances (from static; complete identity) ----------
create table if not exists expected_instances (
  expected_instance_id    bigserial primary key,
  static_version_id       bigint not null references static_feed_versions,
  service_date            date   not null,
  trip_id                 text   not null,
  start_time              text   not null,
  operator_id             text   not null,
  route_id                text   not null,
  ref_stop_id             text,
  ref_stop_sequence       int,
  effective_start_secs    int not null,
  static_due_secs         int not null,
  last_matched_vehicle_at timestamptz,
  unique (static_version_id, service_date, trip_id, start_time)
);

-- ---------- identity 3: decision cycles + immutable per-cycle assessments ----------
create table if not exists decision_cycles (
  cycle_id                 bigserial primary key,
  logical_key              text not null unique,
  decided_at               timestamptz not null,
  vehicles_snapshot_id     bigint references source_snapshots,
  trip_updates_snapshot_id bigint references source_snapshots,
  static_version_id        bigint references static_feed_versions,
  leader_epoch             bigint not null,
  measured_skew_secs       int,
  cohort_health            jsonb
);

create table if not exists call_assessments (
  cycle_id             bigint not null references decision_cycles,
  expected_instance_id bigint not null references expected_instances,
  assessment           text not null check (assessment in (
                         'data_unusable','explicit_cancelled','explicit_deleted',
                         'vehicle_observed','predicted_delayed','watch',
                         'unmatched','excluded_unsupported')),
  effective_due_secs   int,
  predicted_due_secs   int,
  prediction_source    text,
  evidence_level       text not null check (evidence_level in ('observed','inferred')),
  vehicles_snapshot_id bigint references source_snapshots,
  reason_code          text,
  primary key (cycle_id, expected_instance_id)
);

-- ---------- incident aggregate + ordered transitions ----------
create table if not exists incidents (
  incident_id          bigserial primary key,
  expected_instance_id bigint not null references expected_instances,
  episode_seq          int    not null default 1,
  lifecycle            text   not null check (lifecycle in (
                          'candidate','persistent_unmatched','resolved','expired')),
  miss_count           int    not null default 1 check (miss_count >= 1),
  first_seen           timestamptz,
  last_seen            timestamptz,
  resolved_reason      text,
  last_cycle_id        bigint references decision_cycles,
  unique (expected_instance_id, episode_seq)
);
create unique index if not exists one_open_incident on incidents (expected_instance_id)
  where lifecycle in ('candidate','persistent_unmatched');

create table if not exists incident_transitions (
  incident_id    bigint not null references incidents,
  transition_seq int    not null,
  at             timestamptz not null,
  from_state     text,
  to_state       text not null,
  reason_code    text not null,
  cycle_id       bigint references decision_cycles,
  primary key (incident_id, transition_seq)
);

-- ---------- model assessments (optional) ----------
create table if not exists model_assessments (
  assessment_id        bigserial primary key,
  cycle_id             bigint references decision_cycles,
  expected_instance_id bigint,
  model_version        text,
  prompt_version       text,
  question_hash        text,
  input_bundle         jsonb,
  output               jsonb,
  created_at           timestamptz
);

-- ---------- hot-path indexes ----------
create index if not exists observations_vehicle_join on vehicle_observations (trip_id) where trip_id is not null;
create index if not exists expected_active on expected_instances (static_version_id, service_date);
create index if not exists assessments_by_cycle on call_assessments (cycle_id);

commit;
