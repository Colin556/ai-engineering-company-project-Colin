"""Canonical incident categories, lifecycle states, and Brasaland branches."""

from incident_analysis import VALID_CATEGORIES

INCIDENT_CATEGORIES = tuple(sorted(VALID_CATEGORIES))
INCIDENT_STATUSES = ("open", "in_progress", "resolved", "discarded")
INCIDENT_ORIGINS = ("customer", "branch", "internal")

BRANCHES = (
    {"value": "LOC-MEDELLIN-01", "label": "Brasaland El Poblado"},
    {"value": "LOC-MEDELLIN-02", "label": "Brasaland Laureles"},
    {"value": "LOC-MEDELLIN-03", "label": "Brasaland Envigado"},
    {"value": "LOC-MEDELLIN-04", "label": "Brasaland Sabaneta"},
    {"value": "LOC-BOGOTA-01", "label": "Brasaland Usaquén"},
    {"value": "LOC-BOGOTA-02", "label": "Brasaland Chapinero"},
    {"value": "LOC-BOGOTA-03", "label": "Brasaland Zona Rosa"},
    {"value": "LOC-CALI-01", "label": "Brasaland Granada"},
    {"value": "LOC-CALI-02", "label": "Brasaland Ciudad Jardín"},
    {"value": "LOC-CALI-03", "label": "Brasaland Unicentro"},
    {"value": "LOC-MIAMI-01", "label": "Brasaland Brickell"},
    {"value": "LOC-MIAMI-02", "label": "Brasaland Coral Gables"},
    {"value": "LOC-ORLANDO-01", "label": "Brasaland Downtown"},
    {"value": "LOC-ORLANDO-02", "label": "Brasaland International Drive"},
    {"value": "central", "label": "Central (Medellín headquarters)"},
)

BRANCH_VALUES = frozenset(branch["value"] for branch in BRANCHES)
BRANCH_LABEL_TO_VALUE = {
    branch["label"].casefold(): branch["value"] for branch in BRANCHES
}

CSV_STATUS_MAP = {
    "open": "open",
    "closed": "resolved",
    "discarded": "discarded",
}
CSV_CATEGORY_MAP = {category: category for category in INCIDENT_CATEGORIES}