import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openBrowser } from './browser.mjs';
import { guardInstallation } from './installation-guard.mjs';
import {translationStyles,translatedStyleCheck} from './translation-style.mjs';
import {compareImageStyles} from './images.mjs';
import {restorePublisherIdentity} from './source-identity.mjs';
import { hash, fileHash, readJson, writeJson, exists, verifyInputs, inside } from './storage.mjs';
import { checkDisplay, compareEnglish, compareStructure, comparePdfFonts, parsePdfGeometry, comparePdfGeometry, issue } from './layout-checks.mjs';
import { navigate, measure, applyDomRepairs } from './layout-browser.mjs';
import { layoutReport, writeLayoutReport } from './layout-report.mjs';
import { recoverLists } from './lists.mjs';
import { compareTables, translatedTables } from './tables.mjs';
import { sourceDecorations, sourceFonts, compareDecorations, decorationActions, translatedDecorations } from './decorations.mjs';

import {parsePdfTypography,sourceTypographyProfile,compareTypography,typographyActions} from './typography.mjs';
import {readerPresentation} from './reader-presentation.mjs';
import {readerTypographyRepairs,readerGeometryCss} from './reader-repairs.mjs';
import {tryCorrectionBatches} from './correction-batches.mjs';
import {readingPages} from './layout-checks.mjs';
import {restoreReferenceBoundaries,restoreSplitSourcePhrases} from './source-boundaries.mjs';
import {displayPageProfiles,repairDisplayPages,checkDisplayPages} from './display-pages.mjs';
import {repairFalseHeadings} from './false-headings.mjs';
import {paginateDocument,repairPageShells,paginationCss,translatedPaginationCss,sourcePagePresentation,sourceImagePresentation,applyContentsPresentation,applySourceImagePresentation,pagePaddingDifferences,pageHeightDifferences,sourceBlankPages} from './pagination.mjs';
const execute = promisify(execFile);
export const report = layoutReport;
export async function doctor(options = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js >=22 required');
  const tools = {};
  for (const name of ['chromium', 'pdftotext', 'pdffonts', 'pdfimages', 'pdftohtml']) {
    const file = options[name] || process.env['VALIDATEBOOK_' + name.toUpperCase()] || (name==='pdftohtml'&&tools.pdftotext?path.join(path.dirname(tools.pdftotext),'pdftohtml'):null);
    if (!file || !path.isAbsolute(file)) throw Error(`Configure an absolute ${name} executable path. See dependencies.md; nothing is installed automatically.`);
    await fs.access(file); tools[name] = file;
  }
  const runtime = { node: process.versions.node };
  for (const name of ['pdftotext', 'pdffonts', 'pdfimages', 'pdftohtml']) {
    const p = await execute(tools[name], ['-v'], { timeout: 10000 });
    runtime[name] = (p.stdout + p.stderr).trim();
    if (!/poppler|pdfto|pdffonts|pdfimages/i.test(runtime[name])) throw Error(`Incompatible ${name}`);
  }
  const browser = await openBrowser(tools.chromium);
  try { runtime.chromium = await browser.send('Browser.getVersion'); } finally { await browser.close(); }
  return { status: 'passed', tools, runtime };
}

export async function discover(root, options = {}) {
  root = await fs.realpath(root);
  if (path.basename(root) === 'en' && await exists(path.join(root, '..', 'manifest.json'))) root = path.dirname(root);
  const filename = options.filename || 'full_content.html';
  if (path.basename(filename) !== filename || !filename.endsWith('.html')) throw Error('filename must be a plain HTML filename');
  if (options.documents || options.acceptedEnglishReport) throw Error('Editorial baseline and translation-correction overrides are unsupported; use the native layout pipeline.');
  const manifest = await exists(path.join(root, 'manifest.json')) ? await readJson(path.join(root, 'manifest.json')) : null;
  const editions = manifest?.editions || {};
  const pdf = path.resolve(options.pdf || path.join(root, editions.en?.pdf || 'en/book.pdf'));
  const english = path.resolve(options.english || path.join(root, editions.en?.fullContent || `en/${filename}`));
  if ((!options.pdf && !inside(root,pdf)) || (!options.english && !inside(root,english))) throw Error('Manifest source path escapes book root');
  if (!await exists(pdf) || !await exists(english)) throw Error('Existing English PDF and HTML required');
  const documents = [{ language: 'en', file: await fs.realpath(english) }], absent = [];
  const requested = [...new Set(options.languages ? options.languages.split(',') : [...Object.keys(editions), 'ro', 'fr', 'de', 'es', 'pt', 'it', 'pl'])];
  for (const language of requested) {
    if (language === 'en') continue;
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(language)) throw Error('Invalid language');
    const file = path.resolve(root, editions[language]?.fullContent || `${language}/${filename}`);
    if (!inside(root, file)) throw Error('Manifest reader path escapes book root');
    if (await exists(file)) { const actual=await fs.realpath(file); if(!inside(root,actual))throw Error('Reader symlink escapes book root'); documents.push({language,file:actual}); }
    else if (editions[language]?.fullContent) throw Error(`Declared reader missing: ${file}; no missing translation will be created`);
    else absent.push({ language, status: 'not_present' });
  }
  if (new Set(documents.map(d => d.file)).size !== documents.length) throw Error('Languages cannot share one canonical reader file');
  return { root, pdf: await fs.realpath(pdf), documents, absent };
}

