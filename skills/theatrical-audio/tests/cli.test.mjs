import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/util.mjs';

function cli(args, cwd = ROOT) {
  const env = { ...process.env };
  for (const key of ['AUDIO_ENGINE','OPENAI_API_KEY','ELEVENLABS_API_KEY','AZURE_SPEECH_KEY']) delete env[key];
  return spawnSync(process.execPath,[path.join(ROOT,'bin/audio.mjs'),...args],{cwd,env,encoding:'utf8',timeout:20000});
}
test('CLI help needs no runtime or credential',()=>{
  const r=cli(['help']); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/Node >=22/);
});
test('CLI OpenAI voice names are available without calling a provider',()=>{
  const r=cli(['voices','--engine','openai']);assert.equal(r.status,0,r.stderr);
  const d=JSON.parse(r.stdout);assert.ok(d.voices.includes('marin'));assert.equal(d.accountAccessVerified,false);
});
test('CLI rejects cloud under offline before credential/network access',()=>{
  const r=cli(['doctor','--engine','openai','--offline']);assert.equal(r.status,1);assert.match(r.stderr,/offline forbids/);
});
test('CLI rejects misspelled flags',()=>{
  const r=cli(['say','A line.','--engine','test-tone','--allow-degraded','--voise','marin']);
  assert.equal(r.status,1);assert.match(r.stderr,/Unknown option/);
});
test('CLI never silently renders diagnostic signals as speech',()=>{
  const r=cli(['say','A line.','--engine','test-tone']);assert.equal(r.status,1);assert.match(r.stderr,/allow-degraded/);
});
test('CLI one-line diagnostic export is a real standalone WAV and verified scene',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'audio-cli-'));
  try {
    const out=path.join(tmp,'line.wav');
    const r=cli(['say','A diagnostic fixture.','--engine','test-tone','--allow-degraded','--out',out,'--cache',path.join(tmp,'cache')],tmp);
    assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);
    assert.equal(result.generatedTakes,1);assert.ok(result.durationSeconds>0);
    assert.equal((await fs.readFile(out)).toString('ascii',0,4),'RIFF');
    await assert.rejects(fs.access(path.join(tmp,'line.scene','audition.wav')));
    const audit=cli(['verify',path.join(tmp,'line.scene')],tmp);assert.equal(audit.status,0,audit.stderr);
  } finally {await fs.rm(tmp,{recursive:true,force:true});}
});
test('CLI draft creates a schema-valid mechanical score without provider access',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'audio-draft-'));
  try {
    const txt=path.join(tmp,'source.txt'),score=path.join(tmp,'score.json');
    await fs.writeFile(txt,'The light is still on.\nWe should go back.\n');
    const r=cli(['draft',txt,'--out',score,'--direction','Quiet reassurance.'],tmp);
    assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).semanticDirection,'agent-or-human-required');
    const v=cli(['validate',score],tmp);assert.equal(v.status,0,v.stderr);
  } finally {await fs.rm(tmp,{recursive:true,force:true});}
});
