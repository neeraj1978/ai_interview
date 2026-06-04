import importlib
import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
PROTO_PATH = ROOT / "proto" / "interview.proto"
GENERATED_DIR = ROOT / "generated"


def _ensure_generated() -> None:
    GENERATED_DIR.mkdir(exist_ok=True)
    pb2 = GENERATED_DIR / "interview_pb2.py"
    pb2_grpc = GENERATED_DIR / "interview_pb2_grpc.py"
    if pb2.exists() and pb2_grpc.exists():
        return

    try:
        from grpc_tools import protoc
    except ImportError as exc:
        raise RuntimeError(
            "grpcio-tools is required to generate gRPC stubs. "
            "Run `pip install -r requirements.txt`."
        ) from exc

    result = protoc.main(
        [
            "grpc_tools.protoc",
            f"-I{PROTO_PATH.parent}",
            f"--python_out={GENERATED_DIR}",
            f"--grpc_python_out={GENERATED_DIR}",
            str(PROTO_PATH),
        ]
    )
    if result != 0:
        raise RuntimeError(f"Failed to generate Python gRPC stubs from {PROTO_PATH}")


def load_grpc_modules():
    _ensure_generated()
    generated_path = str(GENERATED_DIR)
    if generated_path not in sys.path:
        sys.path.insert(0, generated_path)
    return (
        importlib.import_module("interview_pb2"),
        importlib.import_module("interview_pb2_grpc"),
    )
