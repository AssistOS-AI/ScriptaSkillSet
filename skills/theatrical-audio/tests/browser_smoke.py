"""Optional Chromium integration test. Requires Playwright only in the developer test environment.
It is not required by the skill or HTML player. No network or web server is used.
"""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'output/acceptance-test-tone/preview.html'
report={'browser':'Chromium','mode':'headless','urlKind':'file://','checks':[], 'limitations':['Audio clock and scheduling tested; this is not a human listening evaluation.','Physical Android/iOS audio latency was not measured.']}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1180,'height':1000})
    errors=[];network=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:network.append(r.url) if r.url.startswith(('http:','https:')) else None)
    try:
        page.goto(html.as_uri())
        report['fileNavigationTested']=True
    except Exception as error:
        if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):
            raise
        # Test our own generated markup in memory; do not override browser policy.
        page.set_content(html.read_text(),wait_until='load')
        report['urlKind']='inline markup via set_content'
        report['fileNavigationTested']=False
        report['limitations'].append('Sandbox Chromium policy blocked file:// navigation. The same HTML was tested in memory without a server.')
    page.wait_for_selector('#play')
    assert page.locator('#title').inner_text()=='The Last Light'
    report['checks'].append('Loaded single-file HTML markup without a server')
    page.click('#play');page.wait_for_function('scenePlayer.playing && scenePlayer.currentTime()>0.1')
    assert page.evaluate('scenePlayer.buffers.size')==12
    report['checks'].append('Decoded and scheduled 12 separate playback assets')
    page.evaluate('scenePlayer.pause()');pos=page.evaluate('scenePlayer.currentTime()');page.wait_for_timeout(120)
    assert abs(page.evaluate('scenePlayer.currentTime()')-pos)<.00001
    report['checks'].append('Pause freezes transport time')
    target=page.evaluate("sceneTimeline.events.find(e=>e.id==='b3').startFrame/sceneTimeline.sampleRate+.4")
    page.evaluate('(t)=>scenePlayer.seek(t)',target)
    assert abs(page.evaluate('scenePlayer.currentTime()')-target)<.0001
    assert page.locator('#speaker').text_content()=='The Archive'
    report['checks'].append('Seek updates caption and actor from the selected clip boundary')
    page.click('#play');page.wait_for_function('scenePlayer.playing')
    page.wait_for_timeout(180);assert page.evaluate('scenePlayer.currentTime()')>target
    report['checks'].append('Resumed playback advances from the seek offset')
    page.evaluate('scenePlayer.pause()')
    late=page.evaluate("sceneTimeline.events.find(e=>e.id==='b7').startFrame/sceneTimeline.sampleRate+.6")
    page.evaluate('(t)=>scenePlayer.seek(t)',late)
    page.screenshot(path=str(ROOT/'validation/preview-desktop.png'),full_page=True)
    page.set_viewport_size({'width':412,'height':915});page.screenshot(path=str(ROOT/'validation/preview-mobile.png'),full_page=True)
    assert not page.evaluate('document.documentElement.scrollWidth>window.innerWidth')
    report['checks'].append('412-pixel viewport has no horizontal overflow')
    assert len(network)==0
    report['checks'].append('No HTTP(S) requests during load, play, pause or seek')
    assert not errors, errors
    report['checks'].append('No uncaught browser JavaScript errors')
    report['passed']=True;report['networkRequests']=network;report['pageErrors']=errors
    browser.close()
(ROOT/'validation/browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
