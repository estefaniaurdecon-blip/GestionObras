import json
from datetime import date, datetime
from app.core.datetime import utc_now
from uuid import uuid4

import pytest
from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.erp import WorkReport
from app.models.message import Message
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.policies.access_policies import (
    can_access_work_report,
    can_access_work_report_attachment,
)
from app.services.message_service import MessageValidationError, delete_conversation
from app.services.ticket_service import _get_ticket_agent_user_ids
from app.services.user_service import _infer_created_by_user_id


def _create_tenant(session: Session, *, prefix: str) -> Tenant:
    tenant = Tenant(
        name=f"{prefix}-{uuid4().hex[:8]}",
        subdomain=f"{prefix}-{uuid4().hex[:8]}",
        is_active=True,
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


def _role_id(session: Session, role_name: str) -> int:
    role = session.exec(select(Role).where(Role.name == role_name)).one()
    assert role.id is not None
    return int(role.id)


def _create_user(
    session: Session,
    *,
    tenant_id: int | None,
    email_prefix: str,
    full_name: str,
    is_super_admin: bool = False,
    role_name: str | None = None,
    creator_group_id: int | None = None,
    created_by_user_id: int | None = None,
) -> User:
    role_id = _role_id(session, role_name) if role_name else None
    user = User(
        email=f"{email_prefix}-{uuid4().hex[:8]}@example.com",
        full_name=full_name,
        hashed_password=hash_password("temporal"),
        is_active=True,
        is_super_admin=is_super_admin,
        tenant_id=tenant_id,
        role_id=role_id,
        creator_group_id=creator_group_id,
        created_by_user_id=created_by_user_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_work_report_access_policy_respects_group_and_legacy(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase3-wr")
    normal_user = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email_prefix="normal",
        full_name="Normal User",
        role_name="tenant_admin",
        creator_group_id=10,
    )
    superadmin = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god")
    ).one()

    same_group_report = WorkReport(
        tenant_id=int(tenant.id or 0),
        project_id=1,
        date=date(2026, 3, 23),
        creator_group_id=10,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    other_group_report = WorkReport(
        tenant_id=int(tenant.id or 0),
        project_id=1,
        date=date(2026, 3, 23),
        creator_group_id=20,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    legacy_report = WorkReport(
        tenant_id=int(tenant.id or 0),
        project_id=1,
        date=date(2026, 3, 23),
        creator_group_id=None,
        created_at=utc_now(),
        updated_at=utc_now(),
    )

    assert can_access_work_report(db_session_fixture, normal_user, same_group_report) is True
    assert can_access_work_report_attachment(
        db_session_fixture,
        normal_user,
        same_group_report,
    ) is True
    assert can_access_work_report(db_session_fixture, normal_user, other_group_report) is False
    assert can_access_work_report(db_session_fixture, normal_user, legacy_report) is False
    assert can_access_work_report(db_session_fixture, superadmin, legacy_report) is True


def test_delete_conversation_revalidates_group_before_delete(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase3-msg")
    actor = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email_prefix="actor",
        full_name="Actor",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    other_user = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email_prefix="other",
        full_name="Other",
        role_name="tenant_admin",
        creator_group_id=200,
    )

    row = Message(
        tenant_id=int(tenant.id or 0),
        from_user_id=str(actor.id),
        to_user_id=str(other_user.id),
        message="mensaje cruzado",
    )
    db_session_fixture.add(row)
    db_session_fixture.commit()

    with pytest.raises(MessageValidationError):
        delete_conversation(
            db_session_fixture,
            user=actor,
            tenant_id=int(tenant.id or 0),
            other_user_id=str(other_user.id),
        )

    remaining = db_session_fixture.exec(
        select(Message).where(Message.tenant_id == int(tenant.id or 0))
    ).all()
    assert len(remaining) == 1


def test_infer_created_by_user_id_supports_json_and_legacy_fallback(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase3-audit")
    creator = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email_prefix="creator",
        full_name="Creator",
        role_name="tenant_admin",
        creator_group_id=300,
    )
    structured_user = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email_prefix="structured",
        full_name="Structured User",
        role_name="usuario",
    )
    legacy_user = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email_prefix="legacy",
        full_name="Legacy User",
        role_name="usuario",
    )

    structured_user.created_by_user_id = None
    structured_user.creator_group_id = None
    legacy_user.created_by_user_id = None
    legacy_user.creator_group_id = None
    db_session_fixture.add(structured_user)
    db_session_fixture.add(legacy_user)
    db_session_fixture.commit()

    db_session_fixture.add(
        AuditLog(
            user_id=int(creator.id or 0),
            tenant_id=int(tenant.id or 0),
            action="user.create",
            details=json.dumps(
                {
                    "created_user_id": int(structured_user.id or 0),
                    "email": structured_user.email,
                }
            ),
        )
    )
    db_session_fixture.add(
        AuditLog(
            user_id=int(creator.id or 0),
            tenant_id=int(tenant.id or 0),
            action="user.create",
            details=f"Usuario {legacy_user.email} creado",
        )
    )
    db_session_fixture.commit()

    assert _infer_created_by_user_id(db_session_fixture, structured_user) == creator.id
    assert _infer_created_by_user_id(db_session_fixture, legacy_user) == creator.id


def test_ticket_agent_user_ids_filter_same_group_agents(
    db_session_fixture: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase3-ticket")
    actor = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email_prefix="ticket-actor",
        full_name="Ticket Actor",
        role_name="tenant_admin",
        creator_group_id=500,
    )
    same_group_agent = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email_prefix="ticket-same",
        full_name="Same Group Agent",
        role_name="tenant_admin",
        creator_group_id=500,
    )
    other_group_agent = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email_prefix="ticket-other",
        full_name="Other Group Agent",
        role_name="tenant_admin",
        creator_group_id=900,
    )
    superadmin = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god")
    ).one()

    monkeypatch.setattr(
        "app.services.ticket_service._user_has_permission",
        lambda session, user, code: code == "tickets:manage",
    )

    agent_ids = _get_ticket_agent_user_ids(
        db_session_fixture,
        int(tenant.id or 0),
        actor=actor,
    )

    assert int(actor.id or 0) in agent_ids
    assert int(same_group_agent.id or 0) in agent_ids
    assert int(other_group_agent.id or 0) not in agent_ids
    assert int(superadmin.id or 0) in agent_ids
