import asyncio
import json
import logging
import urllib.request
from typing import Any
from urllib.parse import urlencode

import websockets

from app.settings import settings

logger = logging.getLogger(__name__)

DEEPGRAM_STT_REST_URL = "https://api.deepgram.com/v1/listen"
DEEPGRAM_TTS_URL = "wss://api.deepgram.com/v1/speak"


# ──────────────────────────────────────────────────────────────
#  STT — REST API (pre-recorded audio)
# ──────────────────────────────────────────────────────────────

async def transcribe_audio(audio_bytes: bytes) -> str:
    """Send buffered PCM audio to Deepgram REST API and return the transcript.

    Runs the blocking HTTP call in a thread executor so it doesn't
    block the asyncio event loop.
    """
    if not audio_bytes:
        return ""

    query = {
        "model": settings.stt_model_rest,
        "encoding": settings.stt_encoding,
        "sample_rate": str(settings.stt_sample_rate),
        "punctuate": "true",
        "smart_format": "true",
    }
    url = f"{DEEPGRAM_STT_REST_URL}?{urlencode(query)}"

    def _blocking_request() -> str:
        req = urllib.request.Request(
            url,
            data=audio_bytes,
            headers={
                "Authorization": f"Token {settings.deepgram_stt_api_key}",
                "Content-Type": f"audio/{settings.stt_encoding}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode())
                # Extract transcript from Deepgram response
                channels = body.get("results", {}).get("channels", [])
                if channels:
                    alternatives = channels[0].get("alternatives", [])
                    if alternatives:
                        transcript = alternatives[0].get("transcript", "")
                        logger.info("[Deepgram REST] Transcript: %s", transcript[:100])
                        return transcript
                logger.warning("[Deepgram REST] No transcript in response: %s", json.dumps(body)[:200])
                return ""
        except Exception as exc:
            logger.error("[Deepgram REST] Transcription failed: %s", exc)
            return ""

    # Run in thread pool to avoid blocking the event loop
    return await asyncio.get_event_loop().run_in_executor(None, _blocking_request)


# ──────────────────────────────────────────────────────────────
#  TTS — WebSocket (streaming, kept as-is)
# ──────────────────────────────────────────────────────────────

async def connect_tts_websocket(url: str, headers: dict[str, str]):
    """Connect to Deepgram TTS WebSocket with generous ping timeout."""
    try:
        return await websockets.connect(
            url,
            additional_headers=headers,
            ping_interval=20,
            ping_timeout=120,
            max_size=None,
        )
    except TypeError:
        return await websockets.connect(
            url,
            extra_headers=headers,
            ping_interval=20,
            ping_timeout=120,
            max_size=None,
        )


def auth_headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Token {api_key}"}


def tts_url() -> str:
    query = {
        "model": settings.tts_model,
        "encoding": settings.tts_encoding,
        "sample_rate": str(settings.tts_sample_rate),
    }
    return f"{DEEPGRAM_TTS_URL}?{urlencode(query)}"


def parse_json_message(message: Any) -> dict[str, Any] | None:
    if not isinstance(message, str):
        return None
    try:
        return json.loads(message)
    except json.JSONDecodeError:
        return None
