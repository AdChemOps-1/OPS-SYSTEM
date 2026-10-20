// GET  /api/calendar — list calendars the Google user can write to (for Setup).
// POST /api/calendar — create or update a delivery event on the calendar for the order's hub.
// POST /api/calendar {action:"check", ids:[...]} — confirm the server can write to each calendar ID (Setup → Check and confirm).
//
// Which calendar: the company's settings hold a default calendar (calendarId) and, per hub, an optional
// calendar of its own (hubCalendars[hub].id). The server resolves the calendar from the order's hub — the
// browser never names the calendar to write to. An event already on another of the company's calendars
// (the order changed hub, or the hub's calendar changed) is moved before it is updated.
import { gfetch } from "../_lib/google.js";
import { requireUser, sb, json, fail, handle, companyFrom, companyContext } from "../_lib/auth.js";
import { CAL_API as API, calendarFor, companyCalendars, probeCalendar } from "../_lib/calendars.js";

export async function onRequestGet({ request, env }) {
  return handle(async () => {
    await requireUser(request, env, ["admin","coordinator"], companyFrom(request));
    const data = await gfetch(env, "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer");
    return json({ calendars: (data.items || []).map(c => ({ id: c.id, summary: c.summary, timeZone: c.timeZone, primary: !!c.primary })) });
  });
}

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json();
    const { token, company } = await requireUser(request, env, ["admin","coordinator"], companyFrom(request, body));

    if (body.action === "check") {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(s => String(s || "").trim()).filter(Boolean))].slice(0, 20);
      const results = [];
      for (const id of ids) {
        try { results.push(await probeCalendar(env, id)); }
        catch (e) { results.push({ id, ok: false, error: e.message }); }
      }
      return json({ results });
    }

    const db = sb(env, token);
    const { settings } = await companyContext(db, env, company);
    const hub = String(body.hub || "");
    const calId = calendarFor(settings, hub);
    if (!calId || !settings.calendarConfirmed) return fail("No confirmed calendar for hub " + (hub || "(none)") + ". Set and confirm the delivery calendars on Setup.", 400, "no_calendar");
    if (!body.start || !body.end) return fail("start and end are required", 400);
    const tz = body.timeZone || settings.tz || "America/Los_Angeles";
    const ev = {
      summary: String(body.summary || "").slice(0, 300),
      description: String(body.description || "").slice(0, 8000),
      location: String(body.location || "").slice(0, 500),
      start: { dateTime: body.start, timeZone: tz },
      end: { dateTime: body.end, timeZone: tz },
      reminders: { useDefault: false },
    };
    let res, moved = false;
    try {
      if (body.eventId && body.eventId !== "created") {
        // Events made before per-hub calendars carry no eventCal: they are on the default calendar.
        const from = String(body.eventCal || settings.calendarId || calId);
        if (from !== calId) {
          if (!companyCalendars(settings).has(from)) return fail("The event's current calendar is not one of this company's calendars.", 400, "bad_calendar");
          await gfetch(env, API + encodeURIComponent(from) + "/events/" + encodeURIComponent(body.eventId) + "/move?destination=" + encodeURIComponent(calId), { method: "POST" });
          moved = true;
        }
        res = await gfetch(env, API + encodeURIComponent(calId) + "/events/" + encodeURIComponent(body.eventId), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(ev) });
      } else {
        res = await gfetch(env, API + encodeURIComponent(calId) + "/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ev) });
      }
    } catch (e) {
      return fail("Google Calendar: " + e.message, 502, "google");
    }
    return json({ ok: true, eventId: res.id, htmlLink: res.htmlLink || "", calendarId: calId, moved });
  });
}
