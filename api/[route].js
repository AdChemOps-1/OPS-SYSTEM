// Vercel adapter. The server code is written for Cloudflare Pages Functions (functions/api/*.js);
// this one file lets the same code run on Vercel for a test deployment. It is not used by Cloudflare.
import * as feed from "../functions/api/feed.js";
import * as calendar from "../functions/api/calendar.js";
import * as drive from "../functions/api/drive.js";
import * as pod from "../functions/api/pod.js";
import * as health from "../functions/api/health.js";
import * as deposit from "../functions/api/deposit.js";
import * as orderlog from "../functions/api/orderlog.js";

export const config = { runtime: "edge" };
const routes = { feed, calendar, drive, pod, health, deposit, orderlog };

export default async function handler(request) {
  const name = new URL(request.url).pathname.replace(/^\/api\//, "").split("/")[0];
  const mod = routes[name];
  const j = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (!mod) return j(404, { error: { code: "notfound", message: "No such route" } });
  const verb = request.method.charAt(0) + request.method.slice(1).toLowerCase();
  const fn = mod["onRequest" + verb] || mod.onRequest;
  if (!fn) return j(405, { error: { code: "method", message: request.method + " not allowed" } });
  return fn({ request, env: process.env });
}
