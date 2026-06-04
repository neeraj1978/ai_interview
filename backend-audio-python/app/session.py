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
from app.timer_sync import timer_sync

interview_pb2, interview_pb2_grpc = load_grpc_modules()


@dataclass
class InterviewConfig:
    subject: str = "General"
    subtopic: str = "General"
    difficulty: str = "Medium"
    time_minutes: int = 10
    candidate_name: str = ""

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "InterviewConfig":
        try:
            time_minutes = int(payload.get("time") or 10)
        except (TypeError, ValueError):
            time_minutes = 10

        return cls(
            subject=str(payload.get("subject") or "General"),
            subtopic=str(payload.get("subtopic") or "General"),
            difficulty=str(payload.get("difficulty") or "Medium"),
            time_minutes=time_minutes,
            candidate_name=str(payload.get("candidateName") or ""),
        )


class AudioBridgeSession:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.session_id = uuid.uuid4().hex
        self.config = InterviewConfig()

        self.grpc_channel: grpc.aio.Channel | None = None
        self.grpc_stub = None
        self.grpc_requests: asyncio.Queue[Any] = asyncio.Queue()
        self.grpc_response_task: asyncio.Task | None = None
        self.current_response_done: asyncio.Event | None = None

        # stt_ws / tts_ws are now owned by DeepgramManager.
        # These attributes are kept as None stubs so any legacy guard checks
        # (e.g. if self.stt_ws) remain non-breaking.
        self.stt_ws = None
        self.tts_ws = None

        self.background_tasks: set[asyncio.Task] = set()

        self.tts_text_buffer: list[str] = []
        self.tts_chars_queued: int = 0
        self.tts_first_flush_done: bool = False
        self.cleanup_started = False
        self.config_received = False

        # C1 FIX: closing_done is set ONLY when closing_statement_requested=True.
        # This flag is armed just before the flush/sentinel that causes the LLM to
        # emit its closing statement, preventing any earlier [EOT] from
        # prematurely signalling that the closing message was delivered.
        self.closing_done: asyncio.Event = asyncio.Event()
        self.closing_statement_requested: bool = False
        # True once frontend sends {type:"timer_expired"} or end_interview.
        self.timer_expired_signaled: bool = False

        # H1 FIX: countdown starts after the AI's first [EOT] (greeting done),
        # not at config-receive time, so no interview time is lost to warm-up lag.
        self.timer_started: bool = False

    async def run(self) -> None:
        await self.websocket.accept()
        print("Frontend connected to Python audio bridge. Waiting for interview_config...")

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
            print("Frontend disconnected from Python audio bridge.")
        finally:
            await self.cleanup(unexpected=True)

    async def handle_text(self, raw_payload: str) -> None:
        try:
            payload = json.loads(raw_payload)
        except json.JSONDecodeError:
            print(f"[Text] Non-JSON message ignored: {raw_payload[:100]}")
            return

        message_type = payload.get("type", "")
        if message_type == "interview_config":
            await self.handle_interview_config(payload)
        elif message_type == "response_complete":
            await self.handle_response_complete(payload)
        elif message_type == "timer_expired":
            await self.handle_timer_expired_signal()
        elif message_type == "end_interview":
            await self.handle_timer_expired_signal()
        else:
            print(f"[Text] Unknown control message: {raw_payload[:200]}")

    async def handle_interview_config(self, payload: dict[str, Any]) -> None:
        if self.config_received:
            print("[interview_config] Duplicate config ignored.")
            return

        self.config_received = True
        self.config = InterviewConfig.from_payload(payload)
        print(
            "[interview_config] "
            f"subject={self.config.subject}, subtopic={self.config.subtopic}, "
            f"difficulty={self.config.difficulty}, time={self.config.time_minutes}, "
            f"candidate={self.config.candidate_name}"
        )

        await self.send_json({"type": "session_id", "sessionId": self.session_id})

        deepgram_manager.attach_session(
            tts_handler=self._on_tts_audio,
        )
        await self.send_json({"type": "deepgram_ready"})
        print("[DeepgramManager] Session attached — TTS active, STT via REST API.")

        await self.start_grpc_stream()

        await self.send_user_speech("")
        print("[gRPC] Config message sent to LLM module. AI warm-up streaming...")

    async def handle_audio(self, audio: bytes) -> None:
        deepgram_manager.buffer_audio(audio)

    async def handle_response_complete(self, payload: dict[str, Any] = None) -> None:
        if payload is None:
            payload = {}
        code_content = payload.get("codeContent", "")
        # Collect buffered audio and transcribe via REST API
        audio_data = deepgram_manager.consume_audio()
        if not audio_data:
            if self.timer_expired_signaled and not self.cleanup_started:
                print("[response_complete] No audio but timer expired. Forcing closing.")
                self.spawn(self._final_answer_then_cleanup(code_content or "[End Session triggered early.]"))
                return
            else:
                print("[response_complete] No audio buffered, skipping.")
                await self.send_json({"type": "transcript_empty"})
                return

        print(f"[response_complete] Transcribing {len(audio_data)} bytes via REST API...")
        await self.send_json({"type": "transcribing"})
        accumulated_text = await deepgram.transcribe_audio(audio_data)

        if code_content:
            accumulated_text = f"{accumulated_text}\n\n[Code Context]:\n{code_content}"

        if self.timer_expired_signaled and not self.cleanup_started:
            if accumulated_text:
                await self.send_json({"type": "user_transcript", "text": accumulated_text})
            self.spawn(self._final_answer_then_cleanup(accumulated_text))
            return

        if not accumulated_text:
            print("[response_complete] REST API returned empty transcript. Substituting fallback.")
            accumulated_text = "[No audio detected. Please proceed to the next question.]"

        await self.send_json({"type": "user_transcript", "text": accumulated_text})
        print(f"[response_complete] Sending transcript to LLM: {accumulated_text}")
        self.current_response_done = asyncio.Event()
        await self.send_user_speech(accumulated_text)

    async def handle_end_interview(self) -> None:
        """Kept for backward-compat."""
        await self.handle_timer_expired_signal()

    async def handle_timer_expired_signal(self) -> None:
        """Timer reached zero. Just set the flag — nothing else.

        The interview keeps flowing normally. The user will click Done when
        they finish their last answer. handle_response_complete() detects
        timer_expired_signaled and runs _final_answer_then_cleanup().
        """
        if self.timer_expired_signaled:
            return
        self.timer_expired_signaled = True
        print("[timer_expired] Timer reached zero. Waiting for user to click Done.")

    async def _final_answer_then_cleanup(self, final_text: str) -> None:
        """End-of-interview sequence: last answer → LLM ack → TTS drain → cleanup.

        Called as a background task from handle_response_complete when the user
        clicks Done after the timer has reached zero.
        """
        # Stop mic audio forwarding (no more STT needed). TTS stays alive so
        # the closing ack can be heard.
        deepgram_manager.stop_audio_input()

        # Arm the flag so the next [EOT] sets closing_done.
        self.closing_statement_requested = True

        if final_text:
            print(f"[final] Sending last answer to LLM: {final_text}")
            self.current_response_done = asyncio.Event()
            await self.send_user_speech(final_text)
        else:
            print("[final] No answer buffered. Sending sentinel for closing ack.")
            self.current_response_done = asyncio.Event()
            await self.send_user_speech("__INTERVIEW_ENDED__")

        # Wait for the LLM's closing acknowledgement [EOT]
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(self.closing_done.wait(), timeout=20)

        if self.closing_done.is_set():
            print("[final] Closing ack received. Letting TTS finish...")
            await asyncio.sleep(4)
        else:
            print("[final] Closing ack timed out — proceeding to evaluation.")

        # Run cleanup: gRPC close → evaluation → send report to frontend
        await self.cleanup(unexpected=False)

    async def start_grpc_stream(self) -> None:
        self.grpc_channel = grpc.aio.insecure_channel(settings.llm_target)
        self.grpc_stub = interview_pb2_grpc.InterviewServiceStub(self.grpc_channel)
        self.grpc_response_task = self.spawn(self.consume_grpc_responses())

    async def grpc_request_iterator(self):
        while True:
            item = await self.grpc_requests.get()
            if item is None:
                return
            yield item

    async def consume_grpc_responses(self) -> None:
        try:
            response_stream = self.grpc_stub.ChatStream(self.grpc_request_iterator())
            async for response in response_stream:
                await self.handle_ai_response(response.text)
            print("gRPC stream completed. Fetching final evaluation...")
            await self.fetch_evaluation()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"gRPC error: {exc}")

    async def handle_ai_response(self, text: str) -> None:
        if text == "[EOT]":
            print("[AI] End-of-turn received.")
            await self.flush_tts_buffer()
            await self.send_json({"type": "ai_eot"})
            if self.current_response_done is not None:
                self.current_response_done.set()
            if not self.timer_started and self.config.time_minutes > 0:
                self.timer_started = True
                await timer_sync.start_countdown(self.config.time_minutes * 60)
                print(f"[timer] Countdown started: {self.config.time_minutes} minutes.")
            if self.closing_statement_requested:
                self.closing_done.set()
            return

        print(f"[AI] {text}")
        await self.send_json({"type": "ai_response", "text": text})
        await self.accumulate_and_speak_sentence(text)

    async def send_user_speech(self, text: str) -> None:
        speech = interview_pb2.UserSpeech(
            session_id=self.session_id,
            text=text,
            subject=self.config.subject,
            subtopic=self.config.subtopic,
            difficulty=self.config.difficulty,
            time_minutes=self.config.time_minutes,
            candidate_name=self.config.candidate_name,
        )
        await self.grpc_requests.put(speech)

    async def fetch_evaluation(self) -> None:
        if self.grpc_stub is None:
            return
        try:
            request = interview_pb2.SessionId(id=self.session_id)
            report = await self.grpc_stub.GetEvaluation(request)
            json_report = report.json_report or "{}"
            print("--- RECEIVED EVALUATION REPORT ---")
            print(json_report)
            try:
                parsed = json.loads(json_report)
            except json.JSONDecodeError:
                parsed = {"error": "Invalid evaluation JSON", "raw": json_report}
            await self.send_json({"type": "evaluation", "data": parsed})
        except Exception as exc:
            print(f"Failed to fetch evaluation: {exc}")


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
        text = re.sub(r'```\w*\n?', '', text)
        text = text.replace("**", "").replace("__", "")
        text = text.replace("`", "")
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
        """Send text to Deepgram TTS via the persistent manager."""
        await deepgram_manager.speak(text)

    async def _on_tts_audio(self, pcm: bytes) -> None:
        """Called by DeepgramManager when Deepgram TTS sends back PCM audio."""
        await self.send_tts_audio(pcm)


    async def send_tts_audio(self, pcm: bytes) -> None:
        await self.send_bytes(settings.frontend_tts_prefix + pcm)

    async def cleanup(self, unexpected: bool) -> None:
        if self.cleanup_started:
            return
        self.cleanup_started = True

        if unexpected:
            print("[cleanup] Unexpected disconnect. Performing fallback cleanup...")

        # ── Step 1: Wait for any currently-streaming AI response to finish ──
        if self.current_response_done is not None:
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self.current_response_done.wait(), timeout=30)

        # ── Step 2: Stop audio buffering — TTS handler stays alive ──
        deepgram_manager.stop_audio_input()

        # ── Step 3: Transcribe any remaining buffered audio ──
        audio_data = deepgram_manager.consume_audio()
        remaining_text = ""
        if audio_data:
            print(f"[cleanup] Transcribing {len(audio_data)} bytes of remaining audio...")
            remaining_text = await deepgram.transcribe_audio(audio_data)

        if self.grpc_stub is not None:
            if remaining_text:
                # C1 FIX: Arm closing_statement_requested BEFORE the flush send.
                # When timer_expired_signaled=True the LLM will respond to this
                # transcript with the closing statement (timerExpired check in
                # onNext). The next [EOT] IS the closing statement's EOT.
                print(f"[shutdown] Flushing remaining transcript: {remaining_text}")
                self.closing_statement_requested = True
                self.current_response_done = asyncio.Event()
                await self.send_user_speech(remaining_text)
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(self.current_response_done.wait(), timeout=30)

            # ── Step 5: Guarantee the closing acknowledgement ──
            # By the time we reach here, _grace_period_then_cleanup already waited
            # for any Done-click LLM response, so no extra wait is needed.
            if not self.closing_done.is_set():
                print("[shutdown] Sending __INTERVIEW_ENDED__ sentinel to trigger closing statement.")
                # C1 FIX: Arm the flag before sending so the sentinel's [EOT] sets closing_done.
                self.closing_statement_requested = True
                # H5 FIX: Use a local sentinel_event so overwriting current_response_done
                # doesn't affect any concurrent waiter referencing the old event.
                sentinel_event = asyncio.Event()
                self.current_response_done = sentinel_event
                await self.send_user_speech("__INTERVIEW_ENDED__")
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(self.closing_done.wait(), timeout=20)
                if not self.closing_done.is_set():
                    print("[shutdown] Closing statement timed out — proceeding to evaluation.")
                else:
                    # Give Deepgram TTS time to finish streaming audio bytes.
                    # [EOT] arrives at LLM token level; audio bytes follow shortly.
                    await asyncio.sleep(4)

        # ── Step 5b: Now fully detach Deepgram (clears TTS handler) ──
        # MOVED TO END OF CLEANUP — see comment above.

        # ── Step 6: Stop the server-side countdown (resets timer on frontend) ──
        await timer_sync.stop()

        # ── Step 7: Close the gRPC client stream ──
        # Triggers onCompleted() in the LLM module → evaluation generation.
        if self.grpc_stub is not None:
            print("[shutdown] Completing gRPC client stream...")
            await self.grpc_requests.put(None)

        # ── Step 8: Wait for evaluation to arrive ──
        if self.grpc_response_task is not None:
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self.grpc_response_task, timeout=60)

        # Cancel remaining background tasks (e.g. connect_stt loop if still running).
        # IMPORTANT: exclude asyncio.current_task() — cleanup() is itself a background
        # task (spawned via self.spawn()). Cancelling the currently-running task would
        # cause asyncio to recurse into its own child cancellation chain and hit Python's
        # recursion limit (RecursionError after ~980 frames).
        # Also exclude grpc_response_task which was already awaited above.
        current = asyncio.current_task()
        for task in list(self.background_tasks):
            if not task.done() and task is not current and task is not self.grpc_response_task:
                task.cancel()
        other_tasks = [t for t in self.background_tasks if t is not current]
        if other_tasks:
            await asyncio.gather(*other_tasks, return_exceptions=True)


        if self.grpc_channel is not None:
            await self.grpc_channel.close()

        # ── Final: Fully detach Deepgram TTS handler ──
        # This is intentionally the LAST step. The [EOT] token from the LLM
        # arrives when token generation finishes, but Deepgram TTS continues
        # streaming synthesized audio bytes for several seconds after that.
        # Clearing _tts_handler here (after the gRPC channel is fully closed
        # and evaluation has been sent) guarantees ALL audio bytes reach the
        # frontend before we unregister the handler.
        deepgram_manager.detach_session()

        print("[cleanup] Complete.")


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
