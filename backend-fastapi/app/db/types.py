from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON


# JSONB en Postgres y JSON en SQLite para tests locales.
JSONB_COMPAT = JSONB().with_variant(JSON(), "sqlite")
