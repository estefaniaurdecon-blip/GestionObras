from typing import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings


# Engine global para SQLModel / SQLAlchemy.
engine = create_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
)


def init_db() -> None:
    """
    Crea todas las tablas definidas en los modelos SQLModel.

    Nota: en un entorno real se recomienda usar Alembic para migraciones,
    pero esto permite levantar el entorno local rÃ¡pidamente.
    """

    from app.db import base  # noqa: F401  Import para registrar modelos

    SQLModel.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    if "erp_task" in table_names:
        task_columns = {col["name"] for col in inspector.get_columns("erp_task")}
        with engine.begin() as conn:
            if "status" not in task_columns:
                # Backfill rapido para entornos locales sin migraciones.
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'"
                    )
                )
                conn.execute(
                    text(
                        "UPDATE erp_task "
                        "SET status = CASE WHEN is_completed THEN 'done' ELSE 'pending' END "
                        "WHERE status IS NULL"
                    )
                )
            if "start_date" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN start_date TIMESTAMP NULL"
                    )
                )
            if "end_date" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN end_date TIMESTAMP NULL"
                    )
                )
            if "subactivity_id" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN subactivity_id INTEGER NULL"
                    )
                )
            if "task_template_id" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN task_template_id INTEGER NULL"
                    )
                )

    if "erp_project" in table_names:
        project_columns = {col["name"] for col in inspector.get_columns("erp_project")}
        with engine.begin() as conn:
            if "start_date" not in project_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_project "
                        "ADD COLUMN start_date TIMESTAMP NULL"
                    )
                )
            if "end_date" not in project_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_project "
                        "ADD COLUMN end_date TIMESTAMP NULL"
                    )
                )


def get_session() -> Iterator[Session]:
    """
    Proveedor de sesiones de base de datos para FastAPI.

    FastAPI reconoce esta funciÃ³n generadora y se encarga
    de abrir y cerrar la sesiÃ³n alrededor de cada peticiÃ³n.
    """

    with Session(engine) as session:
        yield session
