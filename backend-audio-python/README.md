# Python Audio Bridge

Drop-in Python replacement for the Java `backend-speech-to-text` module.

It keeps the same frontend protocol:

- WebSocket endpoint: `ws://localhost:8001/ws/audio-bridge`
- Browser audio frames: raw `linear16` PCM bytes at 16 kHz
- Frontend control messages:
  - `{"type":"interview_config", ...}`
  - `{"type":"response_complete"}`
  - `{"type":"end_interview"}`
- Server messages:
  - `session_id`
  - `deepgram_ready`
  - `ai_response`
  - `ai_eot`
  - `evaluation`
- TTS audio frames are binary and prefixed with `0x01`, matching the current frontend worklet.

## Setup

```powershell
cd D:\Project\backend\backend-audio-python
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Fill `.env` with your Deepgram keys. The LLM module should be running on `localhost:9090`.

## Run

Stop the Java `backend-speech-to-text` service first, because this Python bridge uses the same port.

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Then start the existing frontend without changing its URLs.

If you installed the dependencies into the local venv, run:

```powershell
.\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8001
```

## Notes

- This service uses Deepgram Flux STT over `/v2/listen`.
- This service uses Deepgram streaming TTS over `/v1/speak`.
- gRPC Python stubs are generated at startup from `proto/interview.proto` if they are missing.
