"""Download the official, pinned Von checkpoint for offline local inference."""
from pathlib import Path
import json
import urllib.request
import time

REVISION = "5df8185a4f2327ad0a7cd117cc4f701ac557b9ae"
MODEL_DIR = Path(__file__).parent / "models" / "von-1.2"
FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "marker_calibration.json", "model.safetensors", "option_marker.pt", "README.md"]
if __name__ == "__main__":
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        destination = MODEL_DIR / name
        if destination.exists():
            print(f"Already downloaded: {name}", flush=True)
            continue
        url = f"https://huggingface.co/wfzyx/von/resolve/{REVISION}/{name}"
        temporary = destination.with_suffix(destination.suffix + ".partial")
        with urllib.request.urlopen(url, timeout=120) as response, temporary.open("wb") as output:
            received, last = 0, time.monotonic()
            while chunk := response.read(4 * 1024 * 1024):
                output.write(chunk)
                received += len(chunk)
                if time.monotonic() - last > 5:
                    print(f"{name}: {received / 1048576:.0f} MB", flush=True)
                    last = time.monotonic()
        temporary.replace(destination)
        print(f"Downloaded {name}: {received / 1048576:.1f} MB", flush=True)
    (MODEL_DIR / "source.json").write_text(json.dumps({"repo": "wfzyx/von", "revision": REVISION, "sdk": "1.2.3"}, indent=2))
    print("Von weights installed locally.", flush=True)
