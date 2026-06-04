"""
GuidanceBridgeSession — WebSocket ↔ gRPC bridge for Guidance (Teacher) mode.

Mirrors AudioBridgeSession but much simpler:
- No timer (no TimerSync integration)
- No evaluation (no GetEvaluation RPC)
- No closing statement protocol
- No body-language coordination

Lifecycle:
1. Frontend connects → sends {type: "guidance_config", subject, subtopic}
2. Session opens gRPC GuidanceStream to LLM module
3. User speaks → Deepgram STT → transcript buffered
4. User clicks "Done" → buffered transcript sent to LLM via gRPC
5. LLM streams teacher response → TTS → frontend
6. User clicks "End Session" → clean shutdown
"""

import asyncio
import contextlib
import json
import uuid
from dataclasses import dataclass
from typing import Any

import grpc
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app import deepgram
from app.deepgram_manager import deepgram_manager
from app.grpc_generated import load_grpc_modules
from app.settings import settings

interview_pb2, interview_pb2_grpc = load_grpc_modules()


@dataclass
class GuidanceConfig:
    subject: str = "General"
    subtopic: str = "General"

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "GuidanceConfig":
        return cls(
            subject=str(payload.get("subject") or "General"),
            subtopic=str(payload.get("subtopic") or "General"),
        )


