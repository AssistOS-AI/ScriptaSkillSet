#!/usr/bin/env python3
"""Optional integration QA: Python Playwright + Chromium, never runtime dependencies."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'evaluation'; OUT.mkdir(exist_ok=True)
results=[];metrics={};errors=[];requests=[]
def check(name,ok,detail=None):
 results.append({'name':name,'pass':bool(ok),**({'detail':detail} if detail is not None else {})})
def ev(script,arg=None):return page.evaluate(script,arg)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 metrics['browser']=browser.version
 context=browser.new_context(viewport={'width':1200,'height':980},device_scale_factor=1)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
 try:
  page.goto((ROOT/'SHF_Cinema_Demo.html').as_uri(),wait_until='load',timeout=7000);page.wait_for_function('document.getElementById("player").film',timeout=2000);metrics['fileURL']=True
 except Exception as e:metrics['fileURL']=False;metrics['fileURLLimitation']=str(e)[:220]
 page.close();page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
 page.set_content((ROOT/'SHF_Preview.html').read_text(),wait_until='load');page.wait_for_function('document.getElementById("player").film');ev('window.p=document.getElementById("player");p.setMuted(true)');context.set_offline(True)
 check('standalone includes four films and 28 scenes',ev('demoFilms.length===4 && demoFilms.reduce((n,f)=>n+f.scenes.length,0)===28'))
 check('three theme buttons are embedded in the transport',ev('p.shadowRoot.querySelectorAll(".controls [data-player-theme]").length===3&&!p.shadowRoot.querySelector("#settings #theme")'))
 check('no autoplay and no audio context until requested',ev('p.state==="paused"&&!p.audio.ctx'))
 check('no viewer notes or feedback interface',ev('!p.shadowRoot.querySelector("#note,#feedback,#noteText,#saveNote")'))
 ev('p.seek(12000)');before=ev('p.captureSVG()');page.wait_for_timeout(150)
 check('paused clock and vector state stay fixed',ev('p.currentTimeMs')==12000 and ev('p.captureSVG()')==before)
 ev('p.seek(34000);p.seek(12000)');check('seek A-B-A yields exact SVG state',ev('p.captureSVG()')==before)
 page.locator('shf-player').locator('#play').click();page.wait_for_function('p.playing');page.wait_for_timeout(350)
 check('narrated film uses audio clock',ev('p.clock==="audio" && p.audio.startedCount>0 && p.currentTimeMs>12200'))
 ev('window.countBefore=p.audio.startedCount;window.timeBefore=p.currentTimeMs;p.setMuted(true)');page.wait_for_timeout(280)
 check('mute does not restart/stop voice schedule',ev('p.audio.startedCount===countBefore&&p.currentTimeMs>timeBefore+180&&p.audio.sources.length>0'))
 check('mute master gain approaches zero',ev('p.audio.master.gain.value<.001'))
 ev('p.shadowRoot.querySelector("[data-player-theme=paper]").click()')
 check('theme selection retains the active voice schedule',ev('p.theme==="paper"&&p.audio.startedCount===countBefore&&p.playing&&p.shadowRoot.querySelectorAll("[data-player-theme][aria-pressed=true]").length===1'))
 ev('p.setVolume(0);window.timeBefore=p.currentTimeMs');page.wait_for_timeout(200)
 check('volume zero retains an advancing audio clock',ev('p.muted&&p.playing&&p.currentTimeMs>timeBefore+100'))
 ev('p.pause()');t=ev('p.currentTimeMs');page.wait_for_timeout(120)
 check('pause stops sources, RAF and clock',ev('p.audio.sources.length===0&&p.frame===0') and ev('p.currentTimeMs')==t)
 ev('p.setVolume(.6);p.setMuted(true);p.setMusic(true);p.seek(1000);p.play()');page.wait_for_function('p.playing');page.wait_for_timeout(250)
 check('music and voice scheduled together',ev('!!p.audio.musicSource&&p.audio.sources.length>0'))
 check('music ducking during spoken line',ev('p.voiceActive&&p.audio.music.gain.value<.035'))
 ev('p.pause();p.setRate(2);p.seek(1000);p.play()');page.wait_for_function('p.playing');page.wait_for_timeout(320);ev('p.pause()');t=ev('p.currentTimeMs')
 check('2x audio-derived rate advances approximately twice as fast',1500<t<2200,{'timeMs':t})
 # Force a slow next-scene decode and confirm the old scene remains visible.
 ev('''p.setRate(1);window.prepareOriginal=p.audio.prepare.bind(p.audio);p.audio.prepare=async function(s){if(s.id===p.film.scenes[1].id)await new Promise(r=>setTimeout(r,850));return prepareOriginal(s)};p.seek(p.film.scenes[0].durationMs-100);p.play()''')
 page.wait_for_function('p.state==="loading" && p.time===p.film.scenes[0].durationMs');page.wait_for_timeout(180)
 check('scene transition waits with old scene visible while audio prepares',ev('p.state==="loading" && !p.playing && p.sceneIndex===0 && p.currentTimeMs===p.film.scenes[0].durationMs'))
 page.wait_for_function('p.playing&&p.sceneIndex===1',timeout=5000)
 check('prepared next scene resumes on audio clock',ev('p.clock==="audio"&&p.audio.sources.length>0'))
 ev('p.pause();p.audio.prepare=prepareOriginal;true')
 # Cancel an asynchronous preparation: it must not start later.
 ev('''p.audio.prepare=async function(s){await new Promise(r=>setTimeout(r,450));return prepareOriginal(s)};p.seek(1000);p.play();p.pause()''');page.wait_for_timeout(650)
 check('late async audio completion cannot restart paused player',ev('!p.playing&&p.state==="paused"&&p.audio.sources.length===0'))
 ev('p.audio.prepare=prepareOriginal;true')
 # Invalid required voice is not silently ignored.
 ev('''window.goodFilm=p.film;window.badFilm=structuredClone(p.film);badFilm.assets[badFilm.scenes[0].audioClips[0].assetId].data=btoa('not a valid audio file');p.setFilm(badFilm);p.play()''')
 page.wait_for_function('p.state==="error"',timeout=5000)
 check('invalid required narration stops without drifting',ev('!p.playing&&p.currentTimeMs===0&&p.shadowRoot.getElementById("notice").textContent.length>0'))
 ev('p.setFilm(demoFilms[0]);p.setVolume(.7);p.setMuted(true);p.seek(p.durationMs-60);p.play()');page.wait_for_function('p.state==="ended"',timeout=5000)
 check('film ends exactly at its measured duration',ev('!p.playing&&p.currentTimeMs===p.durationMs'))
 ev('p.setFilm(demoFilms[0]);p.seek(30000)')
 for theme in ['color','paper','night']:
  ev('(t)=>p.setTheme(t)',theme);check('theme '+theme,ev('(t)=>p.svg.querySelector("rect").getAttribute("fill")===SHF.themes[t].bg',theme));page.locator('shf-player').locator('#stage').screenshot(path=str(OUT/f'cinema-{theme}.png'))
 check('subtitles live over the animation stage',ev('p.shadowRoot.getElementById("stage").contains(p.shadowRoot.getElementById("captionbox"))'))
 page.locator('shf-player').locator('#transcriptBtn').click();check('transcript opens from transport',ev('!p.shadowRoot.getElementById("transcript").hidden'))
 page.locator('shf-player').locator('#closeDrawer').click();page.locator('shf-player').locator('#chaptersBtn').click();check('chapters remain available',ev('p.shadowRoot.getElementById("chapters").children.length===4&&!p.shadowRoot.getElementById("chapters").hidden'))
 page.locator('shf-player').locator('#closeDrawer').click()
 count=ev('''async()=>{let n=0;for(const f of demoFilms){await p.setFilm(f);for(const theme of ['color','paper','night']){p.setTheme(theme);let start=0;for(const s of f.scenes){for(const ratio of [.05,.35,.6,.9]){p.seek(start+s.durationMs*ratio);const svg=p.captureSVG();if(/NaN|Infinity/.test(svg))throw Error('Nonfinite SVG');if([...p.svg.querySelectorAll('[fill],[stroke]')].some(e=>(e.getAttribute('fill')||'').startsWith('$')||(e.getAttribute('stroke')||'').startsWith('$')))throw Error('Unresolved token');n++;}start+=s.durationMs;}}}return n}''')
 metrics['renderedSceneThemeTimeStates']=count;check('336 scene-theme-time samples render',count==336)
 ev('p.setFilm(demoFilms[0]);p.jump(2);p.seek(p.currentTimeMs+p.film.scenes[2].durationMs*.75)')
 check('connections follow real transformed named anchors',ev('''()=>{const s=p.film.scenes[2],inv=p.dom.get('$camera').getCTM().inverse();return s.connections.length>0&&s.connections.every(c=>[[c.from,false],[c.to,true]].every(([port,last])=>{const xy=p.defs.get(port.node).anchors[port.anchor],pt=p.svg.createSVGPoint();pt.x=xy[0];pt.y=xy[1];const a=pt.matrixTransform(p.dom.get(port.node).getCTM()).matrixTransform(inv),path=p.dom.get(c.id)._shape,b=path.getPointAtLength(last?path.getTotalLength():0);return Math.hypot(a.x-b.x,a.y-b.y)<.03}))}'''))
 page.locator('#file').set_input_files(str(ROOT/'examples/rendered/mars-library.shf'));page.wait_for_function('p.film.id==="mars-library"')
 check('direct SHF import restores every media file',ev('Object.values(p.film.assets).every(a=>a.data?.length>0)'))
 check('independent player instance has separate state',ev('''async()=>{const q=document.createElement('shf-player');document.body.append(q);await q.setFilm(demoFilms[0]);q.seek(2000);const t=p.currentTimeMs;q.seek(5000);const ok=p.currentTimeMs===t&&q.svg!==p.svg;q.remove();return ok}'''))
 for label,w,h in [('phone',393,852),('small',320,740),('landscape',844,390)]:
  page.set_viewport_size({'width':w,'height':h});ev('p.setFilm(demoFilms[0]);p.setTheme("night");p.seek(30000)')
  check('no horizontal overflow '+label,ev('document.documentElement.scrollWidth<=innerWidth'))
  check('all visible transport icons fit '+label,ev('''()=>{const r=p.shadowRoot.getElementById('transport').getBoundingClientRect();return [...p.shadowRoot.querySelectorAll('.controls button')].filter(e=>getComputedStyle(e).display!=='none').every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1})}'''))
  if w<=540:check('caption rail clears artwork '+label,ev('p.$("captionbox").getBoundingClientRect().top>=p.$("art").getBoundingClientRect().bottom'))
  page.screenshot(path=str(OUT/f'preview-{label}.png'),full_page=True)
 page.set_viewport_size({'width':1200,'height':980});ev('p.style.width="320px"')
 check('narrow desktop embed also fits its controls',ev('''()=>{const r=p.shadowRoot.getElementById('transport').getBoundingClientRect();return [...p.shadowRoot.querySelectorAll('.controls button')].filter(e=>getComputedStyle(e).display!=='none').every(e=>e.getBoundingClientRect().right<=r.right+1)}'''))
 ev('p.style.width=""')
 page.set_content((ROOT/'SHF_Asset_Catalog.html').read_text(),wait_until='load');page.locator('#query').fill('microscope');check('catalog search finds a specific object',page.locator('.card').count()==1)
 page.locator('#query').fill('');page.locator('#category').select_option('people');check('catalog includes 288 character expression entries','288' in page.locator('#stats').inner_text())
 for theme in ['color','paper','night']:
  page.locator('#theme').select_option(theme);page.screenshot(path=str(OUT/f'people-{theme}.png'),full_page=True)
 check('all browser tests made no HTTP requests',not requests,requests);check('no unhandled JavaScript errors',not errors,errors)
 browser.close()
report={'checks':len(results),'passed':sum(x['pass'] for x in results),'failed':sum(not x['pass'] for x in results),'metrics':metrics,'results':results}
(OUT/'browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
if report['failed']:raise SystemExit(1)
