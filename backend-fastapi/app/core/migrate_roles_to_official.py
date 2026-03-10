"""
Migracion de roles legacy al modelo oficial:
- super_admin
- tenant_admin
- usuario

Este script reasigna usuarios e invitaciones con roles legacy.
Uso:
    python -m app.core.migrate_roles_to_official --apply
"""

from __future__ import annotations

import argparse

from sqlalchemy import delete
from sqlmodel import Session, select

from app.db import session as db_session
from app.models.permission import Permission  # noqa: F401
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User
from app.models.user_invitation import UserInvitation


LEGACY_TO_OFFICIAL_ROLE = {
    "manager": "usuario",
    "hr_manager": "usuario",
    "jefe_obra": "usuario",
    "administracion": "usuario",
    "compras": "usuario",
    "juridico": "usuario",
    "gerencia": "usuario",
    "user": "usuario",
}

OFFICIAL_ROLES = {"super_admin", "tenant_admin", "usuario"}


def migrate_roles(session: Session, apply_changes: bool) -> dict[str, int]:
    roles = session.exec(select(Role)).all()
    roles_by_name = {role.name: role for role in roles}

    missing = [name for name in OFFICIAL_ROLES if name not in roles_by_name]
    if missing:
        raise RuntimeError(
            f"Faltan roles oficiales en BD: {', '.join(sorted(missing))}. "
            "Ejecuta primero el seed RBAC."
        )

    updated_users = 0
    updated_invitations = 0
    deleted_legacy_roles = 0

    for legacy_name, target_name in LEGACY_TO_OFFICIAL_ROLE.items():
        legacy_role = roles_by_name.get(legacy_name)
        target_role = roles_by_name[target_name]
        if not legacy_role:
            continue

        users = session.exec(
            select(User).where(User.role_id == legacy_role.id),
        ).all()
        for user in users:
            user.role_id = target_role.id
            session.add(user)
            updated_users += 1

        invitations = session.exec(
            select(UserInvitation).where(UserInvitation.role_name == legacy_name),
        ).all()
        for invitation in invitations:
            invitation.role_name = target_name
            session.add(invitation)
            updated_invitations += 1

    # Materializa reasignaciones antes de evaluar borrado de roles legacy.
    session.flush()

    # Limpieza de roles legacy ya migrados.
    # Solo eliminamos si no quedan usuarios asociados.
    for legacy_name in LEGACY_TO_OFFICIAL_ROLE:
        legacy_role = roles_by_name.get(legacy_name)
        if not legacy_role:
            continue

        users_left = session.exec(
            select(User).where(User.role_id == legacy_role.id),
        ).all()
        if users_left:
            continue

        # Borrado explicito para evitar conflictos de orden de flush.
        session.exec(
            delete(RolePermission).where(RolePermission.role_id == legacy_role.id),
        )
        session.exec(
            delete(Role).where(Role.id == legacy_role.id),
        )
        deleted_legacy_roles += 1

    if apply_changes:
        session.commit()
    else:
        session.rollback()

    return {
        "users_updated": updated_users,
        "invitations_updated": updated_invitations,
        "legacy_roles_deleted": deleted_legacy_roles,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Aplica cambios. Sin esta bandera solo simula.",
    )
    args = parser.parse_args()

    with Session(db_session.engine) as session:
        result = migrate_roles(session, apply_changes=args.apply)
        mode = "APPLIED" if args.apply else "DRY_RUN"
        print(
            f"[{mode}] users_updated={result['users_updated']} "
            f"invitations_updated={result['invitations_updated']} "
            f"legacy_roles_deleted={result['legacy_roles_deleted']}"
        )


if __name__ == "__main__":
    main()
