import { fail } from './util.mjs';
// This function is intentionally not called an AI director. It only preserves and splits text.
export function draftScore(sourceText, { title = 'Untitled scene', direction = '', maxChars = 300 } = {}) {
  if (!sourceText.trim()) fail('No text to draft');
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const spans = [];
  for (const item of segmenter.segment(sourceText)) {
    let start = item.index, end = start + item.segment.length;
    while (start < end && /\s/u.test(sourceText[start])) start++;
    while (end > start && /\s/u.test(sourceText[end-1])) end--;
    while (end - start > maxChars) {
      let cut = sourceText.lastIndexOf(' ', start + maxChars);
      if (cut <= start) fail('Unbroken text span exceeds maxChars; segment it explicitly');
      spans.push({start,end:cut}); start=cut+1;
      while(start<end && /\s/u.test(sourceText[start]))start++;
    }
    if (start < end) spans.push({start,end});
  }
  return { format:'theatrical-audio/1',id:'draft-scene',title,language:'en',sourceText,
    notes:'Automatic segmentation only. A coding agent or human must inspect cast, emotion, source coverage and scene structure.',
    voices:{narrator:{label:'Narrator',qwenSpeaker:'Ryan',kokoroVoice:'bm_george'}},
    settings:{sampleRate:24000,takes:1,seed:7331,tailSeconds:.5},
    beats:spans.map((sourceSpan,i)=>({id:`line_${String(i+1).padStart(3,'0')}`,type:'speech',speaker:'narrator',text:sourceText.slice(sourceSpan.start,sourceSpan.end),sourceSpan,direction:{delivery:direction}})),
    effects:[],beds:[],visuals:[]};
}
