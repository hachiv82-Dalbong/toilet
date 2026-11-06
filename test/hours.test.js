import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHours, hoursFromRecord } from "../pipeline/parse-hours.js";
import { openStatus, formatHours } from "../web/js/hours.js";

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
  for (const t of ["정시", "영업시간 내", "", null, "평일 09:00~18:00", "09:00~12:00, 13:00~18:00", "09:00~09:00", "11시간", "1~12", "3-10"]) {
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

test("category 상시 -> 24h", () => {
  assert.deepEqual(hoursFromRecord("상시", ""), { type: "24h" });
  assert.deepEqual(hoursFromRecord(" 상시 ", "상시"), { type: "24h" });
});

test("category 정시 parses detail", () => {
  assert.deepEqual(hoursFromRecord("정시", "09:00~18:00"), { type: "range", open: 540, close: 1080 });
  assert.equal(hoursFromRecord("정시", "근무시간 내").type, "unknown");
});

test("category 미개방 -> null", () => {
  assert.equal(hoursFromRecord("미개방", "0"), null);
});

test("other category -> unknown", () => {
  assert.equal(hoursFromRecord("", "").type, "unknown");
  assert.equal(hoursFromRecord("기타", "").type, "unknown");
});

test("past-midnight end hour", () => {
  assert.deepEqual(parseHours("05:00~25:00"), { type: "range", open: 300, close: 60 });
  assert.equal(parseHours("05:00~31:00").type, "unknown");
});

test("semicolon typo", () => {
  assert.deepEqual(parseHours("09:00~18;00"), { type: "range", open: 540, close: 1080 });
});

test("상시 with conflicting detail follows the detail", () => {
  assert.deepEqual(hoursFromRecord("상시", "09:00~18:00"), { type: "range", open: 540, close: 1080 });
  assert.equal(hoursFromRecord("상시", "동절기 폐쇄").type, "unknown");
  assert.deepEqual(hoursFromRecord("상시", "연중무휴"), { type: "24h" });
  assert.deepEqual(hoursFromRecord("상시", "24시간"), { type: "24h" });
});

test("formatHours writes parsed ranges as HH:MM-HH:MM", () => {
  assert.equal(formatHours({ type: "range", open: 540, close: 1080 }, "9시~18시"), "09:00-18:00");
  assert.equal(formatHours({ type: "range", open: 360, close: 1440 }, "06:00~24:00"), "06:00-24:00");
  assert.equal(formatHours({ type: "range", open: 300, close: 60 }, "05:00~25:00"), "05:00-01:00");
});

test("formatHours writes always-open as a full day", () => {
  assert.equal(formatHours({ type: "24h" }, "상시"), "00:00-24:00");
});

test("formatHours tidies times inside text it could not interpret", () => {
  const u = { type: "unknown" };
  assert.equal(formatHours(u, "08~20"), "08:00-20:00");
  assert.equal(formatHours(u, "(평일)9:00~18:00"), "(평일)09:00-18:00");
  assert.equal(formatHours(u, "09:00 ~ 18:00, 법정공휴일 제외"), "09:00-18:00, 법정공휴일 제외");
  assert.equal(formatHours(u, "09:00-12:00, 13시-18시"), "09:00-12:00, 13:00-18:00");
});

test("formatHours leaves non-times alone", () => {
  const u = { type: "unknown" };
  assert.equal(formatHours(u, "근무시간 내"), "근무시간 내");
  assert.equal(formatHours(u, "3-10월 개방"), "3-10월 개방");
  assert.equal(formatHours(u, "1~12"), "1~12");
  assert.equal(formatHours(u, "010-1234-5678"), "010-1234-5678");
});

test("formatHours has nothing to say for an empty or category-only value", () => {
  const u = { type: "unknown" };
  assert.equal(formatHours(u, ""), "");
  assert.equal(formatHours(u, "정시"), "");
});

test("formatHours handles the real data's odd separators and placeholders", () => {
  const u = { type: "unknown" };
  assert.equal(formatHours(u, "09:00∼18:00"), "09:00-18:00");
  assert.equal(formatHours(u, "10~22시"), "10:00-22:00");
  assert.equal(formatHours(u, "00~24"), "00:00-24:00");
  assert.equal(formatHours(u, "(평일)09:00-18:00+(주말)09:00-18:00"), "(평일)09:00-18:00+(주말)09:00-18:00");
  assert.equal(formatHours(u, "24시간 개방"), "00:00-24:00");
  assert.equal(formatHours(u, ":~:"), "");
  assert.equal(formatHours(u, "-"), "");
  assert.equal(formatHours(u, "11시간"), "11시간");
});

test("parse shorthand ranges from the real data", () => {
  const nineToSix = { type: "range", open: 540, close: 1080 };
  for (const s of ["09~18시", "09~18", "9시~18", "09:00∼18:00"]) assert.deepEqual(parseHours(s), nineToSix, s);
  assert.deepEqual(parseHours("08~20"), { type: "range", open: 480, close: 1200 });
});

test("parse clear all-day values", () => {
  for (const s of ["00~24", "00:00~00:00", "00:00~23:50", "24시간 개방", "24시간 운영", "상시"]) assert.deepEqual(parseHours(s), { type: "24h" }, s);
});

test("a time in any other category field is still read", () => {
  assert.deepEqual(hoursFromRecord("09:00~18:00", ""), { type: "range", open: 540, close: 1080 });
  assert.deepEqual(hoursFromRecord("기타", "09:00~18:00"), { type: "range", open: 540, close: 1080 });
  assert.deepEqual(hoursFromRecord("24시간", ""), { type: "24h" });
  assert.deepEqual(hoursFromRecord("정시", "상시"), { type: "24h" });
});

test("conditional hours stay unknown so a closed toilet is never shown as open", () => {
  for (const s of ["(평일)09:00~18:00", "(평일)09:00-18:00+(주말)09:00-18:00", "월~금 09~18시", "09:00~18:00 월요일 휴무"]) {
    assert.equal(hoursFromRecord("정시", s).type, "unknown", s);
    assert.equal(hoursFromRecord("", s).type, "unknown", s);
  }
});

test("미개방 in the detail field also excludes the toilet", () => {
  assert.equal(hoursFromRecord("정시", "미개방"), null);
  assert.equal(hoursFromRecord("기타", " 미개방 "), null);
});
