"""Prepare a small local neural voice in the skill's private runtime."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
import venv

ROOT = Path(__file__).resolve().parents[1]


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def prepare(voice, download=False):
    if not re.fullmatch(r'[a-z]{2,3}_[A-Z]{2}-[a-zA-Z0-9_]+-(?:x_low|low|medium|high)', voice):
        raise ValueError('Use a Piper voice ID such as en_US-ljspeech-medium')
    runtime = ROOT / 'runtime' / 'piper'
    python = runtime / 'venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    model_dir = runtime / 'models' / voice
    receipt_path = model_dir / 'download.json'
    if not python.exists() and not download:
        raise ValueError('Piper is not prepared. Run setup piper --download with authorized local downloads.')
    if download:
        runtime.mkdir(parents=True, exist_ok=True)
        if not python.exists():
            venv.EnvBuilder(with_pip=True).create(runtime / 'venv')
        subprocess.run([str(python), '-m', 'pip', 'install', 'piper-tts==1.4.2'], check=True, stdout=sys.stderr)
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text())
        for name, digest in receipt['sha256'].items():
            if hashlib.sha256((model_dir / name).read_bytes()).hexdigest() != digest:
                raise ValueError('Model integrity check failed: ' + name)
    else:
        if not download:
            raise ValueError('Voice is not downloaded; use --download')
        # Pin every file to one repository revision; record hashes and the model card.
        revision = json.loads(fetch('https://huggingface.co/api/models/rhasspy/piper-voices'))['sha']
        base = f'https://huggingface.co/rhasspy/piper-voices/resolve/{revision}/'
        index = json.loads(fetch(base + 'voices.json'))
        entry = index.get(voice)
        if not entry:
            raise ValueError('Voice is absent from the official Piper catalogue: ' + voice)
        model_dir.mkdir(parents=True, exist_ok=True)
        files = entry['files']
        selected = [key for key in files if key.endswith(('.onnx', '.onnx.json'))]
        if len(selected) != 2:
            raise ValueError('Expected exactly one model and configuration')
        hashes = {}
        for relative in selected:
            raw = fetch(base + relative)
            metadata = files[relative]
            if len(raw) != metadata['size_bytes'] or hashlib.md5(raw).hexdigest() != metadata['md5_digest']:
                raise ValueError('Downloaded file differs from the pinned catalogue')
            name = Path(relative).name
            pending = model_dir / (name + '.partial')
            pending.write_bytes(raw)
            pending.replace(model_dir / name)
            hashes[name] = hashlib.sha256(raw).hexdigest()
        card = fetch(base + str(Path(selected[0]).parent / 'MODEL_CARD'))
        (model_dir / 'MODEL_CARD').write_bytes(card)
        hashes['MODEL_CARD'] = hashlib.sha256(card).hexdigest()
        receipt = {'voice': voice, 'repository': 'rhasspy/piper-voices', 'revision': revision,
                   'sha256': hashes, 'modelCard': 'MODEL_CARD', 'engine': 'piper-tts==1.4.2'}
        receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    config = {'engine': 'piper', 'python': str(python.relative_to(ROOT)),
              'modelDir': str(model_dir.relative_to(ROOT)), 'modelFile': voice + '.onnx',
              'voice': voice, 'language': voice.split('_')[0], 'device': 'cpu'}
    (ROOT / 'runtime/piper.json').write_text(json.dumps(config, indent=2) + '\n')
    return config


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--voice', default='en_US-ljspeech-medium')
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    prepare(args.voice, args.download)
