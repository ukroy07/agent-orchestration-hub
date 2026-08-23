import json
import asyncio
from fastapi import WebSocket
from app.core.redis_client import redis_client


def _channel(task_id: str) -> str:
    return f"ws:task:{task_id}"


def _history_key(task_id: str) -> str:
    return f"ws:history:{task_id}"


async def stream_task_events(websocket: WebSocket, task_id: str) -> None:
    """Deliver every event for this task to the client, live ones included,
    regardless of when it connects relative to when the agents started.

    Order matters here: subscribe to the live channel FIRST, then read the
    history buffer. Reversing this order reopens the exact race it's meant to
    close - an event could be published after the history read but before the
    subscribe call, and be lost. Subscribing first means anything published
    from that instant onward is captured, even while still reading history;
    the two can then overlap in the window they cover, so live messages
    already accounted for by history are dropped by sequence number rather
    than replayed twice."""
    channel = _channel(task_id)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(channel)

    last_sent_sequence = 0
    try:
        history = await redis_client.lrange(_history_key(task_id), 0, -1)
        for raw in history:
            event = json.loads(raw)
            await websocket.send_text(raw)
            last_sent_sequence = max(last_sent_sequence, event.get("sequence", 0))

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            event = json.loads(message["data"])
            if event.get("sequence", 0) <= last_sent_sequence:
                continue  # already delivered via history replay
            await websocket.send_text(message["data"])
            last_sent_sequence = event.get("sequence", last_sent_sequence)
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()


async def run_stream_with_receive_loop(websocket: WebSocket, task_id: str, on_client_message) -> None:
    """Runs the outbound Redis->client stream and the inbound client->server
    receive loop concurrently. Whichever ends first (usually a disconnect)
    cancels the other cleanly."""
    stream_task = asyncio.create_task(stream_task_events(websocket, task_id))

    async def receive_loop():
        while True:
            data = await websocket.receive_text()
            await on_client_message(data)

    receive_task = asyncio.create_task(receive_loop())

    done, pending = await asyncio.wait({stream_task, receive_task}, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()
    for task in done:
        exc = task.exception()
        if exc and not isinstance(exc, asyncio.CancelledError):
            raise exc
