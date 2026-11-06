import { test } from "node:test";
import assert from "node:assert/strict";
import { rankToilets, pickRecommendation } from "../web/js/pick.js";

const me = { lat: 37.5663, lng: 126.9779 };
const at = (dLatM) => ({ lat: me.lat + dLatM / 111000, lng: me.lng }); // 북쪽으로 dLatM 미터
const T = (id, m, hours) => ({ id, name: id, addr: "", hoursText: "", facilities: {}, ...at(m), hours });
const noon = new Date(Date.UTC(2026, 10, 3, 3)); // 12:00 KST
const OPEN = { type: "24h" };
const UNK = { type: "unknown" };
const CLOSED = { type: "range", open: 0, close: 60 };
const pick = (ts) => pickRecommendation(rankToilets(ts, me, noon));

test("rankToilets sorts by distance and adds status", () => {
  const r = rankToilets([T("far", 500, OPEN), T("near", 100, CLOSED)], me, noon);
  assert.deepEqual(r.map((t) => t.id), ["near", "far"]);
  assert.equal(r[0].status, "closed");
  assert.ok(Math.abs(r[0].distance - 100) < 2);
});

test("nearest open within radius wins over closer unknown", () => {
  const r = pick([T("u", 100, UNK), T("o", 400, OPEN)]);
  assert.equal(r.toilet.id, "o");
});

test("no open nearby -> nearest unknown", () => {
  const r = pick([T("c", 50, CLOSED), T("u", 300, UNK), T("o", 2000, OPEN)]);
  assert.equal(r.toilet.id, "u");
});

test("nothing within radius -> nearest open/unknown anywhere", () => {
  const r = pick([T("c", 50, CLOSED), T("o", 3000, OPEN), T("u", 5000, UNK)]);
  assert.equal(r.toilet.id, "o");
});

test("never recommends closed; null when none", () => {
  assert.equal(pick([T("c", 10, CLOSED)]), null);
  assert.equal(pick([]), null);
});

test("picks toilet from adjacent tile", () => {
  // 타일 경계(lat 37.55) 바로 위에 있는 사용자, 경계 아래쪽 약 90m에 화장실
  const r = pickRecommendation(rankToilets([{ ...T("x", 0, OPEN), lat: 37.5493, lng: 126.9779 }], { lat: 37.5501, lng: 126.9779 }, noon));
  assert.equal(r.toilet.id, "x");
});