const responsiveCss = '/* validateBook local layout repair */\nimg,svg,video{max-width:100%;height:auto}\ntable{max-width:100%;border-collapse:collapse}\nth,td{overflow-wrap:anywhere}\np,li,blockquote,figcaption{overflow-wrap:anywhere}\n';
export async function collectAssets(document) {
  const inputs = [], findings = [], seen = new Set();
  const visit = async url => {
    if (seen.has(url) || url.startsWith('data:')) return; seen.add(url);
    if (!url.startsWith('file:')) {
      const refs = document.resources.filter(r => r.url === url);
      const script = refs.length && refs.every(r => r.tag === 'script');
      findings.push(issue(document.language, script ? 'unexecuted_remote_script' : 'remote_asset', url, 'Remote traffic is blocked; remote visual assets cannot be certified.', { severity: script ? 'warning' : 'error' })); return;
    }
    const u = new URL(url); u.search = ''; u.hash = ''; const file = fileURLToPath(u);
    if (!await exists(file)) { findings.push(issue(document.language, 'missing_asset', file, 'Local resource is missing.')); return; }
    inputs.push({ file, sha256: await fileHash(file) });
    if (file.endsWith('.css')) {
      const css = await fs.readFile(file, 'utf8');
      const refs = [...css.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g), ...css.matchAll(/@import\s+['"]([^'"]+)['"]/g)];
      for (const match of refs) await visit(new URL(match[1], u).href);
    }
  };
  for (const u of [...document.resources.map(r => r.url), ...document.loadedResources]) await visit(u);
  for(const link of document.localLinks || []) {
    const url=new URL(link);url.search='';url.hash='';const file=fileURLToPath(url);
    if(!await exists(file))findings.push(issue(document.language,'broken_local_link',link,'Local link destination does not exist.'));
  }
  return { inputs, findings };
}

