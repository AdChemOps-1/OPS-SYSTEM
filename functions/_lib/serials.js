// Picks the likely asset serial out of the text blocks Cloud Vision read from a photo. Pure: no I/O, no clock.
// blocks: [{ text, box: { x, y, w, h } }] -> [{ text, score }], best first, at most five. The driver confirms the pick.

// What a serial looks like (patterns), and what only looks like one (reject): DOT/TC marks, tare weights, years,
// capacities, expiry/manufacture dates.
export const DEFAULT_RULES = {
  patterns: ["^[A-Z0-9]{5,20}$"],
  reject: ["^(DOT|TC)", "^TW", "^(19[5-9]\\d|20[0-3]\\d)$", "^\\d{1,4}(LB|L|KG|CUFT)$", "^(EXP|MFG|DUE)", "^\\d{1,2}/\\d{2,4}$"],
};
export const MAX_RESULTS = 5;
const REJECT_FACTOR = 0.1;
const TOP_BONUS = 0.2;
const TOP_FRACTION = 0.4;
const TALL_KINDS = ["cylinder", "dewar", "pig", "tank"];

const normalise = t => String(t == null ? "" : t).toUpperCase().replace(/[\s-]+/g, "");
const compile = list => list.map(s => new RegExp(s));

export function pickSerials(blocks, opts = {}) {
  const list = Array.isArray(blocks) ? blocks.filter(b => b && b.box) : [];
  if (!list.length) return [];
  const kind = opts.kind || "cylinder";
  const rules = opts.rules || {};
  const patterns = compile([...DEFAULT_RULES.patterns, ...(rules.patterns || [])]);
  const reject = compile([...DEFAULT_RULES.reject, ...(rules.reject || [])]);
  const imageHeight = opts.imageHeight || Math.max(...list.map(b => (b.box.y || 0) + (b.box.h || 0)));
  const largest = Math.max(...list.map(b => (b.box.w || 0) * (b.box.h || 0)));

  const best = new Map();
  for (const b of list) {
    const text = normalise(b.text);
    if (!patterns.some(re => re.test(text))) continue;          // not serial-shaped: dropped before ranking
    let score = 1;
    const rejected = reject.some(re => re.test(text));
    if (rejected) score *= REJECT_FACTOR;
    if (TALL_KINDS.includes(kind)) {
      // a rejected block gets no position bonus, so a DOT mark stamped near the top stays at the bottom of the list
      if (!rejected && (b.box.y || 0) < imageHeight * TOP_FRACTION) score += TOP_BONUS;
    } else if (kind === "bin" || kind === "tote") {
      score *= largest > 0 ? ((b.box.w || 0) * (b.box.h || 0)) / largest : 1;
    }
    score = Math.round(score * 1e6) / 1e6;
    if (!best.has(text) || best.get(text) < score) best.set(text, score);
  }
  return [...best].map(([text, score]) => ({ text, score })).sort((a, b) => b.score - a.score || (a.text < b.text ? -1 : 1)).slice(0, MAX_RESULTS);
}
