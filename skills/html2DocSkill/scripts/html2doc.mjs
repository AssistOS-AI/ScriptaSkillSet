import { parseArgs } from 'node:util';
if(Number(process.versions.node.split('.')[0])<22){console.error('Node.js >=22 is required.');process.exit(1);}
try{
 const core=await import('../src/core.mjs').catch(e=>{throw new Error('Bundled runtime is missing or incompatible; restore external/runtime. '+e.message);});
 const {values,positionals}=parseArgs({allowPositionals:true,options:{output:{type:'string'},title:{type:'string'},author:{type:'string'},lang:{type:'string'},overwrite:{type:'boolean'},docx:{type:'string'},help:{type:'boolean'}}});
 const [command,input,...extra]=positionals;if(values.help){console.log('html2doc doctor | convert INPUT [--output FILE] [--title TEXT] [--author TEXT] [--lang TAG] [--overwrite] | validate INPUT --docx FILE');process.exit(0);}if(extra.length||command!=='doctor'&&!input)throw new Error('Invalid arguments; use --help.');
 const result=command==='doctor'?{ok:true,node:process.versions.node}:command==='convert'?await core.convert(input,values.output,{title:values.title,author:values.author,language:values.lang,overwrite:values.overwrite}):command==='validate'&&values.docx?await core.validate(input,values.docx):null;
 if(!result)throw new Error('Invalid command; use --help.');console.log(JSON.stringify(result,null,2));if(result.status==='failed')process.exitCode=1;
}catch(e){console.error('html2doc: '+e.message);process.exitCode=1;}
