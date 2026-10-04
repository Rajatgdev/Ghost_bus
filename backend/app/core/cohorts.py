"""The operator cohorts Ghost Bus watches — the one file you edit to add an operator.

Real per-operator attribution comes from the static GTFS (route -> agency) in build-plan
step 2; confirm the exact agency_ids from the feed then. Until static is imported, the
pipeline treats everything as a single synthetic cohort ("all") so the live feed can be
exercised end to end. Keep this list small for the MVP — the thin slice is one operator.
"""

# operator_id values are placeholders until confirmed against the static GTFS agency table.
COHORTS = [
    {"operator_id": "dublin_bus", "name": "Dublin Bus"},     # TODO confirm agency_id (step 2)
    # {"operator_id": "go_ahead",  "name": "Go-Ahead Ireland"},
    # {"operator_id": "bus_eireann", "name": "Bus Eireann (city)"},
]

# Preview/skeleton cohort used before static import exists.
PREVIEW_COHORT = "all"
