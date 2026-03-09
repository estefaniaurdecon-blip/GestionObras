from __future__ import annotations

from sqlmodel import Session, select

from app.models.user import User
from app.models.work_report_comment import WorkReportComment
from app.schemas.work_report_comment import (
    WorkReportCommentCreate,
    WorkReportCommentRead,
    WorkReportCommentUserRead,
)


def _to_read(row: WorkReportComment, user_full_name: str) -> WorkReportCommentRead:
    return WorkReportCommentRead(
        id=int(row.id or 0),
        tenant_id=row.tenant_id,
        work_report_id=row.work_report_id,
        user_id=str(row.user_id),
        comment=row.comment,
        created_at=row.created_at,
        user=WorkReportCommentUserRead(full_name=user_full_name),
    )


def list_work_report_comments(
    session: Session,
    *,
    tenant_id: int,
    work_report_id: str,
) -> list[WorkReportCommentRead]:
    rows = session.exec(
        select(WorkReportComment)
        .where(
            WorkReportComment.tenant_id == tenant_id,
            WorkReportComment.work_report_id == work_report_id,
        )
        .order_by(WorkReportComment.created_at.asc())
    ).all()
    if not rows:
        return []

    user_ids = {row.user_id for row in rows if row.user_id is not None}
    users = (
        session.exec(select(User).where(User.id.in_(user_ids))).all()
        if user_ids
        else []
    )
    user_names = {int(user.id): (user.full_name or "Usuario") for user in users if user.id is not None}

    return [_to_read(row, user_names.get(int(row.user_id), "Usuario")) for row in rows]


def create_work_report_comment(
    session: Session,
    *,
    tenant_id: int,
    work_report_id: str,
    current_user: User,
    payload: WorkReportCommentCreate,
) -> WorkReportCommentRead:
    row = WorkReportComment(
        tenant_id=tenant_id,
        work_report_id=work_report_id.strip(),
        user_id=int(current_user.id or 0),
        comment=payload.comment.strip(),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row, current_user.full_name or "Usuario")
