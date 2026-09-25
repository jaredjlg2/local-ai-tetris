"""Private stdin/stdout bridge to the official Von SDK; no HTTP or cloud calls."""
import contextlib
import json
import os
from pathlib import Path
import sys
import traceback

ROOT = Path(__file__).parent
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

def send(value):
    print(json.dumps(value, allow_nan=False), flush=True)

try:
    send({"type": "status", "status": {"state": "loading", "message": "Loading local Von…"}})
    with contextlib.redirect_stdout(sys.stderr):
        import torch
        from von.backends.option_marker_backend import OptionMarkerBackend
        config = json.loads((ROOT / "von-runtime-config.json").read_text())
        torch.set_num_threads(config["threads"])
        torch.set_num_interop_threads(1)
        device = config["device"]
        backend = OptionMarkerBackend(checkpoint_dir=str(ROOT / "models" / "von-1.2"), device=device)
        def warm_model():
            for example in json.loads((ROOT / "von-warmup.json").read_text()):
                result = backend.evaluate(example["state"], example["questions"]).model_dump()
                json.dumps(result, allow_nan=False)
        try:
            warm_model()
        except Exception:
            if device == "cpu":
                raise
            traceback.print_exc(file=sys.stderr)
            device = "cpu"
            backend = OptionMarkerBackend(checkpoint_dir=str(ROOT / "models" / "von-1.2"), device=device)
            warm_model()
        description = "Von · OpenVINO Intel GPU · local" if device == "openvino:gpu" else f"Von · {device} · local"
    send({"type": "status", "status": {"state": "ready", "message": "Local Von ready · " + ("Intel GPU" if device == "openvino:gpu" else device), "model": "von-1.2.0", "backend": description, "device": "INTEL GPU" if device == "openvino:gpu" else device.upper()}})
    for line in sys.stdin:
        try:
            request = json.loads(line)
            with contextlib.redirect_stdout(sys.stderr):
                result = backend.evaluate(request["state"], request["questions"]).model_dump()
            result["backend"] = description
            send({"result": result})
        except Exception as error:
            send({"error": str(error)})
except Exception as error:
    traceback.print_exc(file=sys.stderr)
    send({"type": "status", "status": {"state": "error", "message": f"Von could not load: {error}"}})
