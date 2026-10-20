// POST /api/docs
//   {action:'sign', id}                          -> a 5-minute signed URL for the document's file (RLS decides who may see the row)
//   {action:'review', id, decision, reason, fields} -> approve or reject a pending driver capture (needs manage_documents)
import { requireUser, sb, json, fail, handle, companyFrom } from "../_lib/auth.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_KEYS = ["doc_type", "number", "status", "issued", "expires", "title", "extra", "notes"];
const EXPIRES = 300;

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const id = String(body.id || "");
    if (action !== "sign" && action !== "review") return fail("Unknown action.", 400, "bad_action");
    if (!UUID.test(id)) return fail("id must be a document id.", 400, "bad_id");
    const { user, token, company } = await requireUser(request, env, null, companyFrom(request, body), action === "review" ? "manage_documents" : undefined);
    const db = sb(env, token);

    if (action === "sign") {
      const rows = await db.get("dispatch_documents?select=id,file_path,file_name,file_type&company=eq." + encodeURIComponent(company) + "&id=eq." + id);
      const d = rows[0];
      if (!d) return fail("Document not found.", 404, "not_found");
      if (!d.file_path) return fail("This document has no file.", 400, "no_file");
      if (String(d.file_path).split("/").includes("..")) return fail("Bad file path.", 400, "bad_path");
      const url = await db.storageSign("dispatch-docs", d.file_path, EXPIRES);
      try { await db.insert("dispatch_log", [{ company, who: user.id, what: "file_view", detail: { documentId: id } }], true); } catch (e) { /* the log never blocks a view */ }
      return json({ url, expiresIn: EXPIRES, fileName: d.file_name, fileType: d.file_type });
    }

    const decision = String(body.decision || "");
    try {
      if (decision === "approve") {
        const src = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body.fields : {};
        const fields = {};
        for (const k of FIELD_KEYS) if (Object.prototype.hasOwnProperty.call(src, k)) fields[k] = src[k];
        await db.rpc("dispatch_approve_capture", { p_id: id, p_fields: fields });
      } else if (decision === "reject") {
        const reason = body.reason == null ? "" : body.reason;
        if (typeof reason !== "string" || reason.length > 300) return fail("reason must be text of 300 characters or fewer.", 400, "bad_reason");
        await db.rpc("dispatch_reject_capture", { p_id: id, p_reason: reason });
      } else return fail("decision must be approve or reject.", 400, "bad_decision");
    } catch (e) {
      if (/not pending review/.test(String(e && e.message))) return fail("That capture is no longer pending review.", 409, "not_pending");
      return fail(String((e && e.message) || e), 500, "server");
    }
    return json({ ok: true, id });
  });
}
