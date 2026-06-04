"""
TimerSync — server-driven countdown timer broadcast over WebSocket.

A single TimerSync instance is shared at application level. When an interview
session starts, the audio bridge calls start_countdown(). Every second the
remaining time is broadcast to ALL connected /ws/timer clients (just the
frontend). The frontend drives its display entirely from these ticks, giving
a single source of truth that never drifts from the backend.

When the countdown reaches zero, a {"type":"timer_expired"} event is broadcast.
The frontend catches this and calls endInterview(), closing the visual-analysis
WebSocket and sending {"type":"timer_expired"} to the audio bridge.
"""

import asyncio
import json
import logging
from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)


class TimerSync:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._task: asyncio.Task | None = None
        self._remaining: int = 0

    # ──────────────────────────────────────────────────────────────
    #  Client management
    # ──────────────────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and track a timer WebSocket client until it disconnects."""
        await websocket.accept()
        self._clients.add(websocket)
        logger.info("[TimerSync] Client connected (%d total).", len(self._clients))

        # Send the current remaining time immediately so the client syncs fast.
        if self._remaining > 0:
            await self._send_one(websocket, {"type": "timer_tick", "remaining": self._remaining})

        try:
            # Block here until the client disconnects (we only read, never write
            # from client→server on this channel).
            while True:
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
        except Exception:
            pass
        finally:
            self._clients.discard(websocket)
            logger.info("[TimerSync] Client disconnected (%d remaining).", len(self._clients))

    # ──────────────────────────────────────────────────────────────
    #  Countdown control
    # ──────────────────────────────────────────────────────────────

    async def start_countdown(self, total_seconds: int) -> None:
        """Start (or restart) the countdown. Call when an interview session begins."""
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        self._remaining = total_seconds
        self._task = asyncio.create_task(
            self._run(total_seconds), name="timer-sync-countdown"
        )
        logger.info("[TimerSync] Countdown started: %d s.", total_seconds)

    async def stop(self) -> None:
        """Stop the countdown (called at session cleanup). Does NOT close clients."""
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._remaining = 0
        self._task = None
        await self._broadcast({"type": "timer_reset"})
        logger.info("[TimerSync] Countdown stopped.")

    # ──────────────────────────────────────────────────────────────
    #  Internal
    # ──────────────────────────────────────────────────────────────

    async def _run(self, total: int) -> None:
        for remaining in range(total, -1, -1):
            self._remaining = remaining
            await self._broadcast({"type": "timer_tick", "remaining": remaining})
            if remaining == 0:
                await self._broadcast({"type": "timer_expired"})
                logger.info("[TimerSync] Timer expired.")
                break
            await asyncio.sleep(1.0)

    async def _broadcast(self, msg: dict) -> None:
        dead: set[WebSocket] = set()
        payload = json.dumps(msg)
        for ws in list(self._clients):
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self._clients -= dead

    @staticmethod
    async def _send_one(ws: WebSocket, msg: dict) -> None:
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            pass


# Module-level singleton — shared by main.py (endpoint) and session.py (start/stop)
timer_sync = TimerSync()
