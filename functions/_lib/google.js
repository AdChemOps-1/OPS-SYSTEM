// Google access for the server side of AdChem Ops.
// One service account, acting as a Workspace user (domain-wide delegation),
// reaches the AR Command Center, the dispatch calendar, the BOL Drive folder
// and Gmail. Nothing here is exposed to the browser.

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
];

function b64url(buf) {
  const bytes = typeof buf === "string" ? new TextEncoder().encode(buf) : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToDer(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const tokenCache = new Map();

export async function googleToken(env, scopes = SCOPES) {
  const raw = env.GOOGLE_SA_JSON;
  if (!raw) throw new Error("GOOGLE_SA_JSON is not set");
  const sa = JSON.parse(raw);
  const sub = env.GOOGLE_IMPERSONATE || "";
  const key = scopes.join(" ") + "|" + sub;
  const cached = tokenCache.get(key);
  if (cached && cached.exp > Date.now() + 60000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = { iss: sa.client_email, scope: scopes.join(" "), aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  if (sub) claims.sub = sub;
  const payload = b64url(JSON.stringify(claims));
  const signingInput = header + "." + payload;
  const cryptoKey = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const jwt = signingInput + "." + b64url(sig);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error("Google token: " + (data.error_description || data.error || res.status));
  tokenCache.set(key, { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 });
  return data.access_token;
}

export async function gfetch(env, url, init = {}) {
  const token = await googleToken(env);
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: "Bearer " + token } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  if (!res.ok) {
    const msg = (json && json.error && (json.error.message || json.error)) || text || res.status;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    throw err;
  }
  return json;
}
