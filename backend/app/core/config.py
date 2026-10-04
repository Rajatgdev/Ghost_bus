"""Central config. Reads .env. Cohort-health thresholds are policy — they live
here (and in env), never inside any model."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # NTA GTFS-Realtime v2
    nta_api_key: str = ""
    nta_api_key_secondary: str = ""
    nta_base_url: str = "https://api.nationaltransport.ie/gtfsr/v2"

    # cohort-health thresholds (provisional; set from the step-1 probe)
    max_entity_age_secs: int = 120
    max_feed_age_secs: int = 90
    max_skew_secs: int = 30
    min_observed_fraction: float = 0.30
    min_abs_floor: int = 20
    coldstart_n: int = 3

    # detector: hold a due trip as `watch` until now > due + this, so a bus that logs
    # its tracker on a few minutes late isn't flagged as a ghost (false-positive guard).
    unmatched_grace_secs: int = 180   # 3 min

    # cors
    allowed_origins: str = "http://localhost:5173"

    # db — Neon Postgres. OFF by default (build-plan step 2+).
    use_db: bool = False
    database_url: str = ""          # pooled (app)
    database_url_direct: str = ""   # direct (migrations only)

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
