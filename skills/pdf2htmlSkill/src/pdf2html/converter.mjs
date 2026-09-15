import { mkdir, mkdtemp, writeFile, rm, rename, realpath } from 'node:fs/promises';
import { resolve, join, dirname, basename, extname } from 'node:path';
import { requireRuntime, extractDocument } from './runtime.mjs';
import { inspectSource, extractFonts } from './source.mjs';
import { serializeDocument } from './serializer.mjs';
import { recoverRuledTables } from './table-recovery.mjs';
import { enhanceHtml } from './renderer.mjs';
import { preserveImages } from './images.mjs';
import { validateOutput } from './validation.mjs';
import { exists, prepareDestination, writeMarker, publish } from './publication.mjs';
export const qaDestination = destination => join(dirname(destination),'.pdf2html-qa',basename(destination));
export async function convertPdf(input,destination,{language='und',title,imageScale=2,overwrite=false,keepQaArtifacts=false}={}) {
  if(!Number.isFinite(imageScale) || imageScale<=0) throw new Error('--image-scale must be greater than zero.');
  const runtime=await requireRuntime();
  const source=await inspectSource(input), profile=source.profile;
  destination=resolve(destination);
  await prepareDestination(destination,overwrite);
  await mkdir(dirname(destination),{recursive:true});
  destination=join(await realpath(dirname(destination)),basename(destination));
  // An isolated publication must never contain the immutable source PDF.
  if(profile.path===destination || profile.path.startsWith(`${destination}/`)) throw new Error('--output must not contain the source PDF. Use in-place conversion to publish beside the source.');
  const staging=await mkdtemp(join(dirname(destination),'.pdf2html-'));
  try {
    const document=recoverRuledTables(await extractDocument(profile.path),source.evidence);
    const serialized=await serializeDocument(document,source,staging,imageScale);
    await writeFile(join(staging,'index.html'),serialized.html);
    source.evidence.fonts=await extractFonts(profile.path,source.qpdf,join(staging,'assets/fonts'));
    const documentTitle=title||profile.title||basename(profile.path,extname(profile.path));
    await enhanceHtml(join(staging,'index.html'),join(staging,'assets/styles.css'),source.evidence,{title:documentTitle,language,content_pages:serialized.content_pages});
    const pictures=serialized.pictures+await preserveImages(source,join(staging,'index.html'),imageScale);
    await writeMarker(staging);
    const report=await validateOutput(profile,join(staging,'index.html'),{expectedTables:serialized.tables,expectedPictures:pictures,keepQaArtifacts,reportDir:join(staging,'qa')});
    if(report.status==='failed') {
      let failed=`${destination}-failed`,suffix=1;
      while(await exists(failed)) failed=`${destination}-failed-${suffix++}`;
      await rename(staging,failed);
      const error=new Error(`Validation failed. Diagnostic output retained at: ${failed}`); error.diagnosticOutput=failed; throw error;
    }
    const manifest={generator:'pdf2html-skill',version:'0.1.0',artifact:join(destination,'index.html'),output:destination,source:{name:basename(profile.path),sha256:profile.sha256,pages:profile.pages},options:{language,title:documentTitle,imageScale,ocr:false},document:{tables:serialized.tables,pictures},validation:{status:report.status,warnings:report.findings.filter(item=>item.severity==='warning').length,metrics:report.metrics},runtime};
    if(keepQaArtifacts) {const qa=qaDestination(destination);await mkdir(dirname(qa),{recursive:true});await publish(join(staging,'qa'),qa);manifest.validation.report=join(qa,'report.json');}
    else await rm(join(staging,'qa'),{recursive:true});
    await publish(staging,destination);
    return manifest;
  } finally {await rm(staging,{recursive:true,force:true});}
}
export async function validateExisting(input,htmlPath,keepQaArtifacts=false) {
  await requireRuntime();
  const {profile}=await inspectSource(input);
  return validateOutput(profile,htmlPath,{keepQaArtifacts,reportDir:keepQaArtifacts?qaDestination(dirname(resolve(htmlPath))):undefined});
}
