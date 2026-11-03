import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHours } from "../pipeline/parse-hours.js";
import { openStatus } from "../web/js/hours.js";

const kst = (h, m = 0) => new Date(Date.UTC(2026, 10, 3, h - 9, m)); // KST h:m

test("parse 24h", () => {
  for (const t of ["24시간", " 24시간 ", "00:00~24:00", "00:00~23:59"]) assert.deepEqual(parseHours(t), { type: "24h" }, t);
});

test("parse range variants", () => {
  for (const t of ["09:00~18:00", "9:00-18:00", "09:00 ～ 18:00", "09시~18시"]) {
    assert.deepEqual(parseHours(t), { type: "range", open: 540, close: 1080 }, t);
  }
});

test("ambiguous -> unknown", () => {
  for (const t of ["상시", "정시", "영업시간 내", "", null, "평일 09:00~18:00", "09:00~12:00, 13:00~18:00", "09:00~09:00"]) {
    assert.equal(parseHours(t).type, "unknown", String(t));
  }
});

test("openStatus range", () => {
  const h = { type: "range", open: 540, close: 1080 };
  assert.equal(openStatus(h, kst(9)), "open");
  assert.equal(openStatus(h, kst(17, 59)), "open");
  assert.equal(openStatus(h, kst(18)), "closed");
  assert.equal(openStatus(h, kst(8, 59)), "closed");
});

test("overnight range", () => {
  const h = parseHours("22:00~06:00");
  assert.equal(openStatus(h, kst(2)), "open");
  assert.equal(openStatus(h, kst(23)), "open");
  assert.equal(openStatus(h, kst(12)), "closed");
});

test("uses KST regardless of host TZ", () => {
  // 2026-11-03 00:30 UTC = 09:30 KST
  assert.equal(openStatus({ type: "range", open: 540, close: 1080 }, new Date(Date.UTC(2026, 10, 3, 0, 30))), "open");
});

test("24h and unknown", () => {
  assert.equal(openStatus({ type: "24h" }, kst(3)), "open");
  assert.equal(openStatus({ type: "unknown" }, kst(12)), "unknown");
});
