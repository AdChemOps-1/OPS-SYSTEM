// POST /api/drive — save a BOL (HTML) into the company's shared BOL folder on Drive.
import { gfetch } from "../_lib/google.js";
import { requireUser, sb, json, fail, handle, companyFrom, companyContext } from "../_lib/auth.js";

function folderId(raw) {
  const s = String(raw || "").trim(); if (!s) return "";
  const m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : "";
}

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json();
    const { token, company } = await requireUser(request, env, ["admin","coordinator"], companyFrom(request, body));
    const db = sb(env, token);
    const { settings } = await companyContext(db, env, company);
    const folder = folderId(settings.driveFolder);
    if (!folder) return fail("No Drive folder is set on Setup.", 400, "no_folder");
    const title = String(body.title || "BOL").slice(0, 200);
    const html = String(body.html || "");
    if (!html) return fail("Nothing to save.", 400);
    const asDoc = settings.driveFormat === "doc";
    const meta = { name: asDoc ? title : title + ".html", parents: [folder] };
    if (asDoc) meta.mimeType = "application/vnd.google-apps.document";
    const boundary = "adchem" + Math.random().toString(36).slice(2);
    const multipart =
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\ncontent-type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`;
    let res;
    try {
      res = await gfetch(env, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
        method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body: multipart,
      });
    } catch (e) {
      return fail("Google Drive: " + e.message, 502, "google");
    }
    return json({ ok: true, id: res.id, webViewLink: res.webViewLink || "" });
  });
}
