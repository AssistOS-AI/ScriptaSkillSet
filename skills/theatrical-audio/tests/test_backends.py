"""Adapter contract tests with fake model objects. These are NOT neural inference tests."""
import contextlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'python'))
from backends import QwenBackend, KokoroBackend

class Array(list):
    def reshape(self,*args):return self

class BackendContracts(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)
        self.job={'text':'The light is still on.','voice':{'qwenSpeaker':'Ryan','kokoroVoice':'bm_george','description':'Mature English narrator'},'instruction':'Restrained fear.','seed':7,'pace':.9,'maxNewTokens':256}
    def tearDown(self):self.tmp.cleanup()
    def config(self,size='1b7',kind='custom_voice',mode='custom'):
        (self.path/'config.json').write_text(json.dumps({'tts_model_size':size,'tts_model_type':kind}))
        return {'modelDir':str(self.path),'device':'cpu','mode':mode}
    def modules(self):
        self.loaded=[];self.calls=[]
        model=SimpleNamespace(get_supported_speakers=lambda:['Ryan','Aiden'],
          generate_custom_voice=lambda **kw:(self.calls.append(('custom',kw)) or [[.1,-.1]],24000),
          generate_voice_design=lambda **kw:(self.calls.append(('design',kw)) or [[.1,-.1]],24000))
        def load(*a,**kw):self.loaded.append((a,kw));return model
        np=SimpleNamespace(float32='float32',asarray=lambda data,**kw:Array(data),random=SimpleNamespace(seed=lambda x:None))
        torch=SimpleNamespace(float32='float32',float16='float16',bfloat16='bfloat16',manual_seed=lambda x:None,cuda=SimpleNamespace(is_available=lambda:False),inference_mode=contextlib.nullcontext)
        return {'numpy':np,'torch':torch,'qwen_tts':SimpleNamespace(Qwen3TTSModel=SimpleNamespace(from_pretrained=load))}
    def test_rejects_06b_instead_of_ignoring_emotion(self):
        with self.assertRaisesRegex(ValueError,'requires Qwen 1b7'):QwenBackend(self.config(size='0b6'))
    def test_rejects_base_instead_of_pretending_clone_is_instruction_control(self):
        with self.assertRaisesRegex(ValueError,'requires Qwen 1b7'):QwenBackend(self.config(kind='base'))
    def test_qwen_load_is_local_and_occurs_once_per_worker(self):
        backend=QwenBackend(self.config())
        with patch.dict(sys.modules,self.modules()):
            backend.synthesize(self.job);backend.synthesize(self.job)
        self.assertEqual(len(self.loaded),1)
        self.assertTrue(self.loaded[0][1]['local_files_only'])
        self.assertEqual(self.loaded[0][1]['device_map'],'cpu')
    def test_custom_voice_receives_text_separately_from_direction(self):
        backend=QwenBackend(self.config())
        with patch.dict(sys.modules,self.modules()):backend.synthesize(self.job)
        kind,kwargs=self.calls[0]
        self.assertEqual(kind,'custom');self.assertEqual(kwargs['instruct'],'Restrained fear.')
        self.assertEqual(kwargs['text'],self.job['text']);self.assertEqual(kwargs['speaker'],'Ryan')
    def test_unknown_custom_speaker_is_an_error(self):
        backend=QwenBackend(self.config());self.job['voice']['qwenSpeaker']='Imaginary'
        with patch.dict(sys.modules,self.modules()):
            with self.assertRaisesRegex(ValueError,'Unknown model speaker'):backend.synthesize(self.job)
    def test_design_uses_a_description_not_a_custom_speaker(self):
        backend=QwenBackend(self.config(kind='voice_design',mode='design'))
        with patch.dict(sys.modules,self.modules()):backend.synthesize(self.job)
        kind,kwargs=self.calls[0]
        self.assertEqual(kind,'design');self.assertNotIn('speaker',kwargs)
        self.assertIn('Mature English narrator',kwargs['instruct'])
    def test_kokoro_local_files_required(self):
        with self.assertRaisesRegex(ValueError,'requires kokoro'):KokoroBackend({'modelDir':str(self.path)})
    def test_kokoro_receives_native_speed_but_not_fake_emotion_argument(self):
        (self.path/'kokoro-v1.0.onnx').write_bytes(b'x');(self.path/'voices-v1.0.bin').write_bytes(b'x')
        calls=[];model=SimpleNamespace(get_voices=lambda:['bm_george'],create=lambda *a,**kw:(calls.append((a,kw)) or [.1],24000))
        backend=KokoroBackend({'modelDir':str(self.path)})
        with patch.dict(sys.modules,{'kokoro_onnx':SimpleNamespace(Kokoro=lambda *a:model)}):backend.synthesize(self.job)
        self.assertEqual(calls[0][1]['speed'],.9);self.assertEqual(calls[0][1]['lang'],'en-gb');self.assertNotIn('instruct',calls[0][1])
    def test_worker_errors_are_json_and_worker_can_close_cleanly(self):
        payload='\n'.join(json.dumps(x) for x in [{'id':1,'op':'invalid'},{'id':2,'op':'close'}])+'\n'
        r=subprocess.run([sys.executable,str(ROOT/'python/worker.py')],input=payload,text=True,capture_output=True,check=True)
        replies=[json.loads(x) for x in r.stdout.splitlines()]
        self.assertFalse(replies[0]['ok']);self.assertTrue(replies[1]['ok']);self.assertIn('Unknown operation',replies[0]['error'])

if __name__=='__main__':unittest.main(verbosity=2)
