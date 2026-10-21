/* Harness for the f1gridmasters compare-and-swap write path.
   Extracts the new functions from index.html and runs them against a
   mock Supabase client. Never touches the network or the live row. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');   // the working copy is CRLF; normalise before matching
const script = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/i)[1];

// Pull out just the functions under test, by name.
function grab(name) {
  const re = new RegExp(`\\n(?:async )?function ${name}\\(([\\s\\S]*?)\\n\\}\\n`, '');
  const m = script.match(re);
  if (!m) throw new Error('could not extract ' + name);
  return m[0];
}
const src = ['_rpcMissing', '_pushState', '_adoptCloudState', '_refreshCloudVersion'].map(grab).join('\n');

let passed = 0, failed = 0;
const t = (name, fn) => fn().then(
  () => { console.log('  ok - ' + name); passed++; },
  (e) => { console.log('  FAIL - ' + name + '\n      ' + e.message); failed++; });

function makeCtx() {
  const ctx = {
    STATE: { players: [1, 2, 3] },
    _cloudVersion: 5,
    _rpcAvailable: true,
    _staleToastShown: false,
    console: { warn() {}, log() {} },
    showToast() {},
    _normaliseState() {},
    renderAll: undefined,
    localStorage: { setItem() {} },
    setTimeout,
    calls: [],
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

// Mock client. rpc() and upsert() behaviour driven per test.
function mockSb(ctx, { rpc, upsertErr } = {}) {
  return {
    rpc: async (name, args) => { ctx.calls.push(['rpc', name, args.p_expected_version]); return rpc(); },
    from: () => ({
      upsert: async (row) => { ctx.calls.push(['upsert', row.id]); return { error: upsertErr || null }; },
      select: () => ({ eq: () => ({ single: async () => ({ data: { state: { players: [9] }, version: 42 }, error: null }) }) }),
    }),
  };
}

console.log('compare-and-swap write path');

await t('accepted write returns ok and advances the local version', async () => {
  const ctx = makeCtx();
  const sb = mockSb(ctx, { rpc: () => ({ data: [{ ok: true, version: 6, message: 'ok' }], error: null }) });
  const res = await ctx._pushState(sb);
  assert.equal(res, 'ok');
  assert.equal(ctx._cloudVersion, 6, 'version should advance to what the server returned');
  assert.deepEqual(ctx.calls[0], ['rpc', 'f1_state_push', 5], 'must send the version we believe we hold');
});

await t('refused write returns stale and does NOT advance the version', async () => {
  const ctx = makeCtx();
  const sb = mockSb(ctx, { rpc: () => ({ data: [{ ok: false, version: 9, message: 'stale' }], error: null }) });
  const res = await ctx._pushState(sb);
  assert.equal(res, 'stale');
  assert.equal(ctx._cloudVersion, 5, 'a refused write must not move the local version');
  assert.ok(!ctx.calls.some(c => c[0] === 'upsert'), 'a refused write must never fall through to a blind upsert');
});

await t('missing function falls back to the legacy upsert, once', async () => {
  const ctx = makeCtx();
  const sb = mockSb(ctx, { rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) });
  const res = await ctx._pushState(sb);
  assert.equal(res, 'ok', 'must still save while the migration is undeployed');
  assert.equal(ctx._rpcAvailable, false, 'should stop retrying the missing function');
  assert.ok(ctx.calls.some(c => c[0] === 'upsert'), 'should have used the legacy path');
  // second call must not attempt the rpc again
  ctx.calls.length = 0;
  await ctx._pushState(sb);
  assert.ok(!ctx.calls.some(c => c[0] === 'rpc'), 'must not retry the rpc after it is known missing');
});

await t('a real rpc error does not silently fall back', async () => {
  const ctx = makeCtx();
  const sb = mockSb(ctx, { rpc: () => ({ data: null, error: { code: '500', message: 'boom' } }) });
  const res = await ctx._pushState(sb);
  assert.equal(res, 'error');
  assert.ok(!ctx.calls.some(c => c[0] === 'upsert'), 'a genuine failure must not become a blind overwrite');
});

await t('never read from the server means never use the guarded path', async () => {
  const ctx = makeCtx();
  ctx._cloudVersion = null;
  const sb = mockSb(ctx, { rpc: () => { throw new Error('rpc must not be called'); } });
  const res = await ctx._pushState(sb);
  assert.equal(res, 'ok');
  assert.ok(ctx.calls.every(c => c[0] !== 'rpc'), 'with no known version we cannot claim one');
});

await t('upsert failure surfaces as an error', async () => {
  const ctx = makeCtx();
  ctx._cloudVersion = null;
  const sb = mockSb(ctx, { upsertErr: { message: 'network' } });
  assert.equal(await ctx._pushState(sb), 'error');
});

await t('rpcMissing recognises the real shapes and nothing else', async () => {
  const ctx = makeCtx();
  assert.equal(ctx._rpcMissing({ code: 'PGRST202' }), true);
  assert.equal(ctx._rpcMissing({ code: '404' }), true);
  assert.equal(ctx._rpcMissing({ message: 'Could not find the function public.f1_state_push' }), true);
  assert.equal(ctx._rpcMissing({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(ctx._rpcMissing({ message: 'permission denied' }), false);
  assert.equal(ctx._rpcMissing(null), false);
});

await t('adopting server state takes its version and never blanks STATE', async () => {
  const ctx = makeCtx();
  const sb = mockSb(ctx, {});
  await ctx._adoptCloudState(sb, 'test');
  assert.deepEqual(ctx.STATE, { players: [9] });
  assert.equal(ctx._cloudVersion, 42);
});

await t('refreshCloudVersion updates the version without touching STATE', async () => {
  const ctx = makeCtx();
  const before = ctx.STATE;
  await ctx._refreshCloudVersion(mockSb(ctx, {}));
  assert.equal(ctx._cloudVersion, 42);
  assert.equal(ctx.STATE, before, 'must not disturb the state mid-submission');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

