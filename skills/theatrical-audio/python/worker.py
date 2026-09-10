#!/usr/bin/env python3
"""One JSONL worker per render job; model is loaded lazily, once, and never served over a port."""
from __future__ import annotations
import os
for key in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE", "HF_HUB_DISABLE_TELEMETRY", "DO_NOT_TRACK"):
    os.environ[key] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
import array
import contextlib
import json
import math
from pathlib import Path
import socket
import sys
import time
import traceback
import wave

# Defense against accidental downloads in optional upstream paths. This is not an OS sandbox.
def no_network(*args, **kwargs):
    raise RuntimeError("Network disabled in the audio worker. Prepare model files before rendering.")
socket.create_connection = no_network
socket.socket.connect = no_network
socket.socket.connect_ex = no_network

from backends import QwenBackend, KokoroBackend


def write_pcm16(file, samples, sample_rate):
    path = Path(file)
    path.parent.mkdir(parents=True, exist_ok=True)
    values = array.array("h")
    peak = 0.0
    clipped = 0
    for sample in samples:
        x = float(sample)
        if not math.isfinite(x):
            raise ValueError("Model generated non-finite audio")
        peak = max(peak, abs(x))
        clipped += int(abs(x) > 1)
        values.append(max(-32768, min(32767, round(x * 32768))))
    if not values:
        raise ValueError("Model generated empty audio")
    if sys.byteorder != "little":
        values.byteswap()
    temp = path.with_suffix(path.suffix + ".partial")
    try:
        with wave.open(str(temp), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(int(sample_rate))
            w.writeframes(values.tobytes())
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)
    return {"frames": len(values), "sampleRate": sample_rate, "rawPeak": peak, "clampedSamples": clipped}


def main():
    engine = None
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            op = request["op"]
            if op == "close":
                print(json.dumps({"id": request["id"], "ok": True, "result": {}}), flush=True)
                break
            start = time.perf_counter()
            with contextlib.redirect_stdout(sys.stderr):
                if op == "init":
                    if engine is not None:
                        raise ValueError("Worker is already initialized")
                    config = request["config"]
                    root = Path(config["root"])
                    os.environ["HF_HOME"] = str(root / "runtime" / "hf-cache")
                    if config["engine"] == "qwen":
                        engine = QwenBackend(config)
                    elif config["engine"] == "kokoro":
                        engine = KokoroBackend(config)
                    else:
                        raise ValueError("Unsupported neural engine")
                    result = engine.info()
                elif op == "synthesize":
                    if engine is None:
                        raise ValueError("Initialize worker first")
                    samples, sr = engine.synthesize(request["job"])
                    result = write_pcm16(request["output"], samples, sr)
                else:
                    raise ValueError(f"Unknown operation: {op}")
            result["elapsedSeconds"] = time.perf_counter() - start
            print(json.dumps({"id": request["id"], "ok": True, "result": result}), flush=True)
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({"id": request.get("id"), "ok": False, "error": f"{type(exc).__name__}: {exc}"}), flush=True)


if __name__ == "__main__":
    main()
