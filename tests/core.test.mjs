import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
async function load(files, extra = {}) {
  const context = vm.createContext({ console, crypto: webcrypto, TextEncoder, TextDecoder, ...extra });
  for (const file of files) vm.runInContext(await readFile(file, 'utf8'), context);
  return context.ClaudeCounter;
}
const parsers = (await load(['src/content/usage.js'])).usage;
test('endpoint percentages and stream fractions use distinct scales', () => {
  assert.equal(parsers.fromEndpoint({ five_hour: { utilization: 0.65 } }).five_hour.utilization, 0.65);
  assert.equal(parsers.fromStream({ windows: { '5h': { utilization: 0.65 } } }).five_hour.utilization, 65);
});
test('malformed usage never becomes zero; oversized reset timestamps do not throw', () => {
  for (const value of [null, {}, { five_hour: { utilization: '20' } }, { five_hour: { utilization: Infinity } }]) assert.equal(parsers.fromEndpoint(value), null);
  assert.equal(parsers.fromStream({ windows: { '5h': { utilization: 1, resets_at: 1e30 } } }).five_hour.resets_at, null);
});
test('limits fallback and scoped model caps survive partial stream updates', () => {
  const current = parsers.fromEndpoint({ limits: [{ kind: 'session', percent: 12 }, { kind: 'weekly_scoped', percent: 50, scope: { model: { display_name: 'Example' } } }] });
  const next = parsers.merge(current, parsers.fromStream({ windows: { '5h': { utilization: .15 } } }), true);
  assert.equal(next.five_hour.utilization, 15);
  assert.equal(next.scoped[0].label, 'Example');
  assert.equal(parsers.merge(next, parsers.fromEndpoint({ five_hour: { utilization: 10 } })).scoped.length, 0);
});
const CC = await load(['src/content/constants.js', 'src/vendor/o200k_base.js', 'src/content/tokens.js']);
const msg = (uuid, parent, text, extra = {}) => ({ uuid, parent_message_uuid: parent, sender: 'human', content: [{type:'text',text}], ...extra });
const convo = (messages, leaf) => ({chat_messages: messages, current_leaf_message_uuid: leaf});
test('counts only selected branch and invalidates changed message cache', async () => {
  const a = msg('a', null, 'Hello');
  const b = msg('b', 'a', 'World');
  const unused = msg('unused', 'a', 'Different '.repeat(1000));
  const before = await CC.tokens.computeConversationMetrics(convo([a,b,unused], 'b'));
  const after = await CC.tokens.computeConversationMetrics(convo([a,{...b,content:[{type:'text',text:'World '.repeat(100)}]},unused], 'b'));
  assert.ok(before.totalTokens > 0 && before.totalTokens < 10);
  assert.ok(after.totalTokens > before.totalTokens);
});
test('cycles, missing parents, and error payloads fail explicitly', async () => {
  await assert.rejects(CC.tokens.computeConversationMetrics(convo([msg('a','a','x')],'a')), /Cyclic/);
  await assert.rejects(CC.tokens.computeConversationMetrics(convo([msg('a','missing','x')],'a')), /Incomplete/);
  await assert.rejects(CC.tokens.computeConversationMetrics({error:'500'}), /Invalid/);
});
test('literal special token strings do not zero the entire message', async () => {
  const result = await CC.tokens.computeConversationMetrics(convo([msg('a',null,'Hello <|endoftext|> world')],'a'));
  assert.ok(result.totalTokens > 0);
});
test('nested image and thinking payloads never inflate text tokens', async () => {
  const content = [{type:'tool_result',content:[{type:'text',text:'Result'}, {type:'image',source:{data:'a'.repeat(300000)}}, {type:'thinking',thinking:'secret '.repeat(1000)}]}];
  const result = await CC.tokens.computeConversationMetrics(convo([msg('a',null,'',{content})],'a'));
  assert.ok(result.totalTokens > 0 && result.totalTokens < 100);
});
test('cache estimate uses assistant updated time', async () => {
  const updated = Date.now();
  const result = await CC.tokens.computeConversationMetrics(convo([msg('a',null,'Hi',{sender:'assistant',created_at:new Date(updated-600000).toISOString(),updated_at:new Date(updated).toISOString()})],'a'));
  assert.equal(result.cachedUntil, updated + 300000);
});
