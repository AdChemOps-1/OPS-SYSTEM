import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readText, probe } from '../../functions/_lib/vision.js';

let SA;
async function serviceAccount() {
  if (SA) return SA;
  const kp = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\n' + der + '\n-----END PRIVATE KEY-----\n' });
  return SA;
}
const jres = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const claimsOf = jwt => JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
const fixture = name => JSON.parse(readFileSync(new URL('../fixtures/vision/' + name, import.meta.url), 'utf8'));
const ANNOTATE = 'https://vision.googleapis.com/v1/images:annotate';

// the token cache is module-level, so the token request is only seen by the first test that needs a Vision token (this file's first)
async function withStub(annotate, fn) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); calls.push({ url: u, init });
    if (u === 'https://oauth2.googleapis.com/token') return jres({ access_token: 'vtok', expires_in: 3600 });
    if (u === ANNOTATE) return annotate;
    return new Response('nope', { status: 404 });
  };
  try { return await fn({ GOOGLE_SA_JSON: await serviceAccount(), GOOGLE_IMPERSONATE: 'orders@adchem.pro' }, calls); } finally { globalThis.fetch = real; }
}

test('readText: posts the base64 image with TEXT_DETECTION, as the service account itself (no sub)', async () => {
  await withStub(jres(fixture('cylinder-indented.json')), async (env, calls) => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const out = await readText(env, bytes);
    const tok = calls.find(c => c.url.includes('oauth2'));
    const claims = claimsOf(new URLSearchParams(String(tok.init.body)).get('assertion'));
    assert.ok(!('sub' in claims), 'no impersonation for Vision');
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/cloud-platform');
    const a = calls.find(c => c.url === ANNOTATE);
    assert.equal(a.init.method, 'POST'); assert.equal(a.init.headers.authorization, 'Bearer vtok');
    const body = JSON.parse(a.init.body);
    assert.deepEqual(body, { requests: [{ image: { content: Buffer.from(bytes).toString('base64') }, features: [{ type: 'TEXT_DETECTION' }] }] });
    assert.equal(out.raw, 'DOT-3AA2015\nTW 48.2\nAB1234\n2019');
    assert.equal(out.blocks.length, 4);
    assert.deepEqual(out.blocks[0], { text: 'DOT-3AA2015', box: { x: 0, y: 100, w: 300, h: 40 } }, 'a vertex without x reads 0');
    assert.deepEqual(out.blocks[2].box, { x: 0, y: 500, w: 250, h: 50 });
  });
});

test('readText: an ArrayBuffer works, an empty page gives no blocks, an API error carries message and status', async () => {
  await withStub(jres({ responses: [{}] }), async env => {
    assert.deepEqual(await readText(env, new Uint8Array([9]).buffer), { blocks: [], raw: '', imageHeight: null });
  });
  await withStub(jres({ error: { code: 400, message: 'Bad image data.' } }, 400), async env => {
    await assert.rejects(() => readText(env, new Uint8Array([9])), e => e.message === 'Bad image data.' && e.status === 400);
  });
});

test('probe: ok on 200 (even with no text), and plain sentences for the two setup gaps', async () => {
  await withStub(jres({ responses: [{}] }), async env => assert.equal(await probe(env), 'ok'));
  await withStub(jres({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Cloud Vision API has not been used in project 123 before or it is disabled.' } }, 403),
    async env => assert.equal(await probe(env), 'Cloud Vision API is not enabled on the Google Cloud project'));
  await withStub(jres({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'This API method requires billing to be enabled.' } }, 403),
    async env => assert.equal(await probe(env), 'billing is not linked to the Google Cloud project'));
  await withStub(jres({ error: { code: 500, message: 'Boom' } }, 500), async env => assert.equal(await probe(env), 'Boom'));
});

test('readText returns the page height when Vision gives one; a long non-JSON error body is cut to 200 characters', async () => {
  const f = fixture('tote-card.json'); f.responses[0].fullTextAnnotation = { pages: [{ width: 800, height: 1200 }] };
  await withStub(jres(f), async env => assert.equal((await readText(env, new Uint8Array([1]))).imageHeight, 1200));
  await withStub(new Response('x'.repeat(500), { status: 502 }), async env => {
    await assert.rejects(() => readText(env, new Uint8Array([1])), e => e.message.length === 200 && e.status === 502);
  });
});
