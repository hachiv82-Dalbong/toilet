import { test } from "node:test";
import assert from "node:assert/strict";
import { geocodeAll, jusoGeocode, searchKeyword } from "../pipeline/geocode.js";
import { wgs84ToUtmk } from "../pipeline/utmk.js";

const TODAY = "2026-11-03";
const run = (addrs, cache, geocodeOne, budget = 100, today = TODAY) => geocodeAll(addrs, cache, { geocodeOne, budget, today, delayMs: 0 });
const counter = (impl) => {
  const fn = async (a) => {
    fn.calls.push(a);
    return impl(a);
  };
  fn.calls = [];
  return fn;
};

test("uses cache, calls only new addresses", async () => {
  const one = counter(async () => [37.1, 127.1]);
  const { cache, stats } = await run(["A", "B"], { A: { lat: 1, lng: 2 } }, one);
  assert.deepEqual(one.calls, ["B"]);
  assert.deepEqual(cache.B, { lat: 37.1, lng: 127.1 });
  assert.equal(stats.hit, 1);
  assert.equal(stats.newOk, 1);
});

test("NOT_FOUND stored as failedAt, skipped within 30 days", async () => {
  const one = counter(async () => null);
  const { cache, stats } = await run(["A"], {}, one);
  assert.deepEqual(cache.A, { failedAt: TODAY });
  assert.equal(stats.newFailed, 1);
  const again = counter(async () => [1, 1]);
  await run(["A"], cache, again, 100, "2026-11-20");
  assert.equal(again.calls.length, 0);
});

test("retries failed after 30 days", async () => {
  const one = counter(async () => [37, 127]);
  const { cache } = await run(["A"], { A: { failedAt: "2026-10-01" } }, one);
  assert.deepEqual(one.calls, ["A"]);
  assert.deepEqual(cache.A, { lat: 37, lng: 127 });
});

test("stops at budget and keeps partial cache", async () => {
  const one = counter(async () => [37, 127]);
  const { cache, stats } = await run(["A", "B", "C", "D", "E"], {}, one, 2);
  assert.equal(one.calls.length, 2);
  assert.equal(stats.pending, 3);
  assert.equal(Object.keys(cache).length, 2);
});

test("dedupes addresses", async () => {
  const one = counter(async () => [37, 127]);
  await run(["A", "A"], {}, one);
  assert.equal(one.calls.length, 1);
});

test("transient error leaves address pending", async () => {
  const one = counter(async (a) => {
    if (a === "B") throw new Error("boom");
    return [37, 127];
  });
  const { cache, stats } = await run(["A", "B", "C"], {}, one);
  assert.equal(cache.B, undefined);
  assert.equal(stats.pending, 1);
  assert.equal(stats.newOk, 2);
});

test("stops after 20 consecutive errors", async () => {
  const one = counter(async () => {
    throw new Error("down");
  });
  const addrs = Array.from({ length: 30 }, (_, i) => `A${i}`);
  const { stats } = await run(addrs, {}, one);
  assert.equal(one.calls.length, 20);
  assert.equal(stats.pending, 30);
});

test("searchKeyword drops building-name suffix after comma", () => {
  assert.equal(searchKeyword("경기도 의정부시 민락로 273, 민락국민체육센터"), "경기도 의정부시 민락로 273");
  assert.equal(searchKeyword("부산광역시 영도구 대평남로 8"), "부산광역시 영도구 대평남로 8");
});

const json = (body) => ({ ok: true, status: 200, json: async () => body });
const KEYS = { searchKey: "S", coordKey: "C" };
const JUSO = { admCd: "2611010100", rnMgtSn: "261104000001", udrtYn: "0", buldMnnm: "8", buldSlno: "0" };

test("jusoGeocode chains search then coord and returns WGS84", async () => {
  const p = wgs84ToUtmk(35.09, 129.04);
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    if (url.includes("addrLinkApi.do")) return json({ results: { common: { errorCode: "0" }, juso: [JUSO] } });
    return json({ results: { common: { errorCode: "0" }, juso: [{ entX: String(p.x), entY: String(p.y) }] } });
  };
  const [lat, lng] = await jusoGeocode("부산광역시 영도구 대평남로 8", KEYS, fetchFn);
  assert.ok(Math.abs(lat - 35.09) < 1e-6 && Math.abs(lng - 129.04) < 1e-6);
  assert.ok(urls[0].startsWith("https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=S&"));
  assert.ok(urls[0].includes("keyword=" + encodeURIComponent("부산광역시 영도구 대평남로 8")));
  assert.ok(urls[1].startsWith("https://business.juso.go.kr/addrlink/addrCoordApi.do?confmKey=C&"));
  for (const [k, v] of Object.entries(JUSO)) assert.ok(urls[1].includes(`${k}=${v}`), k);
});

test("jusoGeocode returns null when search finds nothing", async () => {
  const fetchFn = async () => json({ results: { common: { errorCode: "0" }, juso: [] } });
  assert.equal(await jusoGeocode("없는 주소", KEYS, fetchFn), null);
});

test("jusoGeocode throws on API error code", async () => {
  const fetchFn = async () => json({ results: { common: { errorCode: "E0001", errorMessage: "승인되지 않은 KEY 입니다." } } });
  await assert.rejects(jusoGeocode("주소", KEYS, fetchFn), /E0001/);
});
