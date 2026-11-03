import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "../pipeline/build.js";

const TODAY = "2026-11-03";
const raw = (id, addr, OPN_HR = "상시", OPN_HR_DTL = "") => ({ MNG_NO: id, RSTRM_NM: `화장실${id}`, LCTN_ROAD_NM_ADDR: addr, LCTN_LOTNO_ADDR: "", OPN_HR, OPN_HR_DTL });
const COORDS = {
  "서울 A로 1": [37.5663, 126.9779], // 타일 751_2539
  "서울 A로 2": [37.567, 126.978], // 같은 타일
  "부산 B로 3": [35.1796, 129.0756], // 다른 타일
};
const fakeGeocode = async (addrs, cache) => {
  const next = { ...cache };
  for (const a of addrs) next[a] = COORDS[a] ? { lat: COORDS[a][0], lng: COORDS[a][1] } : { failedAt: TODAY };
  return { cache: next, stats: {} };
};

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toilet-build-"));
  return { outDir: path.join(dir, "data"), cachePath: path.join(dir, "cache", "geocode.json") };
}
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

test("writes tiles and meta", async () => {
  const { outDir, cachePath } = tmp();
  const fetchToilets = async () => [raw("1", "서울 A로 1"), raw("2", "서울 A로 2", "정시", "09:00~18:00"), raw("3", "부산 B로 3")];
  const meta = await build({ fetchToilets, geocode: fakeGeocode, outDir, cachePath, today: TODAY });
  assert.equal(meta.count, 3);
  assert.equal(meta.tileDeg, 0.05);
  assert.equal(meta.updatedAt, TODAY);
  assert.deepEqual(readJson(path.join(outDir, "meta.json")), meta);
  assert.equal(fs.readdirSync(path.join(outDir, "tiles")).length, 2);
  const seoul = readJson(path.join(outDir, "tiles", "751_2539.json"));
  assert.equal(seoul.length, 2);
  const t2 = seoul.find((t) => t.id === "2");
  assert.deepEqual(t2.hours, { type: "range", open: 540, close: 1080 });
  assert.equal(t2.hoursText, "09:00~18:00");
  assert.equal(seoul.find((t) => t.id === "1").hoursText, "상시");
  assert.equal(t2.lat, 37.567);
  assert.ok(fs.existsSync(cachePath));
});

test("excludes no-address, not-open and ungeocoded, counts them", async () => {
  const { outDir, cachePath } = tmp();
  const fetchToilets = async () => [raw("1", "서울 A로 1"), raw("2", ""), raw("3", "부산 B로 3", "미개방", "0"), raw("4", "없는 주소")];
  const meta = await build({ fetchToilets, geocode: fakeGeocode, outDir, cachePath, today: TODAY });
  assert.equal(meta.count, 1);
  assert.deepEqual(meta.skipped, { noAddr: 1, notOpen: 1, geocodeFailed: 1, geocodePending: 0 });
});

test("counts addresses without a cache entry as pending", async () => {
  const { outDir, cachePath } = tmp();
  const geocode = async (addrs, cache) => ({ cache, stats: {} }); // 한도 소진: 아무것도 변환하지 못함
  const meta = await build({ fetchToilets: async () => [raw("1", "서울 A로 1")], geocode, outDir, cachePath, today: TODAY });
  assert.equal(meta.count, 0);
  assert.equal(meta.skipped.geocodePending, 1);
});

test("removes stale tiles from previous run", async () => {
  const { outDir, cachePath } = tmp();
  fs.mkdirSync(path.join(outDir, "tiles"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "tiles", "999_999.json"), "[]");
  await build({ fetchToilets: async () => [raw("1", "서울 A로 1")], geocode: fakeGeocode, outDir, cachePath, today: TODAY });
  assert.deepEqual(fs.readdirSync(path.join(outDir, "tiles")), ["751_2539.json"]);
});

test("aborts without writing on fetch failure", async () => {
  const { outDir, cachePath } = tmp();
  fs.mkdirSync(path.join(outDir, "tiles"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "meta.json"), '{"old":true}');
  fs.writeFileSync(path.join(outDir, "tiles", "1_1.json"), "[]");
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, '{"x":{"lat":1,"lng":2}}');
  const fetchToilets = async () => {
    throw new Error("API down");
  };
  await assert.rejects(build({ fetchToilets, geocode: fakeGeocode, outDir, cachePath, today: TODAY }), /API down/);
  assert.equal(fs.readFileSync(path.join(outDir, "meta.json"), "utf8"), '{"old":true}');
  assert.deepEqual(fs.readdirSync(path.join(outDir, "tiles")), ["1_1.json"]);
  assert.equal(fs.readFileSync(cachePath, "utf8"), '{"x":{"lat":1,"lng":2}}');
});

test("keeps blank-MNG_NO records apart", async () => {
  const { outDir, cachePath } = tmp();
  const meta = await build({ fetchToilets: async () => [{ ...raw("", "서울 A로 1"), RSTRM_NM: "가" }, { ...raw("", "서울 A로 2"), RSTRM_NM: "나" }], geocode: fakeGeocode, outDir, cachePath, today: TODAY });
  assert.equal(meta.count, 2);
});

test("keeps checkpointed cache when geocoding crashes", async () => {
  const { outDir, cachePath } = tmp();
  const geocode = async (addrs, cache, saveCache) => {
    saveCache({ ...cache, "서울 A로 1": { lat: 37.5663, lng: 126.9779 } });
    throw new Error("timeout");
  };
  await assert.rejects(build({ fetchToilets: async () => [raw("1", "서울 A로 1")], geocode, outDir, cachePath, today: TODAY }), /timeout/);
  assert.deepEqual(readJson(cachePath), { "서울 A로 1": { lat: 37.5663, lng: 126.9779 } });
  assert.ok(!fs.existsSync(path.join(outDir, "meta.json")));
});
