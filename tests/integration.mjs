import { firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const browser=await firefox.launch({headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let calls=0, fail=false, unsupported=false, hold=false, releaseResponse, enteredResponse;
await page.route('https://claude.ai/**', async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/usage')) {
    calls++;
    if(hold) await new Promise(resolve=>{releaseResponse=resolve;enteredResponse();});
    await route.fulfill({status:fail?500:200,contentType:'application/json',body:JSON.stringify(fail?{error:'unavailable'}:unsupported?{}:{five_hour:{utilization:url.pathname.includes('org-b')?12:65,resets_at:new Date(Date.now()+3600000).toISOString()}})});
  } else if(url.pathname.includes('/chat_conversations/')) {
    await route.fulfill({contentType:'application/json',body:JSON.stringify({chat_messages:[{uuid:'m',parent_message_uuid:null,sender:'human',content:[{type:'text',text:'Hello world'}]}],current_leaf_message_uuid:'m'})});
  } else await route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><header><div id="dframe-header-actions-slot"></div></header><div data-cds="ChatComposer"><div style="position:relative;min-height:100px">Composer</div></div></body></html>'});
});
try {
  await page.goto('https://claude.ai/new');
  await page.addStyleTag({content:await readFile('src/styles.css','utf8')});
  await page.evaluate(()=>{document.cookie='lastActiveOrg=org-a; path=/';});
  await page.addScriptTag({path:'src/injected/bridge.js'});
  const manifest=JSON.parse(await readFile('manifest_firefox.json','utf8'));
  for(const file of manifest.content_scripts[0].js) await page.addScriptTag({path:file});
  await page.waitForFunction(()=>document.querySelector('.cc-usageText')?.textContent.startsWith('Session: 65%'));
  assert.equal(calls,1,'new-chat usage fetches immediately');
  fail=true;
  await page.getByRole('button',{name:'Refresh usage'}).click();
  await page.waitForFunction(()=>document.querySelector('.cc-status')?.textContent.includes('out of date'));
  assert.match(await page.locator('.cc-usageText').textContent(),/65%/);
  const attempts=calls;
  await page.clock.install();await page.clock.fastForward(10000);
  assert.equal(calls,attempts,'failure does not cause per-second retry loop');
  fail=false;
  await page.evaluate(()=>{document.cookie='lastActiveOrg=org-b; path=/';history.pushState({},'', '/chat/chat-b');});
  await page.waitForFunction(()=>document.querySelector('.cc-usageText')?.textContent.startsWith('Session: 12%'));
  await page.waitForFunction(()=>document.querySelector('.cc-tokenText')?.textContent.includes('tokens'));
  await page.evaluate(()=>window.postMessage({cc:'ClaudeCounter',type:'cc:message_limit',payload:{orgId:'org-a',messageLimit:{windows:{'5h':{utilization:.99}}}}},location.origin));
  assert.match(await page.locator('.cc-usageText').textContent(),/12%/,'old account stream ignored');
  await page.evaluate(()=>window.postMessage({cc:'ClaudeCounter',type:'cc:message_limit',payload:{orgId:'org-b',messageLimit:{windows:{'5h':{utilization:.45}}}}},location.origin));
  await page.waitForFunction(()=>document.querySelector('.cc-usageText')?.textContent.startsWith('Session: 45%'));
  hold=true;
  const entered=new Promise(resolve=>{enteredResponse=resolve;});
  await page.getByRole('button',{name:'Refresh usage'}).click();
  await entered;
  await page.evaluate(()=>window.postMessage({cc:'ClaudeCounter',type:'cc:message_limit',payload:{orgId:'org-b',messageLimit:{windows:{'5h':{utilization:.55}}}}},location.origin));
  await page.waitForFunction(()=>document.querySelector('.cc-usageText')?.textContent.startsWith('Session: 55%'));
  hold=false;releaseResponse();
  await page.waitForFunction(()=>!document.querySelector('.cc-refresh').disabled);
  assert.match(await page.locator('.cc-usageText').textContent(),/55%/,'old HTTP response cannot overwrite new stream usage');
  const beforeInvalid=calls;
  const invalid=await page.evaluate(()=>ClaudeCounter.bridge.requestUsage('../other').then(()=>null,error=>error.message));
  assert.match(invalid,/Invalid organization/);assert.equal(calls,beforeInvalid);
  await page.evaluate(()=>{document.cookie='lastActiveOrg=; Max-Age=0; path=/';history.pushState({},'', '/new');});
  await page.waitForFunction(()=>document.querySelector('.cc-usageRow').hidden);
  assert.equal(await page.locator('.cc-usageRow').isVisible(),false);
  const signedOutCalls=calls;
  await page.clock.fastForward(65000);
  assert.equal(calls,signedOutCalls,'signed-out state does not poll usage');
  unsupported=true;
  await page.evaluate(()=>{document.cookie='lastActiveOrg=org-free; path=/';window.dispatchEvent(new Event('cc:urlchange'));});
  await page.waitForFunction(()=>document.querySelector('.cc-status').textContent==='Usage unavailable');
  assert.equal(await page.locator('.cc-usageRow').isVisible(),true);
  assert.equal(await page.locator('.cc-usageGroup').count(),0,'missing quota data must not fabricate zero');
  unsupported=false;
  await page.getByRole('button',{name:'Refresh usage'}).click();
  await page.waitForFunction(()=>document.querySelector('.cc-usageText')?.textContent.startsWith('Session: 65%'));
  assert.equal(await page.locator('.cc-status').isVisible(),false,'recovery clears unavailable message');
  await page.evaluate(()=>ClaudeCounter.destroy());
  assert.equal(await page.locator('.cc-usageRow').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Passed full Firefox app: startup on /new, HTTP failure, retry bounds, account switching, conversation metrics, SSE isolation, teardown');
} finally {await browser.close();}

// The page fetch wrapper must preserve response identity, methods and body while
// parsing arbitrarily chunked SSE. Mock only the underlying network boundary.
const engine=await firefox.launch({headless:true});
const streamPage=await engine.newPage();
await streamPage.route('https://claude.ai/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
try {
  await streamPage.goto('https://claude.ai/new');
  await streamPage.evaluate(()=>{
    window.events=[];
    window.addEventListener('message',e=>{if(e.data?.cc==='ClaudeCounter') events.push(e.data);});
    const raw='data: {"type":"message_limit",\r\ndata: "message_limit":{"windows":{"5h":{"utilization":0.37}}}}\r\n\r\n';
    window.response=new Response(new ReadableStream({start(controller){for(const c of raw)controller.enqueue(new TextEncoder().encode(c));controller.close();}}),{headers:{'content-type':'text/event-stream'}});
    window.fetch=async()=>window.response;
  });
  await streamPage.addScriptTag({path:'src/injected/bridge.js'});
  const same=await streamPage.evaluate(async()=>{const r=await fetch(new Request('https://claude.ai/api/organizations/org/chat_conversations/chat/completion',{method:'POST'}));window.originalBody=await r.text();return r===window.response;});
  assert.equal(same,true);
  await streamPage.waitForFunction(()=>events.some(e=>e.type==='cc:generation_end'));
  const events=await streamPage.evaluate(()=>events);
  assert.equal(events.filter(e=>e.type==='cc:message_limit').length,1);
  assert.equal(events.find(e=>e.type==='cc:message_limit').payload.messageLimit.windows['5h'].utilization,.37);
  assert.ok(events.some(e=>e.type==='cc:generation_start'));
  console.log('Passed Firefox streaming: single-byte CRLF chunks, multiline JSON, Request method, response identity and generation completion');
} finally {await engine.close();}
