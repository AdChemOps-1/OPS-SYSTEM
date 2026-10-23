import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickSerials, DEFAULT_RULES } from '../../functions/_lib/serials.js';

const fixture = name => JSON.parse(readFileSync(new URL('../fixtures/vision/' + name, import.meta.url), 'utf8'));
// the same shape readText() returns: textAnnotations[1..] with a box from the vertices (a missing x or y is 0)
function blocksFrom(f) {
  return f.responses[0].textAnnotations.slice(1).map(a => {
    const vs = a.boundingPoly.vertices.map(v => ({ x: v.x || 0, y: v.y || 0 }));
    const xs = vs.map(v => v.x), ys = vs.map(v => v.y);
    return { text: a.description, box: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } };
  });
}
const scoreOf = (r, text) => (r.find(x => x.text === text) || { score: 0 }).score;

test('the indented cylinder picks the serial, not the DOT mark, tare or year', () => {
  const r = pickSerials(blocksFrom(fixture('cylinder-indented.json')), { kind: 'cylinder' });
  assert.equal(r[0].text, 'AB1234');
  assert.ok(scoreOf(r, 'DOT3AA2015') <= 0.1);
  assert.ok(scoreOf(r, 'TW48.2') <= 0.1, 'tare weight is not a candidate');
  assert.ok(scoreOf(r, '2019') <= 0.1);
});

test('the sticker cylinder picks the serial over the brand and the expiry', () => {
  const r = pickSerials(blocksFrom(fixture('cylinder-sticker.json')), { kind: 'cylinder' });
  assert.equal(r[0].text, 'KX77821');
  assert.ok(scoreOf(r, 'EXP03/2027') <= 0.1);
});

test('the tote card picks the big block, not the weight', () => {
  const r = pickSerials(blocksFrom(fixture('tote-card.json')), { kind: 'tote' });
  assert.equal(r[0].text, 'TOTE0042');
  assert.ok(scoreOf(r, '525LB') <= 0.1);
});

test('nothing in, nothing out; at most five, best first; equal texts merge', () => {
  assert.deepEqual(pickSerials([]), []);
  assert.deepEqual(pickSerials(undefined), []);
  const many = Array.from({ length: 8 }, (_, i) => ({ text: 'ZZ' + (1000 + i), box: { x: 0, y: 10 + i * 100, w: 50, h: 20 } }));
  const r = pickSerials(many);
  assert.equal(r.length, 5);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
  const dup = pickSerials([{ text: 'ab-1234', box: { x: 0, y: 900, w: 10, h: 10 } }, { text: 'AB 1234', box: { x: 0, y: 0, w: 10, h: 10 } }]);
  assert.equal(dup.length, 1); assert.equal(dup[0].text, 'AB1234'); assert.equal(dup[0].score, 1.2, 'keeps the best score');
});

test('custom rules are added to the defaults, not replacing them', () => {
  const blocks = [...blocksFrom(fixture('cylinder-indented.json')), ...blocksFrom(fixture('cylinder-sticker.json'))];
  const base = pickSerials(blocks, { kind: 'cylinder' });
  assert.ok(scoreOf(base, 'AB1234') > 0 && scoreOf(base, 'KX77821') > 0);
  const r = pickSerials(blocks, { kind: 'cylinder', rules: { reject: ['^AB'] } });
  assert.ok(scoreOf(r, 'AB1234') < scoreOf(r, 'KX77821'));
  assert.ok(scoreOf(r, 'DOT3AA2015') < scoreOf(base, 'AB1234'), 'default rejects still apply');
  const p = pickSerials([{ text: 'Q-9', box: { x: 0, y: 0, w: 1, h: 1 } }], { rules: { patterns: ['^Q\\d$'] } });
  assert.equal(p[0].text, 'Q9');
  assert.ok(DEFAULT_RULES.patterns.length >= 1 && DEFAULT_RULES.reject.length >= 6);
});