async function sheets(browser, source, target) {
  await navigate(browser, source);
  const list = await browser.evaluate('Array.from(document.querySelectorAll("link[rel=stylesheet]:not([data-validatebook-presentation]),style"), n => n.tagName === "LINK" ? ({href:n.href}) : ({css:n.textContent}))');
  return list.map(s => {
    if (s.href) { if (!s.href.startsWith('file:')) throw Error('Cannot propagate remote stylesheet'); const u = new URL(s.href); const suffix = u.search + u.hash; u.search = ''; u.hash = ''; return { href: path.relative(path.dirname(target), fileURLToPath(u)).split(path.sep).join('/') + suffix }; }
    // Resolve inline stylesheet URLs relative to the English HTML, retaining target-local paths.
    return { css: s.css.replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g, (all, q, value) => {
      if (/^(data:|#)/.test(value)) return all;
      const u = new URL(value, pathToFileURL(source)); if (u.protocol !== 'file:') throw Error('Cannot propagate remote inline CSS');
      const suffix = u.search + u.hash; u.search = ''; u.hash = ''; return `url(${JSON.stringify(path.relative(path.dirname(target), fileURLToPath(u)).split(path.sep).join('/') + suffix)})`;
    }).replace(/@import\s+(['"])([^'"]+)\1/g, (all,q,value) => {
      const u=new URL(value,pathToFileURL(source));if(u.protocol!=='file:')throw Error('Cannot propagate remote CSS import');
      const suffix=u.search+u.hash;u.search='';u.hash='';return '@import '+JSON.stringify(path.relative(path.dirname(target),fileURLToPath(u)).split(path.sep).join('/')+suffix);
    }) };
  });
}

export async function prepare(root, options = {}) {
  if(options.paginate&&!options.autoCorrect)throw Error('--paginate requires --auto-correct');
  if(options.wordSpacing&&!['source','natural'].includes(options.wordSpacing))throw Error('--word-spacing must be source or natural');
  const selection = await discover(root, options);
  const initialInputs = await Promise.all([selection.pdf, ...selection.documents.map(d => d.file)].map(async file => ({ file, sha256: await fileHash(file) })));
  if(options.patches || options['reviewed-differences']) throw Error('External repair and review plans are unsupported; validateBook verifies and corrects from local source evidence only.');
  const graphicsProvider=options.pdf2html || process.env.VALIDATEBOOK_PDF2HTML;
  if(!graphicsProvider || !path.isAbsolute(graphicsProvider))throw Error('Configure --pdf2html or VALIDATEBOOK_PDF2HTML with the absolute pdf2html skill launcher path');
  await fs.access(graphicsProvider);
  const requestHash=hash(JSON.stringify({scope:'layout_and_structure',graphicsProvider,paginate:!!options.paginate,restoreSourcePublisher:!!options.restoreSourcePublisher,wordSpacing:options.wordSpacing||'source',root:selection.root,pdf:selection.pdf,documents:selection.documents,autoCorrect:!!options.autoCorrect}));
  const directory = path.resolve(options.jobDir || path.join(selection.root, '.validatebook-layout-jobs', requestHash.slice(0,20)));
  if (await exists(path.join(directory, 'job.json'))) { const job=await readJson(path.join(directory,'job.json')); if(job.requestHash!==requestHash)throw Error('Job belongs to another book or request; use a separate directory'); return layoutReport(directory); }
  const runtime = await doctor(options);
  await fs.mkdir(directory, { recursive: true });
  const lock = await fs.open(path.join(directory, 'prepare.lock'), 'wx');
  const backups = [], corrections = [], artifacts = [], initialFindings = [], measurements = [], pageCoverage = [], resourceInputs = [];
  let browser;
  try {
    const extracted = await execute(runtime.tools.pdftotext, ['-layout', selection.pdf, '-'], { timeout: 120000, maxBuffer: 128e6 });
    const textPages = extracted.stdout.split('\f'); if (!textPages.at(-1).trim()) textPages.pop();
    if (!textPages.some(p => p.trim())) throw Error('No extractable PDF text; OCR is outside scope');
    const pages = textPages.map((text, i) => ({ page: i + 1, text }));
    const [fontInfo, imageInfo, boxes, typography] = await Promise.all([
      execute(runtime.tools.pdffonts, [selection.pdf], { timeout: 120000, maxBuffer: 8e6 }),
      execute(runtime.tools.pdfimages, ['-list', selection.pdf], { timeout: 120000, maxBuffer: 8e6 }),
      execute(runtime.tools.pdftotext, ['-bbox-layout', selection.pdf, '-'], { timeout: 120000, maxBuffer: 128e6 }),
      execute(runtime.tools.pdftohtml,['-xml','-hidden','-i','-zoom','1','-stdout',selection.pdf],{timeout:120000,maxBuffer:128e6})]);
    const pdfSha256=initialInputs.find(i=>i.file===selection.pdf).sha256;
    const decorations = await sourceDecorations(selection.pdf, pdfSha256, graphicsProvider);
    const fontDirectory=path.join(path.dirname(selection.documents[0].file),path.basename(selection.documents[0].file,'.html')+'.assets','fonts');
    const sourceFontsList=options.autoCorrect?await sourceFonts(selection.pdf,pdfSha256,graphicsProvider,fontDirectory):[];
    const fontKey=name=>name.replace(/^[A-Z]{6}\+/,'').replace(/[-_ ]?(regular|bold|italic|bolditalic|roman|mt)$/ig,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
    const sourceFontMap=Object.fromEntries(sourceFontsList.flatMap(font=>{
      const name=`${font.source_name} ${font.css_family}`.toLowerCase();
      const generic=/garamond|georgia|times|palatino|minion|caslon|baskerville/.test(name)?'Georgia, serif':/inter|arial|helvetica|segoe|roboto|noto sans|sans/.test(name)?'system-ui, sans-serif':'Georgia, serif';
      const stack=`"${font.css_family}", ${generic}`;
      return [[fontKey(font.source_name),stack],[font.source_name,stack]];
    }));
    const sourceFontWeights={};
    for(const font of sourceFontsList){
      const key=fontKey(font.source_name);
      if(!sourceFontWeights[key])sourceFontWeights[key]=[];
      if(!sourceFontWeights[key].includes(font.weight))sourceFontWeights[key].push(font.weight);
    }
    const sourceEvidence = { pages, decorations, fonts:sourceFontsList, fontInventory: fontInfo.stdout, imageInventory: imageInfo.stdout, wordAndLineBounds: boxes.stdout, typographyXml:typography.stdout };
    await writeJson(path.join(directory, 'source-evidence.json'), sourceEvidence);
    artifacts.push({ file: path.join(directory, 'source-evidence.json'), sha256: await fileHash(path.join(directory, 'source-evidence.json')) });
    browser = await openBrowser(runtime.tools.chromium);
    const pdfGeometry=await browser.evaluate(`(${parsePdfGeometry.toString()})(${JSON.stringify(boxes.stdout)})`);
    const hasPageContainers=(await fs.readFile(selection.documents[0].file,'utf8')).includes('class="pdf-source-page"');
    const pagePresentation=options.paginate||hasPageContainers?await browser.evaluate(`(${sourcePagePresentation.toString()})(${JSON.stringify(typography.stdout)})`):null;
    if(pagePresentation)pagePresentation.images=sourceImagePresentation(imageInfo.stdout);
    let contentsMapping=[];
    const sourceType=sourceTypographyProfile(await browser.evaluate(`(${parsePdfTypography.toString()})(${JSON.stringify(typography.stdout)})`),pdfGeometry);
    const displayPages=await browser.evaluate(`(${displayPageProfiles.toString()})(${JSON.stringify(typography.stdout)},${JSON.stringify(decorations)})`);
    sourceType.displayPages=displayPages.map(p=>p.page);
    sourceType.tableFragments=decorations.tables;
    let english;
    const unresolved = [];
    const expectedCurrent = new Map(initialInputs.map(i => [i.file, i.sha256]));
    async function apply(item, actions, presentation, repairShells = false, mode='all') {
      if (!actions.length && !repairShells && mode==='all' && !options.paginate) return;
      const structure=mode==='all'||mode==='structure';
      const fontRules=sourceFontsList.map(font=>`@font-face { font-family: "${font.css_family}"; src: url("${path.relative(path.dirname(item.file),path.join(fontDirectory,path.basename(font.href))).split(path.sep).join('/')}") format("${font.href.endsWith('.otf')?'opentype':'truetype'}"); font-style: ${font.style}; font-weight: ${font.weight}; font-display: block; }`).join('\n');
      await navigate(browser, item.file);
      await browser.evaluate('document.body.setAttribute("data-validatebook-root", "")');
      const cssFile = path.join(path.dirname(item.file), 'validatebook-layout.css');
      const cssBefore = await exists(cssFile) ? {file:cssFile,sha256:await fileHash(cssFile)} : null;
      if(cssBefore && !(await fs.readFile(cssFile,'utf8')).startsWith('/* validateBook managed presentation;'))throw Error('Managed stylesheet destination is occupied by unrelated content');
      const identityChanges=structure&&options.restoreSourcePublisher?await browser.evaluate(`(${restorePublisherIdentity.toString()})(${JSON.stringify(pages)})`):[];
      const applied=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify(actions)})`);
      applied.changes.push(...identityChanges);
      if(structure&&item.language==='en')applied.changes.push(...await browser.evaluate(`(${repairFalseHeadings.toString()})(${JSON.stringify(typography.stdout)})`));
      if(structure&&item.language==='en')applied.changes.push(...await browser.evaluate(`(${restoreReferenceBoundaries.toString()})(${JSON.stringify(readingPages(pages))})`));
      if(structure&&item.language==='en')applied.changes.push(...await browser.evaluate(`(${restoreSplitSourcePhrases.toString()})(${JSON.stringify(typography.stdout)})`));
      let listRepair=null;
      if(structure&&item.language==='en'&&decorations?.lists)listRepair=await browser.evaluate(`(${recoverLists.toString()})(${JSON.stringify(decorations.lists)},true)`);
      const result = {changes:[...applied.changes]};
      if(listRepair)result.changes.push(...listRepair.changes);
      if(options.paginate&&item.language==='en'&&(mode==='all'||mode==='pagination')){
        const anchors=await browser.evaluate('Array.from(document.querySelectorAll("[id]"),n=>/^page_\\d+$/.test(n.id)?Number(n.id.slice(5)):null).filter(Boolean)');
        const blankPages=item.language==='en'?sourceBlankPages(pages,anchors):[];
        const paginated=await browser.evaluate(`(${paginateDocument.toString()})(${JSON.stringify({blankPages,origin:item.language==='en'?'source':'translation',expectedPages:item.language==='en'?pages.length:null})})`);
        // Measure and consolidate against the same page geometry that will be
        // installed. Otherwise cover auto margins are captured before reflow.
        await browser.evaluate(`{const style=document.createElement('style');style.dataset.validatebookCandidatePages='';style.textContent=${JSON.stringify(paginationCss(pagePresentation))};document.head.append(style);}`);
        const contents=await browser.evaluate(`(${applyContentsPresentation.toString()})(${JSON.stringify({profile:pagePresentation,language:item.language,mapping:contentsMapping})})`);
        if(item.language==='en')contentsMapping=contents.mapping;
        result.changes.push(...contents.changes);
        if(item.language==='en'){
          const images=await browser.evaluate(`(${applySourceImagePresentation.toString()})(${JSON.stringify(pagePresentation)})`);
          result.changes.push(...images.changes);
        }
        result.changes.push({kind:'pagination',before:'page anchors in continuous text',after:paginated});
        delete result.changes.at(-1).after.html;
        result.changes.push({kind:'source_page_presentation',margins:pagePresentation.margins,contents:contents.mapping,unmatched:contents.unmatched});
      }
      if(item.language==='en'&&(mode==='all'||mode==='display'))result.changes.push(...await browser.evaluate(`(${repairDisplayPages.toString()})(${JSON.stringify(displayPages)},${JSON.stringify(Object.keys(sourceFontMap).length?sourceFontMap:presentation.sourceDisplayFamily)},${presentation.defaultSizePx*(presentation.scale||1)})`));
      result.changes.push(...await browser.evaluate(`(${repairPageShells.toString()})()`));
      const consolidated=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css',previousCss:cssBefore?await fs.readFile(cssFile,'utf8'):null,importedFontRatio:presentation?.articleContract?.fontRatio,standaloneSizeRem:presentation?.standaloneSizeRem}])})`);
      result.html=consolidated.html;
      result.html=result.html.replace(/<style data-validatebook-candidate-pages="">[\s\S]*?<\/style>/g,'');
      result.stylesheet=consolidated.stylesheet;
      if(fontRules)result.stylesheet.css=result.stylesheet.css.replace('/* validateBook managed presentation; generated from verified declarations */','/* validateBook managed presentation; generated from verified declarations */\n'+fontRules);
      result.changes.push(...consolidated.changes);
      if(pagePresentation&&item.language==='en')result.stylesheet.css=result.stylesheet.css.split('/* validateBook source pagination */')[0]+paginationCss(pagePresentation);
      // Recognize nested covers. Translations keep their own breaks and gaps,
      // with the same full-page minimum proportions as the source edition.
      result.stylesheet.css=result.stylesheet.css.replaceAll(':has(> figure#page_1)',':has(figure#page_1)').replaceAll('.pdf-source-page > figure#page_1','.pdf-source-page figure#page_1');
      if(item.language!=='en'&&pagePresentation){
        const marker='/* validateBook translated flow */';
        result.stylesheet.css=result.stylesheet.css.split(marker)[0]+translatedPaginationCss(pagePresentation);
      }
      if(presentation.geometryCss)result.stylesheet.css+='\n'+presentation.geometryCss;
      if (!result.changes.length) return;
      if(result.html===await fs.readFile(item.file,'utf8')&&cssBefore&&result.stylesheet.css===await fs.readFile(cssFile,'utf8'))return false;
      await guardInstallation(browser,item,result,presentation,pagePresentation);
      const expected = initialInputs.find(i => i.file === item.file).sha256;
      if (await fileHash(item.file) !== expected) throw Error('Concurrent source change before repair: ' + item.file);
      const backup = path.join(directory, 'recovery', item.language, path.basename(item.file)); await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.copyFile(item.file, backup, fs.constants.COPYFILE_EXCL);
      backups.push({ file: item.file, backup, sha256: expected });
      if(result.stylesheet){
        if(cssBefore){
          await verifyInputs([cssBefore]);
          const cssBackup=path.join(path.dirname(backup),'validatebook-layout.css');
          await fs.copyFile(cssFile,cssBackup,fs.constants.COPYFILE_EXCL);
          backups.push({...cssBefore,backup:cssBackup});
        }
        const cssTemporary=cssFile+'.validatebook-'+hash(directory).slice(0,10)+'.tmp';
        await fs.writeFile(cssTemporary,result.stylesheet.css,{flag:'wx'});
        if(cssBefore)await verifyInputs([cssBefore]);else if(await exists(cssFile))throw Error('Managed stylesheet appeared during repair');
        await fs.rename(cssTemporary,cssFile);
        expectedCurrent.set(cssFile,await fileHash(cssFile));
      }
      const temp = item.file + '.validatebook-' + hash(directory).slice(0, 10) + '.tmp';
      await fs.writeFile(temp, result.html, { flag: 'wx' });
      if (await fileHash(item.file) !== expected) { await fs.unlink(temp); throw Error('Concurrent source change during repair'); }
      await fs.rename(temp, item.file);
      expectedCurrent.set(item.file, await fileHash(item.file));
      corrections.push(...result.changes.map(c => ({ ...c, file: item.file, language: item.language })));
      // Persist recovery immediately, including if subsequent measurement fails.
      await writeJson(path.join(directory, 'recovery.json'), { backups, corrections });
      return true;
    }
    for (const item of selection.documents) {
      const standalone = await measure(browser, item.file);
      let presentation=await readerPresentation(standalone,item.file);
      const fidelityMarker=options.autoCorrect&&presentation.kind==='reader-default'&&!standalone.presentation.fidelity;
      if(fidelityMarker)presentation=await readerPresentation({...standalone,presentation:{...standalone.presentation,fidelity:true}},item.file);
      if(options.autoCorrect&&presentation.repair){
        const patch=presentation.repair;if(await fileHash(patch.file)!==patch.sha256)throw Error('Reader contract changed during preparation');
        const backup=path.join(directory,'recovery','reader',path.basename(patch.file));await fs.mkdir(path.dirname(backup),{recursive:true});await fs.copyFile(patch.file,backup,fs.constants.COPYFILE_EXCL);
        const temp=patch.file+'.validatebook-'+hash(directory).slice(0,10)+'.tmp';await fs.writeFile(temp,patch.content,{flag:'wx'});
        if(await fileHash(patch.file)!==patch.sha256){await fs.unlink(temp);throw Error('Reader contract changed before installation');}await fs.rename(temp,patch.file);
        backups.push({file:patch.file,backup,sha256:patch.sha256});corrections.push({kind:'reader_default_scaling',file:patch.file,before:patch.before,after:patch.after});
        await writeJson(path.join(directory,'recovery.json'),{backups,corrections});presentation=await readerPresentation(standalone,item.file);
      }
      resourceInputs.push(...presentation.inputs);
      const before=presentation.scale&&presentation.scale!==1?await measure(browser,item.file,presentation):standalone;
      before.delivery=presentation;
      const typeComparison=compareTypography(sourceType,before,item.language,{sourceFontMap});
      if(displayPages.length&&item.language==='en'){
        const familyKey=s=>s.replace(/^[A-Z]{6}\+/,'').replace(/[^a-z]/gi,'').toLowerCase();
        const sourceFamilies=new Set(displayPages.flatMap(p=>p.groups.map(g=>familyKey(g.family))));
        const rendered=before.platformFonts.filter(sample=>sample.fonts.some(f=>f.isCustomFont&&sourceFamilies.has(familyKey(f.familyName))));
        const families=[...new Set(rendered.map(sample=>before.records.find(r=>r.selector===sample.selector)?.font.family).filter(Boolean))];
        if(sourceFamilies.size===1&&families.length===1)presentation.sourceDisplayFamily=families[0];
      }
      const borderComparison=item.language==='en'?compareDecorations(decorations,before):null;
      if(borderComparison)initialFindings.push(...borderComparison.findings);
      initialFindings.push(...typeComparison.findings);
      if(item.language==='en'&&decorations?.lists){await navigate(browser,item.file);const listCheck=await browser.evaluate(`(${recoverLists.toString()})(${JSON.stringify(decorations.lists)})`);initialFindings.push(...listCheck.findings.map(f=>issue('en',f.kind,'page '+f.page,'PDF list structure differs from HTML.',f)));}
      const beforeDisplay = before.layouts.flatMap(l => checkDisplay(l, item.language));
      const translatedStyles=english?translationStyles(english,sourceType,sourceFontMap):null;
      const repairShells=beforeDisplay.some(f=>['page_spacing_ownership_conflict','reader_root_incomplete'].includes(f.category));
      const structure = english ? compareStructure(english, before, item.language) : null;
      if(english)initialFindings.push(...compareImageStyles(english,before,item.language).findings);
      const tableProfile=english?translatedTables(decorations.tables,english,before,structure):decorations.tables;
      const tableOptions={sourceFontMap,defaultSizePx:presentation.defaultSizePx*(presentation.scale||1),language:item.language};
      const tableComparison=compareTables(tableProfile,before,tableOptions);
      initialFindings.push(...tableComparison.findings);
      initialFindings.push(...beforeDisplay, ...(structure?.findings || []));
      const targetDecorations=english?translatedDecorations(decorations,english,before,structure,item.language):decorations;
      const actions = [];
      if (options.autoCorrect) {
        const displayRepairs=[];const displayRepairKeys=new Set();
        for(const finding of beforeDisplay)if(finding.repair){const key=finding.repair.kind+'|'+finding.repair.selector;if(!displayRepairKeys.has(key)){displayRepairKeys.add(key);displayRepairs.push(finding.repair);}}
        actions.push(...displayRepairs);
        if(fidelityMarker)actions.push({kind:'source_fidelity'});
        if(!english||!unresolved.some(f=>f.language==='en'&&f.severity==='error'))actions.push(...tableComparison.actions);
        if(borderComparison)actions.push(...decorationActions(borderComparison));
        actions.unshift(...typographyActions(sourceType,before,typeComparison,{defaultSizePx:presentation.defaultSizePx*(presentation.scale||1),justifyPolicy:options.wordSpacing||'source',masterTypography:english?.typography||typeComparison,sourceFontMap,sourceFontWeights}));
        if(translatedStyles)actions.push(...translatedStyleCheck(before,translatedStyles,sourceType,item.language,presentation.defaultSizePx*(presentation.scale||1)).actions);
        if(presentation.articleContract){
          const imported=await measure(browser,item.file,{importedArticle:presentation.articleContract});
          presentation.geometryCss=await browser.evaluate(`(${readerGeometryCss.toString()})(${JSON.stringify(await fs.readFile(fileURLToPath(presentation.articleContract.readerCss),'utf8'))})`);
          actions.unshift(...readerTypographyRepairs(before,imported,presentation.defaultSizePx*(presentation.scale||1)));
        }
        if (before.language.toLowerCase() !== item.language.toLowerCase()) actions.unshift({ kind: 'language_tag', language: item.language });
        if (beforeDisplay.some(f => ['horizontal_overflow', 'outside_content'].includes(f.category))) actions.push({ kind: 'stylesheet', css: responsiveCss });
        // English presentation is the master. Propagate only when its local layout has no unresolved errors.
        if (english && !unresolved.some(f => f.language === 'en' && f.severity === 'error')) {
          actions.push(...compareImageStyles(english,before,item.language).actions);
          actions.push(...structure.findings.filter(f => f.repair).map(f => f.repair));
          actions.push(...decorationActions(compareDecorations(targetDecorations,before,item.language)));
          const inherited = await sheets(browser, selection.documents[0].file, item.file);
          const bodyAttributes = await browser.evaluate('Object.fromEntries(["class","data-pdf-fidelity"].map(k=>[k,document.body.getAttribute(k)]).filter(p=>p[1]))');
          actions.push({ kind: 'inherit_styles', sheets: inherited, bodyAttributes });
          for (const match of structure.matches) {
            const sourceBlock=english.records.find(r=>r.selector===match.source);
            if(sourceBlock?.tag==='p')actions.push({kind:'presentation',selector:match.target,properties:{'font-size':`calc(var(--reader-font-size, var(--standalone-size, ${presentation.defaultSizePx}px)) * ${parseFloat(sourceBlock.font.size)/presentation.defaultSizePx})`,'line-height':String(parseFloat(sourceBlock.style.lineHeight)/parseFloat(sourceBlock.font.size))}});
          }
        }
        const batches=[{name:'all',actions}];
        if(item.language==='en')batches.push({name:'pagination',actions:[]},{name:'tables',actions:tableComparison.actions},{name:'typography',actions:typographyActions(sourceType,before,typeComparison,{defaultSizePx:presentation.defaultSizePx*(presentation.scale||1),justifyPolicy:options.wordSpacing||'source',sourceFontMap,sourceFontWeights})},{name:'display',actions:[]},{name:'structure',actions:[]});
        const rejected=[];
        const accepted=await tryCorrectionBatches(batches,batch=>apply(item,batch.actions,presentation,repairShells,batch.name),async(batch,error)=>{
          await writeJson(path.join(directory,'rejected-candidate-'+item.language+'-'+batch.name+'.json'),{file:item.file,batch:batch.name,error:error.message,findings:error.findings||[]});
          rejected.push(issue(item.language,'correction_batch_rejected',batch.name,error.message));
        });
        // Failed attempts stay in the report even when another batch succeeds.
        initialFindings.push(...rejected);
        if(!accepted)unresolved.push(...rejected);
      }
      if(options.autoCorrect && item.language==='en' && decorations?.lists?.length && !actions.length)
        unresolved.push(issue(item.language,'list_correction_unavailable','document','List correction could not be consolidated safely; the document remains available and the error is retained in the final report.'));
      const final = options.autoCorrect ? await measure(browser, item.file,presentation) : before;
      final.delivery=presentation;
      if(item.language==='en')final.displayProfiles=displayPages;
      let listFindings=[];if(item.language==='en'&&decorations?.lists){await navigate(browser,item.file);const checked=await browser.evaluate(`(${recoverLists.toString()})(${JSON.stringify(decorations.lists)})`);listFindings=checked.findings.map(f=>issue('en',f.kind,'page '+f.page,'PDF list structure or typography differs from HTML.',f));}
      final.typography=compareTypography(sourceType,final,item.language,{sourceFontMap});
      const displayFindings=layouts=>item.language==='en'?checkDisplayPages(displayPages,layouts,sourceFontMap).map(f=>issue('en','source_display_page_difference','page '+f.page,f.detail,f)):[];
      const assets = await collectAssets(final); resourceInputs.push(...assets.inputs);
      let findings = [...listFindings,...final.typography.findings, ...final.layouts.flatMap(l => checkDisplay(l, item.language)), ...assets.findings];
      for(const layout of final.layouts.slice(1))findings.push(...compareTypography(sourceType,{...layout,platformFonts:final.platformFonts},item.language,{sourceFontMap}).findings);
      if(translatedStyles)findings.push(...final.layouts.flatMap(layout=>translatedStyleCheck(layout,translatedStyles,sourceType,item.language,presentation.defaultSizePx*(presentation.scale||1)).findings));
      findings.push(...final.layouts.flatMap(l=>compareTables(tableProfile,{...l,platformFonts:final.platformFonts},tableOptions).findings));
      findings.push(...displayFindings(final.layouts));
      if(item.language==='en')findings.push(...(await browser.evaluate(`(${repairFalseHeadings.toString()})(${JSON.stringify(typography.stdout)},false)`)).map(f=>issue('en','false_heading_in_paragraph','page '+f.page,f.detail,f)));
      findings.push(...final.layouts.flatMap(l=>compareDecorations(targetDecorations,l,item.language).findings));
      const paddingFindings=layouts=>layouts.flatMap(l=>pagePaddingDifferences(l,pagePresentation,item.language)).map(detail=>issue(item.language,'source_page_padding_difference','page '+detail.page,'Rendered page padding differs from measured PDF text bounds.',detail));
      findings.push(...paddingFindings(final.layouts));
      const heightFindings=layouts=>layouts.flatMap(l=>pageHeightDifferences(l,pagePresentation)).map(detail=>issue(item.language,'page_height_below_minimum','page '+detail.page,'Rendered page is shorter than the source page proportions; translations retain full pages while allowing content growth.',detail));
      findings.push(...heightFindings(final.layouts));
      if(english)findings.push(...final.layouts.flatMap((l,i)=>compareImageStyles(english.layouts[i],l,item.language).findings));
      if(presentation.articleContract){
        const article=await measure(browser,item.file,{importedArticle:presentation.articleContract});
        article.typography=compareTypography(sourceType,article,item.language,{sourceFontMap});
        for(const layout of article.layouts.slice(1))findings.push(...compareTypography(sourceType,{...layout,platformFonts:article.platformFonts},item.language,{sourceFontMap}).findings);
        if(translatedStyles)findings.push(...article.layouts.flatMap(layout=>translatedStyleCheck(layout,translatedStyles,sourceType,item.language,presentation.defaultSizePx*(presentation.scale||1)).findings));
        findings.push(...article.layouts.flatMap(l=>compareTables(tableProfile,{...l,platformFonts:article.platformFonts},tableOptions).findings));
        findings.push(...displayFindings(article.layouts));
        if(item.language==='en'&&decorations?.lists){const checked=await browser.evaluate(`(${recoverLists.toString()})(${JSON.stringify(decorations.lists)})`);findings.push(...checked.findings.map(f=>issue('en',f.kind,'page '+f.page,'Imported reader list structure or typography differs from PDF.',f)));}
        findings.push(...article.typography.findings,...article.layouts.flatMap(l=>checkDisplay(l,item.language)));
        findings.push(...article.layouts.flatMap(l=>compareDecorations(targetDecorations,l,item.language).findings));
        findings.push(...paddingFindings(article.layouts));
        findings.push(...heightFindings(article.layouts));
        if(english)findings.push(...article.layouts.flatMap((l,i)=>compareImageStyles(english.articleLayouts[i],l,item.language).findings));
        for(let v=0;v<final.layouts.length;v++){
          const source=final.layouts[v].records,target=article.layouts[v].records;
          if(source.length!==target.length)findings.push(issue(item.language,'reader_import_structure','article','Imported article changes the measured block count.'));
          else for(let i=0;i<source.length;i++){
            const a=source[i],b=target[i];
            if(a.text!==b.text||a.tag!==b.tag)findings.push(issue(item.language,'reader_import_structure',b.selector,'Imported article changes text or block order.'));
            else if(a.text&&a.tag!=='img'&&a.tag!=='table'&&a.displayGroup==null&&(Math.abs(parseFloat(a.font.size)/(a.pageScale||1)-parseFloat(b.font.size)/(b.pageScale||1))>.1||a.font.family!==b.font.family||Math.abs(parseFloat(a.style.lineHeight)/(a.pageScale||1)-parseFloat(b.style.lineHeight)/(b.pageScale||1))>.1))findings.push(issue(item.language,'reader_typography_difference',b.selector,'Imported article differs from standalone typography after normalizing their page widths.',{standalone:a.font,imported:b.font,width:article.layouts[v].width}));
          }
        }
        const articleFile=path.join(directory,item.language+'-article-layout.json');await writeJson(articleFile,article);artifacts.push({file:articleFile,sha256:await fileHash(articleFile)});
        if(item.language==='en')final.articleLayouts=article.layouts;
      }
      for (const f of final.platformFonts) if (!f.fonts.some(font => font.glyphCount > 0)) findings.push(issue(item.language, 'unrendered_text', f.selector, 'No platform font reports rendered glyphs for this nonempty text block.'));
      if (!english) {
        // Font inventories include faces used only for blank layout runs. Do not
        // require an invisible source face to render invented HTML characters.
        const visibleFamilies=new Set(sourceType.pages.flatMap(p=>p.lines.filter(l=>l.text.trim()).map(l=>l.font.family.replace(/^[A-Z]{6}\+/,'').replace(/[-_ ]?(regular|bold|italic|bolditalic|roman)$/i,'').toLowerCase())));
        const visibleInventory=fontInfo.stdout.split('\n').filter(line=>! /\s(?:yes|no)\s/.test(line)||visibleFamilies.has(line.trim().split(/\s+/)[0].replace(/^[A-Z]{6}\+/,'').replace(/[-_ ]?(regular|bold|italic|bolditalic|roman)$/i,'').toLowerCase())).join('\n');
        findings.push(...comparePdfFonts(visibleInventory, final.platformFonts, sourceFontsList));
        final.sourceGeometry=comparePdfGeometry(pdfGeometry,final);findings.push(...final.sourceGeometry.findings);
        const compared = compareEnglish(pages, final); pageCoverage.push(...compared.coverage); findings.push(...compared.findings);
        initialFindings.push(...compareEnglish(pages, before).findings);
        const sourceImages=imageInfo.stdout.split('\n').filter(line=>/^\s*\d+\s+\d+\s+image\s/.test(line));
        const htmlImages=final.records.filter(r=>r.tag==='img');
        if(sourceImages.length && !htmlImages.length) findings.push(issue('en','missing_source_images','document',`PDF lists ${sourceImages.length} images but HTML contains none.`));
        else if(sourceImages.length !== htmlImages.length) findings.push(issue('en','image_inventory_difference','document',`PDF image inventory ${sourceImages.length}; HTML images ${htmlImages.length}. PDF masks/tiling and HTML reuse could not be aligned deterministically.`,{severity:'warning'}));
        english = final;
      } else findings.push(...compareStructure(english, final, item.language).findings);
      const unique = new Map(findings.map(f => [f.id, f])); findings = [...unique.values()];
      unresolved.push(...findings);
      const evidence = path.join(directory, item.language + '-layout.json'); await writeJson(evidence, final); artifacts.push({ file: evidence, sha256: await fileHash(evidence) });
      measurements.push({ ...item, evidence, blocks: final.records.length, viewports: final.layouts.map(l => l.width) });
    }
    await verifyInputs([...expectedCurrent].map(([file, sha256]) => ({ file, sha256 })));
    await verifyInputs(resourceInputs);
    const inputs = [...new Map([...initialInputs.map(i => ({ ...i, sha256: null })), ...resourceInputs].map(i => [i.file, i])).values()];
    for (const input of inputs) input.sha256 = await fileHash(input.file);
    const findings = [...new Map(unresolved.map(f => [f.id, f])).values()];
    const result = { scope: 'layout_and_structure', status: findings.some(f => f.severity === 'error') ? 'needs_attention' : findings.length ? 'passed_with_warnings' : 'passed', job: directory,
      documents: measurements, absent: selection.absent, pageCoverage, initialFindings: [...new Map(initialFindings.map(f => [f.id, f])).values()], findings, corrections, backups,
      coverage: { pdfPages: pages.length, htmlDocuments: measurements.length, viewportsPerDocument: 3, localAutomationOnly: true, externalReviewsRequired: 0, screenshots: 0 },
      limitations: ['Layout/structural checks only; translation meaning, humanisation, summaries and metadata are not reviewed.', 'No font +/− tests, enlarged-text tests, screenshots, PDF rasterization or image reports.', 'Source PDF text, fonts, image inventory and bounding boxes are retained as text. Cases that local evidence cannot resolve deterministically remain explicit failed or warning findings.', 'Equal block counts or matching font names do not prove semantic completeness or every glyph. Unmatched source lines and ambiguous structural mappings remain findings.', 'Book scripts and remote traffic are disabled. Interactive host application behavior is outside this standalone layout audit.'] };
    await writeJson(path.join(directory, 'job.json'), { scope: 'layout_and_structure', requestHash, inputs, artifacts, result, runtime: runtime.runtime });
    await verifyInputs(inputs);
    return await writeLayoutReport(directory, result);
  } finally { if (browser) await browser.close(); await lock.close(); await fs.unlink(path.join(directory, 'prepare.lock')); }
}
