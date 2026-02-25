from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse


router = APIRouter()


async def _stream_disabled_message() -> AsyncIterator[str]:
    message = (
        "El chat IA heredado de Supabase esta desactivado en modo DocInt-only. "
        "El flujo de escaneo de albaranes sigue operativo."
    )
    payload = {"choices": [{"delta": {"content": message}}]}
    yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/construction-chat")
async def construction_chat_disabled(_: dict[str, Any]) -> StreamingResponse:
    return StreamingResponse(_stream_disabled_message(), media_type="text/event-stream")
