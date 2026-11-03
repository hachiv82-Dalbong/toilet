import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mapRecord } from "../pipeline/fields.js";
import { fetchAllToilets } from "../pipeline/fetch-toilets.js";

const page = JSON.parse(fs.readFileSync(new URL("./fixtures/api-page.json", import.meta.url), "utf8"));
const items = page.response.body.items.item;

test("mapRecord maps first fixture item", () => {
  const r = mapRecord(items[0]);
  assert.equal(r.id, "202632900000100012");
  assert.equal(r.name, "황령산레포츠공원(황령산레포츠공원 부설주차장 옆)");
  assert.equal(r.addr, "부산광역시 부산진구 진남로328번길 99");
  assert.equal(r.hoursCategory, "상시");
  assert.equal(r.hoursDetail, "");
  assert.deepEqual(r.facilities, { male: 2, female: 2, disabled: 2, child: 2 });
});

test("mapRecord normalises whitespace in names", () => {
  assert.equal(mapRecord(items[2]).name, "민락국민체육센터 지하 1층A, 민락국민체육센터 지하 1");
});

test("mapRecord falls back to lot-number address", () => {
  const r = mapRecord({ ...items[0], LCTN_ROAD_NM_ADDR: "" });
  assert.equal(r.addr, "부산광역시 부산진구 전포동 산 36");
});

test("mapRecord returns null for blank address", () => {
  assert.equal(mapRecord({ ...items[0], LCTN_ROAD_NM_ADDR: "", LCTN_LOTNO_ADDR: " " }), null);
});

test("mapRecord facilities null when all counts blank", () => {
  const blank = Object.fromEntries(Object.keys(items[0]).filter((k) => k.endsWith("_CNT")).map((k) => [k, ""]));
  assert.deepEqual(mapRecord({ ...items[0], ...blank }).facilities, { male: null, female: null, disabled: null, child: null });
});

const okPage = (total, n) => ({
  ok: true,
  status: 200,
  json: async () => ({
    response: { header: { resultCode: "0" }, body: { totalCount: total, items: { item: Array.from({ length: n }, (_, i) => ({ MNG_NO: String(i) })) } } },
  }),
});

test("fetchAll pages until totalCount", async () => {
  const urls = [];
  const sizes = [100, 100, 50];
  const fetchFn = async (url) => {
    urls.push(url);
    return okPage(250, sizes[urls.length - 1]);
  };
  const all = await fetchAllToilets({ serviceKey: "k", fetchFn, retryDelayMs: 0 });
  assert.equal(all.length, 250);
  assert.equal(urls.length, 3);
  urls.forEach((u, i) => {
    assert.ok(u.includes(`pageNo=${i + 1}`), u);
    assert.ok(u.includes("numOfRows=100"), u);
    assert.ok(u.includes("/info_v2?"), u);
  });
});

test("fetchAll throws after 3 failed attempts", async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls++;
    if (calls === 1) return okPage(250, 100);
    return { ok: false, status: 500, json: async () => ({}) };
  };
  await assert.rejects(fetchAllToilets({ serviceKey: "k", fetchFn, retryDelayMs: 0 }));
  assert.equal(calls, 4); // 1페이지 성공 + 2페이지 3번 시도
});

test("fetchAll retries then succeeds", async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls++;
    if (calls === 2) return { ok: false, status: 500, json: async () => ({}) };
    return okPage(150, calls === 1 ? 100 : 50);
  };
  assert.equal((await fetchAllToilets({ serviceKey: "k", fetchFn, retryDelayMs: 0 })).length, 150);
});

test("fetchAll throws on API error envelope", async () => {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } }),
  });
  await assert.rejects(fetchAllToilets({ serviceKey: "k", fetchFn, retryDelayMs: 0 }), /SERVICE_KEY_IS_NOT_REGISTERED_ERROR/);
});

test("fetchAll throws when far fewer records than totalCount", async () => {
  const fetchFn = async () => okPage(1000, 0); // totalCount는 1000인데 빈 페이지
  await assert.rejects(fetchAllToilets({ serviceKey: "k", fetchFn, retryDelayMs: 0 }), /incomplete/);
});

test("mapRecord falls back to name|addr id when MNG_NO is blank", () => {
  assert.equal(mapRecord({ ...items[0], MNG_NO: "" }).id, "황령산레포츠공원(황령산레포츠공원 부설주차장 옆)|부산광역시 부산진구 진남로328번길 99");
});

test("fetchAll throws when totalCount is missing", async () => {
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ response: { header: { resultCode: "0" }, body: { items: { item: [{ MNG_NO: "1" }] } } } }) });
  await assert.rejects(fetchAllToilets({ serviceKey: "k", fetchFn, retryDelayMs: 0 }), /totalCount/);
});
