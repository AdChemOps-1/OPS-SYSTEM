// POST /api/deposit — email a photographed bank deposit slip (as the company's orders address) to its accounting address,
// and record it. The photo is already in the private dispatch-pods bucket under deposits/.
import { gfetch } from "../_lib/google.js";
import { requireUser, sb, json, fail, handle, companyFrom, companyContext } from "../_lib/auth.js";

function b64(buf){ const bytes=new Uint8Array(buf); let s=""; for(let i=0;i<bytes.length;i+=0x8000) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000)); return btoa(s); }
function b64url(s){ return btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function money(n){ return "$"+Number(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,","); }

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json();
    const { user, me, token, company } = await requireUser(request, env, null, companyFrom(request, body));
    const db = sb(env, token);
    const ctx = await companyContext(db, env, company);
    const photoPath = String(body.photoPath || "");
    const hub = String(body.hub || me.hub || "").slice(0, 10).toUpperCase();
    // Drivers send only for their own hub; the photo must sit under this company and hub's deposits folder.
    if (me.role === "driver" && me.hub && hub !== String(me.hub).toUpperCase()) return fail("A driver sends deposit slips for their own hub only.", 403, "forbidden");
    const seg = x => String(x || "").replace(/[^A-Za-z0-9_-]/g, "_") || "_";
    if (!photoPath.startsWith([seg(company), seg(hub), "deposits"].join("/") + "/") || photoPath.includes("..")) return fail("That photo is not a deposit slip for this hub.", 400, "bad_path");
    const driver = String(body.driver || me.name || me.email || "").slice(0, 80);
    const amount = Math.max(0, Number(body.amount || 0) || 0);
    const note = String(body.note || "").slice(0, 200);
    const to = ctx.accountingTo, from = ctx.mailFrom, coName = ctx.co.short_name || ctx.co.name || "AdChem";

    const photoRes = await db.storageGet("dispatch-pods", photoPath);
    const photo = await photoRes.arrayBuffer();
    if (photo.byteLength > 7 * 1024 * 1024) return fail("Photo is too large to email.", 413);

    const tz = ctx.settings.tz || "America/Los_Angeles";
    const day = new Date().toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const subject = `Bank deposit slip — ${coName} ${hub || ""} — ${day}${amount ? " — " + money(amount) : ""}`.replace(/\s+—/g, " —");
    const lines = [
      "Deposit slip attached.", "",
      `Company: ${ctx.co.name}`,
      `Hub: ${hub || "not set"}`,
      `Driver: ${driver || "not entered"}`,
      `Amount deposited: ${amount ? money(amount) : "not entered — read it from the slip"}`,
      note ? `Note: ${note}` : null,
      `Date: ${day}`, "",
      "Sent from AdChem Ops.",
    ].filter(x => x !== null).join("\r\n");
    const fname = `deposit-${hub || "hub"}-${day.replace(/\//g, "-")}.jpg`;
    const boundary = "adchem" + Math.random().toString(36).slice(2);
    const mime =
      `From: ${from}\r\nTo: ${to}\r\n` +
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=\r\nMIME-Version: 1.0\r\n` +
      `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n` +
      `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${lines}\r\n\r\n` +
      `--${boundary}\r\nContent-Type: image/jpeg; name="${fname}"\r\nContent-Disposition: attachment; filename="${fname}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(photo).replace(/(.{76})/g, "$1\r\n")}\r\n--${boundary}--`;
    let sent;
    try {
      sent = await gfetch(env, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw: b64url(mime) }),
      });
    } catch (e) {
      return fail("Gmail: " + e.message, 502, "google");
    }
    const sentAt = new Date().toISOString();
    await db.insert("dispatch_deposits", [{ company, hub, driver, amount, note, photo_path: photoPath, sent_to: to, msg_id: sent.id || "", sent_by: user.id, sent_at: sentAt }]);
    return json({ ok: true, sentAt, to, msgId: sent.id || "" });
  });
}
