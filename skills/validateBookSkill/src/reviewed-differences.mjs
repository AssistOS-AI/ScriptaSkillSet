import { hash } from './storage.mjs';

export function retainReviewedDifferences(findings, review, pdfSha256) {
  if(!review)return findings;
  if(review.pdfSha256!==pdfSha256||!Array.isArray(review.differences))throw Error('Stale or invalid retained-difference evidence');
  return findings.map(f=>{
    const entry=review.differences.find(r=>r.findingSha256===hash(JSON.stringify(f)));
    if(!entry)return f;
    if(!['source_text_unmatched','html_text_unmatched'].includes(f.category)||typeof entry.reason!=='string'||!entry.reason.trim())throw Error('Only explicitly reviewed source-text differences can be retained');
    return {...f,severity:'warning',needsJudgment:false,review:{disposition:'retained_editorial_difference',reason:entry.reason,findingSha256:entry.findingSha256}};
  });
}
