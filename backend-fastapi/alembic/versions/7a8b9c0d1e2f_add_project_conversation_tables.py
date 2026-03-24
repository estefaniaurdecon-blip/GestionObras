"""add_project_conversation_tables

Revision ID: 7a8b9c0d1e2f
Revises: 6b7e2f6c4d1a
Create Date: 2026-03-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7a8b9c0d1e2f"
down_revision: Union[str, None] = "6b7e2f6c4d1a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_conversation",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("creator_group_id", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["creator_group_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["erp_project.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "project_id",
            "creator_group_id",
            name="uq_project_conversation_tenant_project_group",
        ),
    )
    op.create_index(op.f("ix_project_conversation_created_at"), "project_conversation", ["created_at"], unique=False)
    op.create_index(op.f("ix_project_conversation_creator_group_id"), "project_conversation", ["creator_group_id"], unique=False)
    op.create_index(op.f("ix_project_conversation_created_by_id"), "project_conversation", ["created_by_id"], unique=False)
    op.create_index(op.f("ix_project_conversation_last_message_at"), "project_conversation", ["last_message_at"], unique=False)
    op.create_index(op.f("ix_project_conversation_project_id"), "project_conversation", ["project_id"], unique=False)
    op.create_index(op.f("ix_project_conversation_tenant_id"), "project_conversation", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_project_conversation_updated_at"), "project_conversation", ["updated_at"], unique=False)

    op.create_table(
        "project_conversation_participant",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("creator_group_id", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.Column("left_at", sa.DateTime(), nullable=True),
        sa.Column("last_read_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["project_conversation.id"]),
        sa.ForeignKeyConstraint(["creator_group_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["erp_project.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "conversation_id",
            "user_id",
            name="uq_project_conversation_participant_conversation_user",
        ),
    )
    op.create_index(op.f("ix_project_conversation_participant_conversation_id"), "project_conversation_participant", ["conversation_id"], unique=False)
    op.create_index(op.f("ix_project_conversation_participant_creator_group_id"), "project_conversation_participant", ["creator_group_id"], unique=False)
    op.create_index(op.f("ix_project_conversation_participant_is_active"), "project_conversation_participant", ["is_active"], unique=False)
    op.create_index(op.f("ix_project_conversation_participant_joined_at"), "project_conversation_participant", ["joined_at"], unique=False)
    op.create_index(op.f("ix_project_conversation_participant_last_read_at"), "project_conversation_participant", ["last_read_at"], unique=False)
    op.create_index(op.f("ix_project_conversation_participant_left_at"), "project_conversation_participant", ["left_at"], unique=False)
    op.create_index(op.f("ix_project_conversation_participant_project_id"), "project_conversation_participant", ["project_id"], unique=False)
    op.create_index(
        "ix_project_conversation_participant_scope",
        "project_conversation_participant",
        ["tenant_id", "project_id", "creator_group_id"],
        unique=False,
    )
    op.create_index(op.f("ix_project_conversation_participant_tenant_id"), "project_conversation_participant", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_project_conversation_participant_user_id"), "project_conversation_participant", ["user_id"], unique=False)

    op.create_table(
        "project_conversation_message",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("creator_group_id", sa.Integer(), nullable=False),
        sa.Column("from_user_id", sa.Integer(), nullable=False),
        sa.Column("message", sa.String(length=4000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["project_conversation.id"]),
        sa.ForeignKeyConstraint(["creator_group_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["from_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["erp_project.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_project_conversation_message_conversation_id"), "project_conversation_message", ["conversation_id"], unique=False)
    op.create_index(op.f("ix_project_conversation_message_created_at"), "project_conversation_message", ["created_at"], unique=False)
    op.create_index(op.f("ix_project_conversation_message_creator_group_id"), "project_conversation_message", ["creator_group_id"], unique=False)
    op.create_index(op.f("ix_project_conversation_message_from_user_id"), "project_conversation_message", ["from_user_id"], unique=False)
    op.create_index(op.f("ix_project_conversation_message_project_id"), "project_conversation_message", ["project_id"], unique=False)
    op.create_index(
        "ix_project_conversation_message_scope",
        "project_conversation_message",
        ["tenant_id", "project_id", "creator_group_id", "created_at"],
        unique=False,
    )
    op.create_index(op.f("ix_project_conversation_message_tenant_id"), "project_conversation_message", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_project_conversation_message_tenant_id"), table_name="project_conversation_message")
    op.drop_index("ix_project_conversation_message_scope", table_name="project_conversation_message")
    op.drop_index(op.f("ix_project_conversation_message_project_id"), table_name="project_conversation_message")
    op.drop_index(op.f("ix_project_conversation_message_from_user_id"), table_name="project_conversation_message")
    op.drop_index(op.f("ix_project_conversation_message_creator_group_id"), table_name="project_conversation_message")
    op.drop_index(op.f("ix_project_conversation_message_created_at"), table_name="project_conversation_message")
    op.drop_index(op.f("ix_project_conversation_message_conversation_id"), table_name="project_conversation_message")
    op.drop_table("project_conversation_message")

    op.drop_index(op.f("ix_project_conversation_participant_user_id"), table_name="project_conversation_participant")
    op.drop_index(op.f("ix_project_conversation_participant_tenant_id"), table_name="project_conversation_participant")
    op.drop_index("ix_project_conversation_participant_scope", table_name="project_conversation_participant")
    op.drop_index(op.f("ix_project_conversation_participant_project_id"), table_name="project_conversation_participant")
    op.drop_index(op.f("ix_project_conversation_participant_left_at"), table_name="project_conversation_participant")
    op.drop_index(op.f("ix_project_conversation_participant_last_read_at"), table_name="project_conversation_participant")
    op.drop_index(op.f("ix_project_conversation_participant_joined_at"), table_name="project_conversation_participant")
    op.drop_index(op.f("ix_project_conversation_participant_is_active"), table_name="project_conversation_participant")
    op.drop_index(op.f("ix_project_conversation_participant_creator_group_id"), table_name="project_conversation_participant")
    op.drop_index(op.f("ix_project_conversation_participant_conversation_id"), table_name="project_conversation_participant")
    op.drop_table("project_conversation_participant")

    op.drop_index(op.f("ix_project_conversation_updated_at"), table_name="project_conversation")
    op.drop_index(op.f("ix_project_conversation_tenant_id"), table_name="project_conversation")
    op.drop_index(op.f("ix_project_conversation_project_id"), table_name="project_conversation")
    op.drop_index(op.f("ix_project_conversation_last_message_at"), table_name="project_conversation")
    op.drop_index(op.f("ix_project_conversation_created_by_id"), table_name="project_conversation")
    op.drop_index(op.f("ix_project_conversation_creator_group_id"), table_name="project_conversation")
    op.drop_index(op.f("ix_project_conversation_created_at"), table_name="project_conversation")
    op.drop_table("project_conversation")
