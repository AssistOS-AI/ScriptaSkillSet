#!/usr/bin/env python3
"""Explicit one-time online preparation, or offline reconstruction from a wheelhouse.
Never invoked automatically by the renderer. Uses only Python stdlib until venv activation.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import urllib.request
import venv

ROOT = Path(__file__).resolve().parents[1]


def run(args, **kwargs):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    return subprocess.run(list(map(str, args)), check=True, **kwargs)


def download(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp = dest.with_suffix(dest.suffix + '.partial')
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'theatrical-audio-skill/2.0'})
        with urllib.request.urlopen(req, timeout=120) as src, temp.open('wb') as out:
            while chunk := src.read(1024*1024):
                out.write(chunk)
        temp.replace(dest)
    finally:
        temp.unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--engine', choices=['qwen','kokoro'], required=True)
    ap.add_argument('--device', default='cpu', help='cpu, cuda:0; mps is experimental and not sandbox-tested')
    ap.add_argument('--mode', choices=['custom','design'], default='custom')
    ap.add_argument('--download', action='store_true', help='Explicit authorization to download model files now')
    ap.add_argument('--revision', help='Optional immutable Hugging Face commit; resolved revision is recorded')
    ap.add_argument('--torch-index', help='Explicit PyTorch wheel index for the target GPU platform; never guessed')
    ap.add_argument('--wheelhouse', type=Path, help='Install with --no-index from this local directory')
    ap.add_argument('--lock', type=Path, help='Install an existing full pip freeze lock, instead of top-level requirements')
    ap.add_argument('--prepare-wheelhouse', type=Path, help='After online setup, download this platform\'s locked wheels for offline reconstruction')
    ap.add_argument('--models-dir', type=Path, help='Existing local model directory; no download required')
    args = ap.parse_args()
    if not (3,10) <= sys.version_info[:2] < (3,14):
        ap.error('Use Python 3.10–3.13; Python 3.12 is recommended for Qwen. This Python creates the private environment.')
    if args.wheelhouse and args.download:
        ap.error('--wheelhouse mode is offline; do not combine it with --download')
    if args.wheelhouse and args.torch_index:
        ap.error('--torch-index is not used during offline wheelhouse reconstruction')
    if args.wheelhouse and args.prepare_wheelhouse:
        ap.error('Do not download a wheelhouse during offline reconstruction')
    if args.wheelhouse and not args.lock:
        ap.error('Offline reconstruction requires --lock from the original preparation')
    envdir = ROOT / 'runtime' / args.engine
    python = envdir / ('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    if not python.exists():
        venv.EnvBuilder(with_pip=True).create(envdir)
    base = [python, '-m', 'pip']
    install = base + ['install']
    if args.wheelhouse:
        install += ['--no-index','--find-links',args.wheelhouse.resolve()]
    else:
        run(base + ['install','--upgrade','pip'])
    if args.engine == 'qwen' and not args.lock:
        # torch and torchaudio must come from the same compatible channel.
        index = args.torch_index or ('https://download.pytorch.org/whl/cpu' if args.device=='cpu' and sys.platform!='darwin' else None)
        if index:
            run(install + ['torch','torchaudio','--index-url',index])
        else:
            print('No custom torch index: resolving default wheels. Check driver compatibility before rendering.', file=sys.stderr)
    requirement = args.lock.resolve() if args.lock else ROOT / 'runtime' / f'{args.engine}.requirements.txt'
    run(install + ['-r', requirement])
    lock = ROOT / 'runtime' / f'{args.engine}.resolved.txt'
    frozen = subprocess.check_output([str(python),'-m','pip','freeze'],text=True)
    lock.write_text(frozen,encoding='utf-8')
    if args.prepare_wheelhouse:
        args.prepare_wheelhouse.mkdir(parents=True,exist_ok=True)
        extra = ['--extra-index-url',args.torch_index] if args.torch_index else (['--extra-index-url','https://download.pytorch.org/whl/cpu'] if args.engine=='qwen' and args.device=='cpu' and sys.platform!='darwin' else [])
        run(base + ['download','--only-binary=:all:','-r',lock,'--dest',args.prepare_wheelhouse.resolve()] + extra)
    model_dir = args.models_dir.resolve() if args.models_dir else ROOT / 'models' / (f'qwen-{args.mode}' if args.engine=='qwen' else 'kokoro')
    resolved_revision = None
    if args.download:
        if args.engine == 'qwen':
            repo = 'Qwen/Qwen3-TTS-12Hz-1.7B-' + ('VoiceDesign' if args.mode=='design' else 'CustomVoice')
            # Execute hub code only in the private environment. The entire snapshot contains its speech tokenizer.
            code = '''from huggingface_hub import HfApi,snapshot_download
import json,sys
repo,requested,dest=sys.argv[1:]
revision=HfApi().model_info(repo,revision=requested or None).sha
snapshot_download(repo_id=repo,revision=revision,local_dir=dest)
print(json.dumps({"revision":revision}))
'''
            result = run([python,'-c',code,repo,args.revision or '',model_dir],stdout=subprocess.PIPE,text=True)
            print(result.stdout)
            resolved_revision=json.loads(result.stdout.strip().splitlines()[-1])['revision']
        else:
            base_url='https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/'
            for filename in ('kokoro-v1.0.onnx','voices-v1.0.bin'):
                print('Downloading '+filename,flush=True)
                download(base_url+filename,model_dir/filename)
    if not model_dir.is_dir():
        raise SystemExit(f'Runtime installed, but models are missing: {model_dir}. Re-run with --download, or --models-dir LOCAL_DIRECTORY.')
    try:
        relative_model=str(model_dir.relative_to(ROOT))
    except ValueError:
        relative_model=str(model_dir)
    config={'engine':args.engine,'python':str(python.relative_to(ROOT)),'modelDir':relative_model,
            'device':args.device,'dtype':'float32' if args.device=='cpu' else 'float16',
            'attention':'sdpa','mode':args.mode,'modelRevision':resolved_revision,
            'platform':platform.platform(),'pythonVersion':platform.python_version(),
            'resolvedRequirementsSha256':hashlib.sha256(frozen.encode()).hexdigest()}
    config_file=ROOT/'runtime'/f'{args.engine}.json'
    config_file.write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8')
    print('\nConfigured '+str(config_file))
    print('Render is offline. It never runs this installer or downloads missing models.')
    print('Run: node bin/audio.mjs doctor --engine '+args.engine)


if __name__=='__main__':
    try:
        main()
    except (subprocess.CalledProcessError, OSError) as error:
        raise SystemExit('Preparation failed: '+str(error))
