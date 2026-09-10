#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
export function checkEditorial(plan,source){
 const errors=[],warnings=[],error=m=>errors.push(m),hash=crypto.createHash('sha256').update(source,'utf8').digest('hex');
 if(plan.format!=='SHF-Editorial')error('Expected SHF-Editorial.');if(plan.sourceSha256!==hash)error('Canonical source hash does not match.');
 if(!plan.centralQuestion||!plan.thesis||!plan.genre)error('Central question, thesis and genre are required.');
 const claims=new Set(),scenes=new Set((plan.scenePlan||[]).map(s=>s.id));
 for(const c of plan.claims||[]){if(!c.id||claims.has(c.id))error('Duplicate/missing claim ID.');claims.add(c.id);if(!c.statement)error('Claim needs editorial wording.');
  if(!['audience-surprise','author-claimed','within-source','externally-verified','none'].includes(c.noveltyScope))error('Explicit noveltyScope required for '+c.id);
  if(c.noveltyScope==='externally-verified'&&!c.externalEvidence?.length)error('Field novelty needs external evidence for '+c.id);
  if(!c.spans?.length&&c.kind!=='visual-metaphor')error('Source-backed claim needs a span: '+c.id);
  for(const span of c.spans||[]){if(!Number.isInteger(span.start)||!Number.isInteger(span.end)||span.start<0||span.end<=span.start||span.end>source.length)error('Invalid UTF-16 source span '+c.id);else if(source.slice(span.start,span.end)!==span.quote)error('Exact source span mismatch '+c.id);}
 }
 if(plan.purpose==='book-introduction'){
  const invite=plan.readerInvitation||{};
  for(const key of ['reasonToExist','readerPromise','audienceFit','closingInvitation'])if(typeof invite[key]!=='string'||!invite[key].trim())error('Book introduction requires readerInvitation.'+key+'.');
  for(const key of ['readerOutcomes','bookJourney','contentSamples','reservedForReading'])if(!Array.isArray(invite[key])||!invite[key].length)error('Book introduction requires nonempty readerInvitation.'+key+'.');
  for(const sample of invite.contentSamples||[])if(!scenes.has(sample.sceneId)||!sample.readingValue)error('Content sample needs an existing scene and specific reading value.');
  for(const scene of plan.scenePlan||[])if(!['book','content','reader'].includes(scene.lens))error('Book introduction scene needs a book/content/reader lens: '+scene.id);
 }
 if(!claims.size)error('No selected claims.');if(!scenes.size)error('No scene plan.');
 for(const h of plan.hooks||[]){if(!h.question||!scenes.has(h.introducedSceneId))error('Hook must introduce a real scene/question.');if(h.status==='resolved'){if(!scenes.has(h.resolvedSceneId)||!h.resolution)error('Resolved hook needs a real payoff scene and answer.');}else if(h.status!=='open-by-design'||!h.reason)error('Hook needs a payoff or explicit open-by-design reason.');for(const c of h.sourceClaimIds||[])if(!claims.has(c))error('Hook references absent claim '+c);}
 if(!plan.hooks?.length)warnings.push('No hook/payoff ledger.');if(!Array.isArray(plan.omissions))warnings.push('Record deliberate omissions, even an empty list.');if(!Array.isArray(plan.limitations))warnings.push('Record limitations explicitly.');
 return {valid:!errors.length,errors,warnings,sourceSha256:hash,scope:'Structural provenance check only; entailment, completeness, interest and artistic quality still require review.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const [p,s]=process.argv.slice(2);const result=checkEditorial(JSON.parse(fs.readFileSync(p)),fs.readFileSync(s,'utf8'));console.log(JSON.stringify(result,null,2));if(!result.valid)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}}
