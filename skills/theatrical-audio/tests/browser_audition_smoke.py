"""Development-only browser checks. No cloud request or real synthesis is performed."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
markup=(ROOT/'web/browser-audition.html').read_text()
report={'passed':False,'checks':[],'realSpeechGenerated':False,'limitations':['This tests UI and Web Speech argument routing, not actual voice availability/quality or successful file:// opening.']}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915})
    errors=[]; requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda q:requests.append(q.url) if q.url.startswith(('http:','https:')) else None)
    page.set_content(markup)
    assert 'Listening only' in page.inner_text('body') and 'not a file-export backend' in page.inner_text('body')
    report['checks'].append('Export limitation is visible')
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    report['checks'].append('No horizontal overflow at 412px')
    page.click('#refresh');page.click('#stop')
    assert not errors and not requests
    report['checks'].append('Load/refresh/stop produce no page errors or HTTP requests')
    page.screenshot(path=str(ROOT/'validation/browser-audition.png'),full_page=True)
    # A deterministic test double allows argument routing to be checked without generating speech.
    page.evaluate('''() => {
      window.recorded=[];
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{name:'Test English voice',lang:'en-US',localService:true}],addEventListener:()=>{},cancel:()=>{},speak:u=>{recorded.push({text:u.text,rate:u.rate,pitch:u.pitch,lang:u.lang});u.onstart?.();}}});
      Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:function(t){this.text=t;}});
    }''')
    page.click('#refresh')
    page.fill('#text','A deterministic browser test.')
    page.click('#speak')
    value=page.evaluate('recorded[0]')
    assert value=={'text':'A deterministic browser test.','rate':.9,'pitch':1,'lang':'en-US'}
    report['checks'].append('Mocked Web Speech receives exact text, selected voice locale, rate and pitch')
    assert 'No downloadable file' in page.inner_text('#status')
    assert not errors and not requests
    report['checks'].append('Speaking status does not claim a WAV; no key/network code is invoked')
    report.update(passed=True,pageErrors=errors,httpRequests=requests)
    browser.close()
(ROOT/'validation/browser-audition-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
