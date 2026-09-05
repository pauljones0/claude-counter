import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
const pkg=JSON.parse(await readFile('package.json','utf8'));
test('Firefox archive preserves identity and contains only declared runtime sources',async()=>{
  const zip=unzipSync(await readFile(`dist/claude-counter-${pkg.version}-firefox.zip`));
  const manifest=JSON.parse(strFromU8(zip['manifest.json']));
  assert.equal(manifest.version,pkg.version);
  assert.equal(manifest.browser_specific_settings.gecko.id,'{cf7799c8-d878-41ff-8005-167bee7ab3d6}');
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required,['none']);
  assert.equal(manifest.permissions,undefined);
  assert.equal(manifest.web_accessible_resources,undefined);
  for(const script of manifest.content_scripts){
    assert.deepEqual(script.matches,['https://claude.ai/*']);
    for(const path of [...script.js,...(script.css||[])]) assert.ok(zip[path],path);
  }
  const bridge=manifest.content_scripts.find(s=>s.world==='MAIN');
  assert.deepEqual(bridge.js,['src/injected/bridge.js']);assert.equal(bridge.run_at,'document_start');
  assert.ok(zip['THIRD_PARTY_NOTICES.md']);assert.ok(zip['PRIVACY.md']);
  assert.ok(Object.keys(zip).every(p=>!p.includes('node_modules')&&!p.startsWith('tests/')&&!p.startsWith('META-INF/')&&!p.includes('\\')));
});
test('generated userscript includes the same content modules and version',async()=>{
  const script=await readFile('userscript/claude-counter.user.js','utf8');
  assert.ok(script.includes(`// @version ${pkg.version}`));
  const manifest=JSON.parse(await readFile('manifest_firefox.json','utf8'));
  for(const entry of manifest.content_scripts)for(const path of entry.js)assert.ok(script.includes(await readFile(path,'utf8')),path);
});
