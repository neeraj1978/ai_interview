import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_int(name: str, default: int) -> int:
    value = _env(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    deepgram_stt_api_key: str = _env("DEEPGRAM_STT_API_KEY") or _env("apiKey")
    deepgram_tts_api_key: str = _env("DEEPGRAM_TTS_API_KEY") or _env("apiKey2")

    llm_grpc_host: str = _env("LLM_GRPC_HOST", "localhost")
    llm_grpc_port: int = _env_int("LLM_GRPC_PORT", 9090)

    stt_model: str = _env("DEEPGRAM_STT_MODEL", "flux-general-en")
    stt_model_rest: str = _env("DEEPGRAM_STT_MODEL_REST", "nova-2")
    stt_encoding: str = _env("DEEPGRAM_STT_ENCODING", "linear16")
    stt_sample_rate: int = _env_int("DEEPGRAM_STT_SAMPLE_RATE", 16000)
    stt_eot_threshold: str = _env("DEEPGRAM_STT_EOT_THRESHOLD", "0.7")
    stt_eot_timeout_ms: int = _env_int("DEEPGRAM_STT_EOT_TIMEOUT_MS", 5000)

    tts_model: str = _env("DEEPGRAM_TTS_MODEL", "aura-2-asteria-en")
    tts_encoding: str = _env("DEEPGRAM_TTS_ENCODING", "linear16")
    tts_sample_rate: int = _env_int("DEEPGRAM_TTS_SAMPLE_RATE", 24000)

    frontend_tts_prefix: bytes = b"\x01"

    @property
    def llm_target(self) -> str:
        return f"{self.llm_grpc_host}:{self.llm_grpc_port}"


settings = Settings()
