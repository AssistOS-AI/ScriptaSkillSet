"""Local inference adapters. No HTTP API. Dependencies live in a private venv.

Qwen and Kokoro are optional. Model inference is NOT validated by contract tests.
"""
from __future__ import annotations
import importlib.metadata
import json
from pathlib import Path
import random
import platform


def package_versions(names):
    result = {"python": platform.python_version(), "platform": platform.platform()}
    for name in names:
        try:
            result[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            result[name] = None
    return result


class QwenBackend:
    def __init__(self, config):
        self.config = config
        self.path = Path(config["modelDir"]).resolve()
        if not self.path.is_dir():
            raise ValueError(f"Missing local Qwen model directory: {self.path}")
        data = json.loads((self.path / "config.json").read_text(encoding="utf-8"))
        size, kind = data.get("tts_model_size"), data.get("tts_model_type")
        self.mode = config.get("mode", "custom")
        expected = "voice_design" if self.mode == "design" else "custom_voice"
        if size != "1b7" or kind != expected:
            raise ValueError(f"Emotional control requires Qwen 1b7/{expected}; found {size}/{kind}. Base and 0.6B are not silently substituted.")
        self.model = None

    def info(self):
        versions = package_versions(["qwen-tts", "torch", "transformers", "accelerate", "numpy", "librosa", "soundfile", "torchaudio"])
        if versions["qwen-tts"] is None:
            raise RuntimeError("qwen-tts is missing from this interpreter. Run tools/bootstrap.py --engine qwen.")
        return {"engine": "qwen", "control": "natural-language-instructions", "mode": self.mode, "versions": versions,
                "alignment": "none", "warnings": ["Direction is probabilistic, not an exact acting guarantee."] +
                (["VoiceDesign identity can drift between clips; use CustomVoice for a fixed cast."] if self.mode == "design" else [])}

    def synthesize(self, job):
        import numpy as np
        import torch
        from qwen_tts import Qwen3TTSModel
        if self.model is None:
            device = self.config.get("device", "cpu")
            dtype_name = self.config.get("dtype", "float32" if device == "cpu" else "float16")
            if dtype_name not in ("float32", "float16", "bfloat16"):
                raise ValueError(f"Unsupported dtype: {dtype_name}")
            self.model = Qwen3TTSModel.from_pretrained(
                str(self.path), device_map=device, dtype=getattr(torch, dtype_name),
                attn_implementation=self.config.get("attention", "sdpa"), local_files_only=True)
        seed = int(job["seed"])
        random.seed(seed)
        np.random.seed(seed % (2**32))
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        kwargs = dict(text=job["text"], language="English", instruct=job["instruction"],
                      max_new_tokens=int(job.get("maxNewTokens", 1024)),
                      do_sample=True, temperature=0.85, non_streaming_mode=True)
        with torch.inference_mode():
            if self.mode == "design":
                description = job["voice"].get("description", "")
                if not description.strip():
                    raise ValueError("VoiceDesign requires voice.description")
                kwargs["instruct"] = description + ". " + kwargs["instruct"]
                wavs, sr = self.model.generate_voice_design(**kwargs)
            else:
                speaker = job["voice"].get("qwenSpeaker")
                if not speaker:
                    raise ValueError("CustomVoice requires voice.qwenSpeaker")
                supported = {x.lower() for x in self.model.get_supported_speakers()}
                if speaker.lower() not in supported:
                    raise ValueError(f"Unknown model speaker {speaker}; available: {sorted(supported)}")
                wavs, sr = self.model.generate_custom_voice(speaker=speaker, **kwargs)
        samples = np.asarray(wavs[0], dtype=np.float32).reshape(-1)
        return samples, int(sr)


class KokoroBackend:
    def __init__(self, config):
        self.config = config
        base = Path(config["modelDir"]).resolve()
        self.model_path, self.voices_path = base / "kokoro-v1.0.onnx", base / "voices-v1.0.bin"
        if not self.model_path.is_file() or not self.voices_path.is_file():
            raise ValueError(f"Kokoro requires kokoro-v1.0.onnx and voices-v1.0.bin in {base}")
        self.model = None

    def info(self):
        versions = package_versions(["kokoro-onnx", "onnxruntime", "numpy", "phonemizer", "espeakng-loader"])
        if versions["kokoro-onnx"] is None:
            raise RuntimeError("kokoro-onnx is missing from this interpreter. Run tools/bootstrap.py --engine kokoro.")
        return {"engine": "kokoro", "control": "voice-and-speed-only", "versions": versions, "alignment": "none",
                "warnings": ["Kokoro does not execute this score's free-form emotional direction.",
                             "This adapter does not claim word or phoneme timestamps."]}

    def synthesize(self, job):
        from kokoro_onnx import Kokoro
        if self.model is None:
            self.model = Kokoro(str(self.model_path), str(self.voices_path))
        voice = job["voice"].get("kokoroVoice")
        if voice not in self.model.get_voices():
            raise ValueError(f"Unknown Kokoro voice {voice}; available: {self.model.get_voices()}")
        lang = "en-gb" if voice.startswith("b") else "en-us"
        return self.model.create(job["text"], voice=voice, speed=float(job.get("pace", 1)), lang=lang, trim=False)
