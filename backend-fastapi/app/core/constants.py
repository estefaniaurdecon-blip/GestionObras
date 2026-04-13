"""Domain-level constants shared across the application.

Keep business rules here rather than scattered in service modules.
"""

# ---------------------------------------------------------------------------
# Task statuses
# ---------------------------------------------------------------------------
TASK_STATUSES: frozenset[str] = frozenset({"pending", "in_progress", "done"})

# ---------------------------------------------------------------------------
# Work-report statuses
# ---------------------------------------------------------------------------
WORK_REPORT_ALLOWED_STATUSES: frozenset[str] = frozenset(
    {
        "draft",
        "pending",
        "approved",
        "completed",
        "missing_data",
        "missing_delivery_notes",
        "closed",
        "archived",
    }
)
WORK_REPORT_CLOSED_STATUSES: frozenset[str] = frozenset({"closed"})

# ---------------------------------------------------------------------------
# Rental machinery
# ---------------------------------------------------------------------------
RENTAL_ALLOWED_STATUSES: frozenset[str] = frozenset({"active", "inactive", "archived"})
RENTAL_PRICE_UNITS: frozenset[str] = frozenset({"day", "hour", "month"})

# ---------------------------------------------------------------------------
# Work services (postventa / repaso)
# ---------------------------------------------------------------------------
WORK_SERVICE_ALLOWED_STATUSES: frozenset[str] = frozenset(
    {"pending", "in_progress", "completed"}
)
