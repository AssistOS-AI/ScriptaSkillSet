import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ROOT,readJSON,writeJSON,hashFile,exists} from '../src/util.mjs';
import {render,auditBundle} from '../src/render.mjs';
import {makePreview} from '../src/preview.mjs';
const minimal=await readJSON(path.join(ROOT,'examples/minimal.score.json'));
const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatrical-test-'));
const scoreFile=path.join(root,'score.json'),out=path.join(root,'output'),cache=path.join(root,'cache');
const opts={engine:'test-tone','allow-degraded':true,out,cache};
let baseline;
test('Render, pause-only revision, take selection, cache corruption and bundle audit',async t=>{
  await writeJSON(scoreFile,minimal);
  await t.test('first render creates two independent speech files and no pause file',async()=>{
    baseline=await render(scoreFile,opts);assert.equal(baseline.evidence.generatedTakes,2);
    assert.equal(baseline.timeline.events.filter(e=>e.kind==='pause').length,1);
    assert.equal(Object.keys(baseline.timeline.assets).filter(id=>id.includes('silence')).length,0);
    assert.equal((await auditBundle(out)).valid,true);
  });
  const originalMix=await hashFile(path.join(out,'audition.wav'));
  await t.test('identical rerender uses cache and produces byte-identical audition audio',async()=>{
    const b=await render(scoreFile,opts);assert.equal(b.evidence.generatedTakes,0);assert.equal(b.evidence.cacheHits,2);assert.equal(await hashFile(path.join(out,'audition.wav')),originalMix);
  });
  const s=structuredClone(minimal);s.beats[1].seconds=2;
  await writeJSON(scoreFile,s);
  await t.test('changing a pause shifts only the timeline without regenerating speech',async()=>{
    const b=await render(scoreFile,opts);assert.equal(b.evidence.generatedTakes,0);
    const before=baseline.timeline.events.find(e=>e.id==='end'),after=b.timeline.events.find(e=>e.id==='end');
    assert.equal(after.startFrame-before.startFrame,19200);assert.equal(after.audioSha256,before.audioSha256);
  });
  s.settings={takes:2};await writeJSON(scoreFile,s);
  await t.test('requesting a second take generates only missing takes',async()=>{const b=await render(scoreFile,opts);assert.equal(b.evidence.generatedTakes,2);assert.equal(b.evidence.cacheHits,2);});
  s.beats[0].selectedTake=1;await writeJSON(scoreFile,s);
  await t.test('changing selectedTake reuses all generated performances',async()=>{const b=await render(scoreFile,opts);assert.equal(b.evidence.generatedTakes,0);assert.equal(b.timeline.events.find(e=>e.id==='hello').selectedTake,1);});
  s.beats[2].text='A completely different final sentence.';await writeJSON(scoreFile,s);
  await t.test('editing one spoken line invalidates that line only',async()=>{const b=await render(scoreFile,opts);assert.equal(b.evidence.generatedTakes,2);assert.equal(b.evidence.cacheHits,2);});
  await t.test('a corrupt cache entry is detected and regenerated',async()=>{
    const takes=await readJSON(path.join(out,'takes.json'));const key=takes[0].cacheKey;
    await fs.writeFile(path.join(cache,key+'.wav'),'invalid');
    const b=await render(scoreFile,opts);assert.equal(b.evidence.generatedTakes,1);assert.ok(b.timeline.provenance.warnings.some(w=>w.includes('Corrupted')));
  });
  await t.test('preview embeds assets and safely escapes executable HTML in score data',async()=>{
    s.title='A </script><script>alert(1)</script> scene';await writeJSON(scoreFile,s);await render(scoreFile,opts);
    const html=path.join(root,'preview.html');await makePreview(out,html);const data=await fs.readFile(html,'utf8');
    assert.ok(data.includes('\\u003c/script>'));assert.ok(!data.includes('<script>alert(1)</script>'));assert.ok(!data.includes('__BUNDLE__'));assert.ok(data.includes('TheatricalAudioPlayer'));
  });
  await t.test('bundle audit detects an altered audio file',async()=>{const timeline=await readJSON(path.join(out,'timeline.json'));const file=path.join(out,Object.values(timeline.assets)[0].file);await fs.appendFile(file,'x');await assert.rejects(()=>auditBundle(out),/digest mismatch/);});
  await t.test('no silent fallback to a diagnostic engine',async()=>{await assert.rejects(()=>render(scoreFile,{engine:'test-tone',out,cache}),/allow-degraded/);});
  await t.test('failed backend initialization releases the output lock',async()=>{await assert.rejects(()=>render(scoreFile,{engine:'qwen',out,config:path.join(root,'missing.json')}),/Missing/);assert.equal(await exists(path.join(out,'.render.lock')),false);});
  await t.test('concurrent output lock is respected',async()=>{await fs.writeFile(path.join(out,'.render.lock'),'{}');await assert.rejects(()=>render(scoreFile,opts),/Another render/);await fs.rm(path.join(out,'.render.lock'));});
});
test.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
