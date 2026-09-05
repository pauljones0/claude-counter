import { firefox, chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const modules = ['constants','usage','anchors','ui'];
const css = await readFile('src/styles.css','utf8');
await mkdir('test-results', {recursive:true});
const fixture = mode => `<!doctype html><html><head><style>
*{box-sizing:border-box}body{margin:24px;background:#faf9f6;color:#222;font:16px system-ui}header{display:flex;align-items:center;flex-wrap:wrap;gap:10px}#dframe-header-actions-slot{display:flex;flex-wrap:wrap;min-width:0}main{max-width:850px;margin:80px auto}.composer{display:flex;flex-direction:column}.card{position:relative;display:flex;flex-direction:column;min-height:170px;padding:20px;border:1px solid #aaa;border-radius:22px;background:white}.input{min-height:85px}.toolbar{display:flex;flex-direction:row;gap:10px;align-items:center}.absolute{position:absolute;bottom:14px;right:18px}.left{position:absolute;bottom:14px;left:18px}button{font:inherit}.chin{display:flex;justify-content:end;margin-top:6px}html[data-mode=dark] body{background:#262624;color:#eee}html[data-mode=dark] .card{background:#30302d}
</style></head><body><header data-testid="chat-header"><span data-testid="chat-title-split">A conversation</span><div id="dframe-header-actions-slot"><button>Share</button></div></header><main>
<section ${mode==='legacy'?'':'data-cds="ChatComposer"'} class="composer"><div ${mode==='legacy'?'data-testid="chat-input-grid-container"':''} class="card"><div class="input" contenteditable="true">Comment puis-je vous aider ?</div><div class="toolbar left"><button>+</button><button>Chat</button><button>Cowork</button></div><div class="toolbar absolute"><button ${mode==='active'?'':'data-testid="model-selector-dropdown"'}>Sonnet</button><button>Send</button></div></div>${mode==='active'?'<div class="chin"><button data-testid="model-selector-dropdown">Sonnet</button></div>':''}</section></main></body></html>`;
let count = 0;
// Regression proof: the original implementation overlaps out-of-flow controls.
const baselineBrowser = await firefox.launch({headless:true});
try {
  const page = await baselineBrowser.newPage({viewport:{width:900,height:800}});
  await page.setContent(fixture('new'));
  await page.addStyleTag({content:'.input{min-height:120px}.flex{display:flex}.flex-row{flex-direction:row}.items-center{align-items:center}.w-full{width:100%}'});
  await page.addStyleTag({content:await readFile('tests/fixtures/v0.4.3/styles.css','utf8')});
  for(const file of ['constants','ui']) await page.addScriptTag({path:`tests/fixtures/v0.4.3/${file}.js`});
  await page.evaluate(()=>{
    ClaudeCounter.waitForElement=async selector=>document.querySelector(selector);
    const ui=new ClaudeCounter.ui.CounterUI();ui.initialize();ui.attachUsageLine();
    ui.setUsage({five_hour:{utilization:65},seven_day:{utilization:10}});
  });
  const overlap=await page.evaluate(()=>{
    const r=document.querySelector('.cc-usageRow').getBoundingClientRect();
    return [...document.querySelectorAll('.card button')].some(el=>{const b=el.getBoundingClientRect();return r.top<b.bottom&&r.bottom>b.top&&r.left<b.right&&r.right>b.left;});
  });
  assert.ok(overlap,'baseline must reproduce the reported overlap before trusting the regression fixture');
  console.log('Confirmed original Firefox implementation overlaps composer controls');
} finally {await baselineBrowser.close();}
for (const [name, engine] of [['firefox',firefox],['chromium',chromium]]) {
  const browser = await engine.launch({headless:true});
  try {
    for (const mode of ['new','active','legacy']) for (const width of [320,620,900,1512]) for (const theme of ['light','dark']) {
      const page = await browser.newPage({viewport:{width,height:800}});
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await page.setContent(fixture(mode));
      await page.addStyleTag({content:css});
      for (const mod of modules) await page.addScriptTag({path:`src/content/${mod}.js`});
      await page.evaluate(theme => {
        document.documentElement.dataset.mode=theme;
        window.refreshes=0;
        window.ui=new ClaudeCounter.ui.CounterUI({onUsageRefresh:async()=>{window.refreshes++;}});
        ui.initialize();ui.setStatus('');
        ui.setUsage({five_hour:{utilization:65,resets_at:new Date(Date.now()+2700000).toISOString(),window_hours:5},seven_day:{utilization:10,resets_at:new Date(Date.now()+24300000).toISOString(),window_hours:168}});
        ui.setConversationMetrics({totalTokens:12345,cachedUntil:Date.now()+120000});
      },theme);
      const geometry = await page.evaluate(()=>{
        const row=document.querySelector('.cc-usageRow').getBoundingClientRect();
        const controls=[...document.querySelectorAll('.card button')].map(x=>x.getBoundingClientRect());
        return {top:row.top,bottom:Math.max(...controls.map(x=>x.bottom)),right:row.right,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.ok(geometry.top>=geometry.bottom,`${name} ${mode} ${width} overlap`);
      assert.equal(geometry.overflow,false,`${name} ${mode} ${width} overflow`);
      await page.getByRole('button',{name:'Refresh usage',exact:true}).focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(()=>window.refreshes),1);
      // Replacing the host composer must move the existing UI once, without duplication.
      await page.evaluate(()=>{const card=document.querySelector('.card');card.replaceWith(card.cloneNode(true));});
      await page.waitForFunction(()=>document.querySelector('.card').nextElementSibling?.classList.contains('cc-usageRow'));
      assert.equal(await page.locator('.cc-usageRow').count(),1);
      if(mode==='new' && [320,900].includes(width)) await page.screenshot({path:`test-results/${name}-${mode}-${width}-${theme}.png`,fullPage:true});
      await page.evaluate(()=>ui.destroy());
      assert.equal(await page.locator('.cc-usageRow').count(),0);
      assert.deepEqual(errors,[]);
      await page.close(); count++;
    }
  } finally {await browser.close();}
}
console.log(`Passed ${count} Firefox/Chromium layout, theme, navigation and keyboard scenarios`);
