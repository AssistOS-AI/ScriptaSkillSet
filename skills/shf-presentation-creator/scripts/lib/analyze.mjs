import crypto from 'node:crypto';
const normalize=s=>s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
export function analyzeText(text,{language='en',targetMinutes=7,genre='auto',title='Untitled source'}={}){
 if(!Number.isFinite(targetMinutes)||targetMinutes<=0||targetMinutes>120)throw new Error('targetMinutes must be between 0 and 120.');
 if(typeof text!=='string'||!text.trim())throw new Error('Source text is empty.');
 if(text.length>8_000_000)throw new Error('Source exceeds the 8-million-character prototype limit; process chapters separately.');
 const segments=[...new Intl.Segmenter(language,{granularity:'sentence'}).segment(text)]
  .filter(s=>s.segment.trim().length>15).map(s=>{const leading=s.segment.length-s.segment.trimStart().length;return {text:s.segment.trim(),start:s.index+leading,end:s.index+leading+s.segment.trim().length};});
 if(!segments.length)throw new Error('No complete sentence candidate found. Supply prose, not only a title.');
 const words=normalize(text).match(/\p{L}{4,}/gu)||[],freq=new Map();
 const stop=new Set('this that with from they their have been were will which pentru este sunt care prin dintre poate despre cand doar aceasta aceste acela acesta into would could should than then more most much'.split(' '));
 for(const w of words)if(!stop.has(w))freq.set(w,(freq.get(w)||0)+1);
 const ranking=segments.map((s,i)=>{const w=normalize(s.text).match(/\p{L}{4,}/gu)||[];return {...s,index:i,score:w.reduce((sum,x)=>sum+Math.log(1+(freq.get(x)||0)),0)/Math.sqrt(Math.max(1,w.length))};}).sort((a,b)=>b.score-a.score);
 const keywords={fiction:['poveste','personaj','mira','oras','story','character','conflict'],sf:['marte','planeta','simulare','nava','mars','planet','spaceship'],philosophy:['libertate','adevar','argument','dorinta','freedom','truth','thesis'],technical:['algoritm','sistem','verificare','provenienta','algorithm','system','evaluation']};
 const all=normalize(text),scores=Object.fromEntries(Object.entries(keywords).map(([k,v])=>[k,v.reduce((n,w)=>n+(all.includes(w)?1:0),0)]));
 const best=Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];const guess=genre==='auto'?(best[1]?best[0]:'general'):genre;
 const select=regex=>segments.filter(s=>regex.test(normalize(s.text))).slice(0,8).map(s=>({text:s.text,spanUtf16:[s.start,s.end],status:'candidate; editorial review required'}));
 const selected=ranking.slice(0,Math.min(18,segments.length)).sort((a,b)=>a.index-b.index).map(({score,index,...s},i)=>({id:'excerpt-'+(i+1),text:s.text,spanUtf16:[s.start,s.end],rankScore:Number(score.toFixed(3))}));
 const totalWords=(text.match(/\S+/g)||[]).length;
 return {format:'SHF-editorial-analysis',version:'0.4',status:'editorial-review-required',title,language,
  source:{sha256:crypto.createHash('sha256').update(text,'utf8').digest('hex'),charactersUtf16:text.length,wordCount:totalWords,offsetConvention:'UTF-16 code units, [start,end), in the unmodified source'},
  genre:{requested:genre,guess,scores,confidence:'not calibrated'},
  target:{minutes:targetMinutes,mode:'visual-essence',suggestedNarrationWords:Math.round(targetMinutes*135),suggestedScenes:Math.max(4,Math.round(targetMinutes*2.2))},
  narrativeFramework:{order:['why','how','what'],status:'semantic author review required',why:'Find the source-specific problem, stakes and inadequacy motivating the work.',how:'Explain the distinctive mechanism or argument using the source terminology.',what:'Identify the concrete proposal, findings or outcome, including limits.',rule:'Use the structure subtly; do not invent motives, novelty or outcomes, or substitute generic motivational copy.'},
  terminologyReview:'Preserve source definitions and distinctions; explain technical terms on first use and verify pronunciation separately.',
  narrationStandard:'Exactly one sentence per spoken beat and measured clip; at most one sentence visible per caption card.',
  essentialCandidates:selected,
  noveltyCandidates:select(/\b(nou|noua|noutate|propune|novel|new|propose|unlike|instead|original)/),
  tensionCandidates:select(/\b(dar|insa|totusi|conflict|mister|risc|but|however|risk|unexpected|problem)/),
  limitationCandidates:select(/\b(limita|limite|gres|incert|cannot|limitation|uncertain|fails|not guarantee)/),
  warnings:[
   'Sentence scoring and keyword matches do not establish understanding or scientific novelty.',
   'Do not turn inferred character names, invented numbers, or decorative graphs into factual evidence.',
   ...(totalWords<targetMinutes*70?['The supplied text may be too short for the requested duration without explicit commentary. Do not pad or fabricate details.']:[])
  ],nextAction:'Apply SKILL.md to the complete source, select a defensible essence, write an editorial plan, then emit a SHF-Direction 0.4 scene plan with library objects and semantic actions.'};
}
