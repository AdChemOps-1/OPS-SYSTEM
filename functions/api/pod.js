// POST /api/pod — email the signed BOL photo (as the company's orders address) to the office and the receiver,
// record the proof of delivery, mark the order Delivered, and report the row to Dispatch Orders Out.
// The photo is already in the private dispatch-pods bucket (uploaded by the phone); we read it from there.
import { gfetch } from "../_lib/google.js";
import { requireUser, sb, json, fail, handle, companyFrom, companyContext } from "../_lib/auth.js";
import { tryWriteOrdersOut } from "../_lib/orderlog.js";

function isEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s||"").trim()); }
function b64(buf){ const bytes=new Uint8Array(buf); let s=""; for(let i=0;i<bytes.length;i+=0x8000) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000)); return btoa(s); }
function b64url(s){ return btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function money(n){ return "$"+Number(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,","); }

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json();
    const { user, me, token, company } = await requireUser(request, env, null, companyFrom(request, body));
    const db = sb(env, token);
    const ctx = await companyContext(db, env, company);
    const orderId = String(body.orderId || "");
    const photoPath = String(body.photoPath || "");
    const cc = (Array.isArray(body.cc) ? body.cc : String(body.cc || "").split(/[,;\s]+/)).map(s => s.trim()).filter(Boolean);
    const driver = String(body.driver || me.name || "").slice(0, 80);
    const collected = Math.max(0, Number(body.collected || 0) || 0);
    const issue = String(body.issue || "").slice(0, 200);
    const note = String(body.note || "").slice(0, 300);
    if (!orderId || !photoPath) return fail("orderId and photoPath are required", 400);
    const bad = cc.filter(s => !isEmail(s));
    if (bad.length) return fail("Not an email address: " + bad.join(", "), 400, "bad_email");
    const rows = await db.get("dispatch_orders?select=id,bol_no,hub,date,customer,data,status&company=eq." + encodeURIComponent(company) + "&id=eq." + encodeURIComponent(orderId));
    const o = rows[0];
    if (!o) return fail("Order not found or not yours to see.", 404);
    const d = o.data || {};
    // The photo must be this order's, uploaded under this company and hub — never any other file in the bucket.
    const seg = x => String(x || "").replace(/[^A-Za-z0-9_-]/g, "_") || "_";
    const prefix = [seg(company), seg(o.hub), "pod", seg(o.id)].join("/") + "/";
    if (!photoPath.startsWith(prefix) || photoPath.includes("..")) return fail("That photo is not this order's.", 400, "bad_path");
    const to = ctx.ordersTo, from = ctx.mailFrom, coName = ctx.co.short_name || ctx.co.name || "AdChem";

    const photoRes = await db.storageGet("dispatch-pods", photoPath);
    const photo = await photoRes.arrayBuffer();
    if (photo.byteLength > 7 * 1024 * 1024) return fail("Photo is too large to email.", 413);

    const bolLabel = o.bol_no ? "BOL " + o.bol_no : "Order " + o.id;
    const subject = `${bolLabel} — signed — ${o.customer} — ${o.date}`;
    const lines = [
      "Signed bill of lading attached.", "",
      `BOL: ${o.bol_no || "not numbered"}   Order ID: ${o.id}`,
      `Customer: ${o.customer}${d.siteLabel && d.siteLabel !== "Primary" ? " — " + d.siteLabel : ""}`,
      `Delivered to: ${d.shipTo || ""}`,
      `Products: ${(d.lines || []).filter(l => l.product).map(l => `${l.qty} × ${l.product}${l.container && l.container !== "—" ? " (" + l.container + ")" : ""}`).join("; ")}`,
      d.effCode === "COD" ? `COD due on this delivery: ${money(d.codAmount)}` : null,
      d.deposit ? `Deposit due: ${d.deposit.item || ""} ${money(d.deposit.amount)}` : null,
      `Total received, as entered by the driver: ${money(collected)}`,
      issue ? `Issue at the stop: ${issue}` : null,
      note ? `Driver note: ${note}` : null,
      "", "The payment block on the photographed page is the record of what was received.", "",
      `Driver: ${driver || "not entered"} · Hub: ${o.hub}`,
      coName, "Sent from AdChem Ops.",
    ].filter(x => x !== null).join("\r\n");
    const fname = `BOL-${o.bol_no || o.id}-signed.jpg`;
    const boundary = "adchem" + Math.random().toString(36).slice(2);
    const mime =
      `From: ${from}\r\nTo: ${to}\r\n${cc.length ? "Cc: " + cc.join(", ") + "\r\n" : ""}` +
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
    await db.insert("dispatch_pods", [{ company, order_id: o.id, photo_path: photoPath, sent_to: to, sent_cc: cc.join(", "), driver, msg_id: sent.id || "", sent_by: user.id, sent_at: sentAt }]);
    const newStatus = ["Intake","Confirmed","Scheduled","BOL Created","Out for Delivery"].includes(o.status) ? "Delivered" : o.status;
    const newData = { ...d, pod: { sentAt, to, cc, msgId: sent.id || "", driver, by: user.id, photoPath, collected, issue, note } };
    await db.patch("dispatch_orders", "company=eq." + encodeURIComponent(company) + "&id=eq." + encodeURIComponent(o.id), { status: newStatus, data: newData, updated_at: sentAt });
    const log = await tryWriteOrdersOut(env, db, ctx, company, [o.id]);
    return json({ ok: true, sentAt, to, cc, msgId: sent.id || "", status: newStatus, ordersOut: log });
  });
}
