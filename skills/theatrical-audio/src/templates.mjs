import fs from 'node:fs/promises';
import path from 'node:path';
export async function createAudioTemplates(directory) {
 const template='# Optional cloud speech. Load explicitly with --credentials-file .env.audio\n# Unconfigured presentations use local Piper neural narration.\n# AUDIO_ENGINE=gemini\n# GEMINI_API_KEY=\n# OPENAI_API_KEY=\n';
 const created=[];
 for(const name of ['.env.audio.example','.env.audio']){
  try{await fs.writeFile(path.join(directory,name),template,{flag:'wx',mode:name==='.env.audio'?0o600:0o644});created.push(name);}catch(e){if(e.code!=='EEXIST')throw e;}
 }
 const file=path.join(directory,'.gitignore');let content='';try{content=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const missing=['/.env.audio','/.theatrical-audio/'].filter(line=>!content.split(/\r?\n/).includes(line));
 if(missing.length)await fs.appendFile(file,(content&&!content.endsWith('\n')?'\n':'')+'\n# Local narration credentials and cache\n'+missing.join('\n')+'\n');
 return created;
}
