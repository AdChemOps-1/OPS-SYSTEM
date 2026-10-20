// Delivery calendars: the default calendar and the per-hub calendars held in a company's settings.
import { gfetch } from "./google.js";

export const CAL_API = "https://www.googleapis.com/calendar/v3/calendars/";

export function calendarFor(settings, hub) {
  const h = settings.hubCalendars && hub ? settings.hubCalendars[hub] : null;
  return (h && h.id) ? String(h.id) : String(settings.calendarId || "");
}
export function companyCalendars(settings) {
  const ids = new Set();
  if (settings.calendarId) ids.add(String(settings.calendarId));
  Object.values(settings.hubCalendars || {}).forEach(h => { if (h && h.id) ids.add(String(h.id)); });
  return ids;
}
export async function probeCalendar(env, id) {
  // events.list works under the calendar.events scope whether or not the calendar is in the user's list,
  // and its response carries the calendar's title. A read is not proof of write, so check accessRole too.
  const r = await gfetch(env, CAL_API + encodeURIComponent(id) + "/events?maxResults=1&fields=summary,accessRole,timeZone");
  const role = r.accessRole || "";
  return { id, ok: role === "writer" || role === "owner", summary: r.summary || id, timeZone: r.timeZone || "", accessRole: role };
}

