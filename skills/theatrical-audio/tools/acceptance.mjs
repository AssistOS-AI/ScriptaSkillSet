#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,readJSON,writeJSON,fail,hashFile} from '../src/util.mjs';
import {render,auditBundle} from '../src/render.mjs';
import {makePreview} from '../src/preview.mjs';
import {loadWorkspaceEnvironment,ENGINES} from '../src/config.mjs';
await loadWorkspaceEnvironment();
const engine=process.argv[2]??'qwen';
if(!ENGINES.includes(engine))fail('Pass a supported engine; see providers/help. This acceptance uses one full scene twice.');
const out=path.resolve('output','acceptance-'+engine);
const common={engine,out,...(['kokoro','test-tone'].includes(engine)?{'allow-degraded':true}:{})};
const first=await render(path.join(ROOT,'examples','the-last-light.score.json'),common);
const firstHash=await hashFile(path.join(out,'audition.wav'));
const second=await render(path.join(ROOT,'examples','the-last-light.score.json'),common);
const secondHash=await hashFile(path.join(out,'audition.wav'));
if(second.evidence.generatedTakes!==0)fail('Cache reuse failed');
if(firstHash!==secondHash)fail('Cached re-render changed audio');
const audit=await auditBundle(out);
await makePreview(out,path.join(out,'preview.html'));
const report={engine,initial:first.evidence,repeated:second.evidence,cachedAudioIdentical:firstHash===secondHash,audit,
 listeningRequired:['Are all words present, once, without hallucinated speech?','Are characters distinguishable and consistent?','Do neutral, fearful and reassuring instructions sound different without changing speaker identity?','Are pauses and visual anchors artistically appropriate?'],
 passedTechnicalAcceptance:true,passedArtisticAcceptance:null};
await writeJSON(path.join(out,'acceptance.json'),report);
console.log(JSON.stringify(report,null,2));
