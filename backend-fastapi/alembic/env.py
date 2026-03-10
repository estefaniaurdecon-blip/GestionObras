"""
Alembic environment configuration.

Conecta Alembic al mismo engine/metadata que usa el backend,
evitando duplicar configuracion de conexion.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# -- Importamos metadata real del proyecto --
# Este import registra todos los modelos en SQLModel.metadata
from app.db import base  # noqa: F401
from sqlmodel import SQLModel

# -- Importamos settings para obtener la URL de conexion --
from app.core.config import settings

# Alembic Config object (acceso a alembic.ini)
config = context.config

# Logging desde alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata target para autogenerate
target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Genera SQL sin conectar a la DB. Util para revisar scripts.
    """
    url = settings.database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Conecta a la DB real y aplica migraciones.
    """
    # Inyectamos la URL real desde settings en la config de Alembic
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = settings.database_url

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
