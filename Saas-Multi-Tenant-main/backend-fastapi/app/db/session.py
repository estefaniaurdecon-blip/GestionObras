from typing import Iterator

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


def get_session() -> Iterator[Session]:
    """
    Proveedor de sesiones de base de datos para FastAPI.

    FastAPI reconoce esta funciÃ³n generadora y se encarga
    de abrir y cerrar la sesiÃ³n alrededor de cada peticiÃ³n.
    """

    with Session(engine) as session:
        yield session