class GuidanceBridgeSession:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.session_id = uuid.uuid4().hex
        self.config = GuidanceConfig()

        self.grpc_channel: grpc.aio.Channel | None = None
        self.grpc_stub = None
        self.grpc_requests: asyncio.Queue[Any] = asyncio.Queue()
        self.grpc_response_task: asyncio.Task | None = None
        self.current_response_done: asyncio.Event | None = None

        self.background_tasks: set[asyncio.Task] = set()
        self.tts_text_buffer: list[str] = []
        self.tts_chars_queued: int = 0
        self.tts_first_flush_done: bool = False
        self.cleanup_started = False
        self.config_received = False

    async def run(self) -> None:
        await self.websocket.accept()
        print("Frontend connected to Guidance bridge. Waiting for guidance_config...")

        try:
            while True:
                message = await self.websocket.receive()
                if message.get("type") == "websocket.disconnect":
                    break

                text = message.get("text")
                data = message.get("bytes")

                if text is not None:
                    await self.handle_text(text)
                elif data is not None:
                    await self.handle_audio(data)

        except WebSocketDisconnect:
            print("Frontend disconnected from Guidance bridge.")
        finally:
            await self.cleanup()

    async def handle_text(self, raw_payload: str) -> None:
        try:
            payload = json.loads(raw_payload)
        except json.JSONDecodeError:
            print(f"[Guidance] Non-JSON message ignored: {raw_payload[:100]}")
            return

        message_type = payload.get("type", "")
        if message_type == "guidance_config":
            await self.handle_guidance_config(payload)
        elif message_type == "response_complete":
            await self.handle_response_complete(payload)
        elif message_type == "end_session":
            await self.cleanup()
        else:
            print(f"[Guidance] Unknown control message: {raw_payload[:200]}")

    async def handle_guidance_config(self, payload: dict[str, Any]) -> None:
        if self.config_received:
            print("[guidance_config] Duplicate config ignored.")
            return

        self.config_received = True
        self.config = GuidanceConfig.from_payload(payload)
        print(
            f"[guidance_config] subject={self.config.subject}, "
            f"subtopic={self.config.subtopic}"
        )

        await self.send_json({"type": "session_id", "sessionId": self.session_id})

        deepgram_manager.attach_session(
            tts_handler=self._on_tts_audio,
        )
        await self.send_json({"type": "deepgram_ready"})
        print("[DeepgramManager] Session attached for guidance — TTS active, STT via REST API.")

        await self.start_grpc_stream()

        # Send empty text to trigger teacher greeting
        await self.send_guidance_message("")
        print("[gRPC] Config message sent to LLM module. Teacher greeting streaming...")

    async def handle_audio(self, audio: bytes) -> None:
        deepgram_manager.buffer_audio(audio)

    async def handle_response_complete(self, payload: dict[str, Any] = None) -> None:
        if payload is None:
            payload = {}
        code_content = payload.get("codeContent", "")
        # Collect buffered audio and transcribe via REST API
        audio_data = deepgram_manager.consume_audio()
        if not audio_data:
            print("[response_complete] No audio buffered, skipping.")
            await self.send_json({"type": "transcript_empty"})
            return

        print(f"[response_complete] Transcribing {len(audio_data)} bytes via REST API...")
        await self.send_json({"type": "transcribing"})
        accumulated_text = await deepgram.transcribe_audio(audio_data)

        if code_content:
            accumulated_text = f"{accumulated_text}\n\n[Code Context]:\n{code_content}"

        # Send the user's speech text to frontend for display
        await self.send_json({"type": "user_transcript", "text": accumulated_text})

        print(f"[response_complete] Sending question to teacher: {accumulated_text}")
        self.current_response_done = asyncio.Event()
        await self.send_guidance_message(accumulated_text)

    # ──────────────────────────────────────────────────────────────
    #  gRPC
    # ──────────────────────────────────────────────────────────────

    async def start_grpc_stream(self) -> None:
        self.grpc_channel = grpc.aio.insecure_channel(settings.llm_target)
        self.grpc_stub = interview_pb2_grpc.GuidanceServiceStub(self.grpc_channel)
        self.grpc_response_task = self.spawn(self.consume_grpc_responses())

    async def grpc_request_iterator(self):
        while True:
            item = await self.grpc_requests.get()
            if item is None:
                return
            yield item

    async def consume_grpc_responses(self) -> None:
        try:
            response_stream = self.grpc_stub.GuidanceStream(self.grpc_request_iterator())
            async for response in response_stream:
                await self.handle_ai_response(response.text)
            print("Guidance gRPC stream completed.")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"Guidance gRPC error: {exc}")

    async def handle_ai_response(self, text: str) -> None:
        if text == "[EOT]":
            print("[Teacher] End-of-turn received.")
            await self.flush_tts_buffer()
            await self.send_json({"type": "ai_eot"})
            if self.current_response_done is not None:
                self.current_response_done.set()
            return

        print(f"[Teacher] {text}")
        await self.send_json({"type": "ai_response", "text": text})
        await self.accumulate_and_speak_sentence(text)

    async def send_guidance_message(self, text: str) -> None:
        msg = interview_pb2.GuidanceMessage(
            session_id=self.session_id,
            text=text,
            subject=self.config.subject,
            subtopic=self.config.subtopic,
        )
        await self.grpc_requests.put(msg)


    # ──────────────────────────────────────────────────────────────
    #  TTS
    # ──────────────────────────────────────────────────────────────

    async def accumulate_and_speak_sentence(self, token: str) -> None:
        """
        Accumulate tokens and queue them to Deepgram TTS in batches.

        Strategy:
        - Queue text (Speak only) to Deepgram on each sentence boundary.
        - Only trigger synthesis (Flush) when enough text is batched,
          producing larger, smoother audio chunks.

        Flush triggers:
        1. First sentence boundary → immediate flush (low time-to-first-audio)
        2. Sentence boundary AND ≥200 chars queued since last flush
        3. Paragraph break (double-newline)
        4. Buffer overflow >300 chars (safety valve)
        """
        self.tts_text_buffer.append(token)
        current = "".join(self.tts_text_buffer)
        stripped = current.strip()

        if not stripped:
            return

        should_queue = False
        should_flush = False

        # 1. Sentence-ending punctuation → queue; flush if first or enough queued
        if stripped.endswith((".", "?", "!")):
            should_queue = True
            if not self.tts_first_flush_done or self.tts_chars_queued >= 200:
                should_flush = True
        # 2. Paragraph break → queue + flush
        elif "\n\n" in current:
            should_queue = True
            should_flush = True
        # 3. Large buffer overflow (safety valve)
        elif len(stripped) > 300:
            should_queue = True
            should_flush = True

        if should_queue:
            clean = self._clean_for_tts(stripped)
            if clean:
                await deepgram_manager.queue_text(clean)
                self.tts_chars_queued += len(clean)
            self.tts_text_buffer.clear()

            if should_flush:
                await deepgram_manager.flush_tts()
                self.tts_chars_queued = 0
                self.tts_first_flush_done = True

    @staticmethod
    def _clean_for_tts(text: str) -> str:
        """Strip markdown artifacts that sound bad in speech."""
        import re
        # Remove code fences
        text = re.sub(r'```\w*\n?', '', text)
        # Remove bold/italic markers
        text = text.replace("**", "").replace("__", "")
        # Remove inline code backticks
        text = text.replace("`", "")
        # Collapse whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    async def flush_tts_buffer(self) -> None:
        """Flush any remaining text on [EOT]. Uses Speak+Flush for the last chunk."""
        remaining = "".join(self.tts_text_buffer).strip()
        if remaining:
            clean = self._clean_for_tts(remaining)
            if clean:
                await deepgram_manager.speak(clean)
            self.tts_text_buffer.clear()
        elif self.tts_chars_queued > 0:
            # Text was queued via Speak but never Flushed — flush now
            await deepgram_manager.flush_tts()
        self.tts_chars_queued = 0
        self.tts_first_flush_done = False

    async def send_text_to_tts(self, text: str) -> None:
        await deepgram_manager.speak(text)

    async def _on_tts_audio(self, pcm: bytes) -> None:
        await self.send_tts_audio(pcm)

    async def send_tts_audio(self, pcm: bytes) -> None:
        await self.send_bytes(settings.frontend_tts_prefix + pcm)

    # ──────────────────────────────────────────────────────────────
    #  Cleanup
    # ──────────────────────────────────────────────────────────────

    async def cleanup(self) -> None:
        if self.cleanup_started:
            return
        self.cleanup_started = True

        print("[guidance-cleanup] Starting cleanup...")

        # Wait for any in-flight response
        if self.current_response_done is not None:
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self.current_response_done.wait(), timeout=15)

        # Give Deepgram a moment to deliver final transcript
        await asyncio.sleep(1.0)

        # Stop audio input and fully detach Deepgram
        deepgram_manager.stop_audio_input()
        deepgram_manager.detach_session()

        # Close gRPC stream
        if self.grpc_stub is not None:
            print("[guidance-cleanup] Completing gRPC client stream...")
            await self.grpc_requests.put(None)

        if self.grpc_response_task is not None:
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self.grpc_response_task, timeout=15)

        # Cancel background tasks
        current = asyncio.current_task()
        for task in list(self.background_tasks):
            if not task.done() and task is not current and task is not self.grpc_response_task:
                task.cancel()
        other_tasks = [t for t in self.background_tasks if t is not current]
        if other_tasks:
            await asyncio.gather(*other_tasks, return_exceptions=True)

        if self.grpc_channel is not None:
            await self.grpc_channel.close()

        # Notify frontend
        await self.send_json({"type": "session_ended"})

        print("[guidance-cleanup] Complete.")

    # ──────────────────────────────────────────────────────────────
    #  WebSocket helpers
    # ──────────────────────────────────────────────────────────────

    async def send_json(self, payload: dict[str, Any]) -> None:
        if self.websocket.client_state != WebSocketState.CONNECTED:
            return
        try:
            await self.websocket.send_text(json.dumps(payload))
        except Exception as exc:
            print(f"[WS] Failed to send JSON to frontend: {exc}")

    async def send_bytes(self, payload: bytes) -> None:
        if self.websocket.client_state != WebSocketState.CONNECTED:
            return
        try:
            await self.websocket.send_bytes(payload)
        except Exception as exc:
            print(f"[WS] Failed to send audio to frontend: {exc}")

    def spawn(self, coro) -> asyncio.Task:
        task = asyncio.create_task(coro)
        self.background_tasks.add(task)
        task.add_done_callback(self.background_tasks.discard)
        return task
