// Google Cloud Vision text detection for asset photos. Called as the service account itself (no domain-wide
// delegation), so it does not go through gfetch, which impersonates the Workspace user.
import { googleToken } from "./google.js";

const ANNOTATE = "https://vision.googleapis.com/v1/images:annotate";
const SCOPE = ["https://www.googleapis.com/auth/cloud-platform"];
// a 1x1 transparent PNG, for the health probe
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function toBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

async function annotate(env, base64) {
  const token = await googleToken(env, SCOPE, "");
  const res = await fetch(ANNOTATE, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: "TEXT_DETECTION" }] }] }),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  const inner = json && json.responses && json.responses[0];
  if (!res.ok || (inner && inner.error)) {
    const msg = (json && json.error && (json.error.message || json.error)) || (inner && inner.error && inner.error.message) || String(text || res.status).slice(0, 200);
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.ok ? 400 : res.status;
    throw err;
  }
  return inner || {};
}

// -> { blocks: [{ text, box: {x, y, w, h} }], raw }. textAnnotations[0] is the whole text (raw); the rest are the blocks.
export async function readText(env, imageBytes) {
  const r = await annotate(env, toBase64(imageBytes));
  const all = Array.isArray(r.textAnnotations) ? r.textAnnotations : [];
  const blocks = all.slice(1).map(a => {
    // Vision leaves out a vertex's x or y when it is 0
    const vs = ((a.boundingPoly && a.boundingPoly.vertices) || []).map(v => ({ x: v.x || 0, y: v.y || 0 }));
    const xs = vs.map(v => v.x), ys = vs.map(v => v.y);
    const x = xs.length ? Math.min(...xs) : 0, y = ys.length ? Math.min(...ys) : 0;
    return { text: a.description || "", box: { x, y, w: xs.length ? Math.max(...xs) - x : 0, h: ys.length ? Math.max(...ys) - y : 0 } };
  });
  const page = r.fullTextAnnotation && r.fullTextAnnotation.pages && r.fullTextAnnotation.pages[0];
  return { blocks, raw: (all[0] && all[0].description) || "", imageHeight: (page && page.height) || null };
}

// 'ok', or a plain sentence for the Setup health line
export async function probe(env) {
  try { await annotate(env, PNG_1X1); return "ok"; }
  catch (e) {
    const m = String(e.message || "");
    if (/has not been used|is disabled/i.test(m)) return "Cloud Vision API is not enabled on the Google Cloud project";
    if (/billing/i.test(m)) return "billing is not linked to the Google Cloud project";
    return m;
  }
}
