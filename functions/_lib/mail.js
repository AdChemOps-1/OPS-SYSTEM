// Plain-text mail through Gmail (the service account acting as the Workspace user; From must be one of its Send-mail-as addresses).
// Text only: pod.js and deposit.js keep their own multipart builds for the photo attachment.
import { gfetch } from "./google.js";

function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
// a header value never carries a line break (no header injection from a name or an address)
function one(s) { return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim(); }
const list = v => (Array.isArray(v) ? v : v ? [v] : []).map(one).filter(Boolean);

export function buildMime({ from, to, cc, subject, text }) {
  const t = list(to), c = list(cc);
  return `From: ${one(from)}\r\nTo: ${t.join(", ")}\r\n${c.length ? "Cc: " + c.join(", ") + "\r\n" : ""}` +
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(one(subject))))}?=\r\nMIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n` +
    String(text || "").replace(/\r?\n/g, "\r\n");
}

// → the Gmail message resource ({id, threadId, …}); throws on a Gmail error
export async function sendMail(env, msg) {
  if (!list(msg.to).length) throw new Error("no recipients");
  return gfetch(env, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw: b64url(buildMime(msg)) }),
  });
}
