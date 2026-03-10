"""
Run all one-shot backfills / seeds.

Usage (from backend-fastapi/):
    python -m app.db.migrations.run_all

Each backfill is idempotent — safe to re-run.
Requires the schema to already exist (run the app once first, or call init_db()).
"""

import sys

from app.db.migrations.backfills import ALL_BACKFILLS


def main() -> None:
    print(f"Running {len(ALL_BACKFILLS)} backfill(s)...\n")
    for fn in ALL_BACKFILLS:
        try:
            fn()
        except Exception as exc:
            print(f"  [FAIL] {fn.__name__}: {exc}", file=sys.stderr)
            raise
    print("\nAll backfills completed.")


if __name__ == "__main__":
    main()
