"""JSONL worker; neural synthesis is local and never downloads during render."""
import importlib.metadata
import json
from pathlib import Path
import sys
import wave

voice = None
config = None
for line in sys.stdin:
    message = json.loads(line)
    try:
        op = message['op']
        if op == 'init':
            import onnxruntime as ort
            from piper import PiperVoice, SynthesisConfig
            config = message['config']
            voice = PiperVoice.load(str(Path(config['modelDir']) / config['modelFile']))
            result = {'engine': 'piper', 'voice': config['voice'], 'language': config['language'],
                      'control': 'local-neural-voice-and-speed',
                      'warnings': ['Piper supports voice and pace, not free-form acting. Pronunciation and listening review are required.'],
                      'versions': {'piper-tts': importlib.metadata.version('piper-tts'), 'onnxruntime': ort.__version__}}
        elif op == 'synthesize':
            job = message['job']
            if job['language'].split('-')[0] != config['language']:
                raise ValueError('Voice language does not match the score')
            if job['voice'].get('piperVoice', config['voice']) != config['voice']:
                raise ValueError('Requested voice differs from the prepared model')
            pace = float(job.get('pace', 1))
            if not .5 <= pace <= 2:
                raise ValueError('Pace must be between 0.5 and 2')
            with wave.open(message['output'], 'wb') as output:
                voice.synthesize_wav(job['text'], output, syn_config=SynthesisConfig(length_scale=1 / pace))
            with wave.open(message['output'], 'rb') as output:
                result = {'frames': output.getnframes(), 'sampleRate': output.getframerate(), 'clampedSamples': 0}
        elif op == 'close':
            result = {'closed': True}
        else:
            raise ValueError('Unknown worker operation')
        print(json.dumps({'id': message['id'], 'ok': True, 'result': result}), flush=True)
        if op == 'close':
            break
    except Exception as error:
        print(json.dumps({'id': message['id'], 'ok': False, 'error': str(error)}), flush=True)
