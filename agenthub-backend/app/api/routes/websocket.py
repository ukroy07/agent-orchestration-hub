import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from loguru import logger
from app.core.security import decode_token
from app.services.connection_manager import run_stream_with_receive_loop
from app.services.agent_service import send_human_override

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{task_id}")
async def task_websocket(websocket: WebSocket, task_id: str, token: str = Query(...)):
    # Browsers can't attach custom Authorization headers to a WebSocket
    # handshake, so the access token travels as a query param instead. It's
    # short-lived (ACCESS_TOKEN_EXPIRE_MINUTES) which limits the exposure.
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
    except ValueError:
        logger.bind(agent="system").warning("ws rejected for task {} - bad token", task_id[:8])
        await websocket.close(code=4001)
        return

    await websocket.accept()
    logger.bind(agent="system").info("ws connected to task {}", task_id[:8])

    async def on_client_message(raw: str):
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            return
        if message.get("type") == "override":
            await send_human_override(task_id, message.get("instruction", ""), message.get("target_agent"))

    try:
        await run_stream_with_receive_loop(websocket, task_id, on_client_message)
    except WebSocketDisconnect:
        logger.bind(agent="system").info("ws disconnected from task {}", task_id[:8])
