"""
DeepgramManager — application-level singleton for Deepgram connections.

STT: No longer uses a WebSocket. Audio is buffered in memory and sent
     to Deepgram's REST API on demand (when the user clicks Done).

TTS: Still uses a persistent WebSocket for streaming text-to-speech.
"""

import asyncio
import json
import logging
import time
from typing import Callable, Awaitable

from app import deepgram
from app.settings import settings

logger = logging.getLogger(__name__)

# Type aliases
TTSHandler = Callable[[bytes], Awaitable[None]]

_RECONNECT_DELAY = 3.0  # seconds between TTS reconnect attempts
_ERROR_LOG_INTERVAL = 5.0  # seconds — throttle repeated error logs


class DeepgramManager:
    def __init__(self) -> None:
        self._tts_ws = None

        # Set when TTS connection is established; cleared on disconnect.
        self._tts_ready: asyncio.Event = asyncio.Event()

        # Per-session TTS callback — None when no interview is running.
        self._tts_handler: TTSHandler | None = None

        # Gate: only buffer audio when an interview is live.
        self._session_active: bool = False

        # Audio buffer: collects PCM chunks from the frontend mic.
        # Consumed and cleared when the user clicks Done.
        self._audio_buffer: list[bytes] = []

        # Throttle repeated error logs so we don't flood the console.
        self._last_fwd_error_log: float = 0.0

        # TTS generation counter: incremented every attach_session().
        self._tts_generation: int = 0

    # ──────────────────────────────────────────────────────────────
    #  Startup
    # ──────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Kick off the persistent TTS connection loop. Call once on app startup."""
        asyncio.create_task(self._tts_loop(), name="deepgram-tts-loop")
        logger.info("[DeepgramManager] TTS connection task started. STT uses REST API (no persistent connection).")

    # ──────────────────────────────────────────────────────────────
    #  TTS loop (unchanged)
    # ──────────────────────────────────────────────────────────────

    async def _tts_loop(self) -> None:
        if not settings.deepgram_tts_api_key:
            logger.warning("[DeepgramManager] DEEPGRAM_TTS_API_KEY not set — TTS disabled.")
            return

        while True:
            try:
                logger.info("[DeepgramManager] Connecting to Deepgram TTS...")
                async with await deepgram.connect_tts_websocket(
                    deepgram.tts_url(),
                    deepgram.auth_headers(settings.deepgram_tts_api_key),
                ) as ws:
                    self._tts_ws = ws
                    self._tts_ready.set()
                    logger.info("[DeepgramManager] TTS connected.")

                    async for message in ws:
                        if isinstance(message, bytes):
                            gen = self._tts_generation
                            handler = self._tts_handler
                            if handler and gen == self._tts_generation:
                                await handler(message)
                        else:
                            payload = deepgram.parse_json_message(message)
                            if payload and payload.get("type") not in {"Metadata", "Flushed"}:
                                logger.debug("[TTS] Event: %s", payload)

            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("[DeepgramManager] TTS lost: %s. Reconnecting in %.0fs.", exc, _RECONNECT_DELAY)
            finally:
                self._tts_ws = None
                self._tts_ready.clear()

            await asyncio.sleep(_RECONNECT_DELAY)

    # ──────────────────────────────────────────────────────────────
    #  Session lifecycle
    # ──────────────────────────────────────────────────────────────

    def attach_session(self, tts_handler: TTSHandler) -> None:
        """Register TTS callback and enable audio buffering."""
        self._tts_generation += 1
        self._tts_handler = tts_handler
        self._session_active = True
        self._audio_buffer.clear()
        logger.info("[DeepgramManager] Session attached (tts_gen=%d) — audio buffering ENABLED.",
                    self._tts_generation)

    def stop_audio_input(self) -> None:
        """Stop buffering mic audio. TTS handler stays alive for closing statement."""
        self._session_active = False
        logger.info("[DeepgramManager] Audio buffering stopped. TTS routing still active.")

    def detach_session(self) -> None:
        """Fully unregister per-session callbacks and stop all audio."""
        self._session_active = False
        self._tts_handler = None
        self._tts_generation += 1
        self._audio_buffer.clear()

        # Tell Deepgram TTS to discard any queued audio
        if self._tts_ws is not None:
            try:
                asyncio.create_task(self._send_tts_clear())
            except RuntimeError:
                pass  # no event loop

        logger.info("[DeepgramManager] Session fully detached — audio buffering + TTS DISABLED (tts_gen=%d).",
                    self._tts_generation)

    async def _send_tts_clear(self) -> None:
        """Send Clear command to Deepgram TTS to flush its internal buffer."""
        try:
            if self._tts_ws is not None:
                await self._tts_ws.send(json.dumps({"type": "Clear"}))
                logger.info("[DeepgramManager] TTS Clear command sent.")
        except Exception as exc:
            logger.debug("[DeepgramManager] TTS Clear failed: %s", exc)

    # ──────────────────────────────────────────────────────────────
    #  Audio buffering (replaces forward_audio)
    # ──────────────────────────────────────────────────────────────

    def buffer_audio(self, audio: bytes) -> None:
        """Buffer mic audio chunk. No-op when no session is active."""
        if self._session_active:
            self._audio_buffer.append(audio)

    def consume_audio(self) -> bytes:
        """Return all buffered audio as a single bytes object and clear the buffer."""
        if not self._audio_buffer:
            return b""
        result = b"".join(self._audio_buffer)
        self._audio_buffer.clear()
        logger.info("[DeepgramManager] Consumed %d bytes of buffered audio.", len(result))
        return result

    def has_audio(self) -> bool:
        """Check if any audio has been buffered."""
        return bool(self._audio_buffer)

    # ──────────────────────────────────────────────────────────────
    #  TTS I/O
    # ──────────────────────────────────────────────────────────────

    async def speak(self, text: str) -> None:
        """Send text to Deepgram TTS for immediate synthesis (Speak + Flush)."""
        if self._tts_ws is None:
            logger.warning("[DeepgramManager] TTS not connected — text lost: %s", text[:60])
            return
        try:
            await self._tts_ws.send(json.dumps({"type": "Speak", "text": text}))
            await self._tts_ws.send(json.dumps({"type": "Flush"}))
        except Exception as exc:
            logger.warning("[DeepgramManager] Failed to speak: %s", exc)

    async def queue_text(self, text: str) -> None:
        """Queue text for TTS without triggering synthesis yet."""
        if self._tts_ws is None:
            logger.warning("[DeepgramManager] TTS not connected — text lost: %s", text[:60])
            return
        try:
            await self._tts_ws.send(json.dumps({"type": "Speak", "text": text}))
        except Exception as exc:
            logger.warning("[DeepgramManager] Failed to queue TTS text: %s", exc)

    async def flush_tts(self) -> None:
        """Trigger synthesis of all previously queued Speak text."""
        if self._tts_ws is None:
            return
        try:
            await self._tts_ws.send(json.dumps({"type": "Flush"}))
        except Exception as exc:
            logger.warning("[DeepgramManager] Failed to flush TTS: %s", exc)

    async def wait_until_ready(self, timeout: float = 10.0) -> bool:
        """Wait until TTS is connected. Returns True if ready."""
        try:
            await asyncio.wait_for(self._tts_ready.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            logger.warning("[DeepgramManager] Timed out waiting for TTS (%.0fs).", timeout)
            return False

    @property
    def tts_ready(self) -> bool:
        return self._tts_ws is not None


# Module-level singleton
deepgram_manager = DeepgramManager()
