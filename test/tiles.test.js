import { test } from "node:test";
import assert from "node:assert/strict";
import { tileKey, tileKeysAround, loadTiles } from "../web/js/tiles.js";

test("tileKey", () => {
  assert.equal(tileKey(37.5663, 126.9779), "751_2539");
});

test("tileKeysAround covers neighbours", () => {
  const keys = tileKeysAround(37.5663, 126.9779, 1);
  assert.equal(keys.length, 9);
  for (const k of ["750_2538", "752_2540", "751_2539"]) assert.ok(keys.includes(k));
});

test("loadTiles merges and treats 404 as empty", async () => {
  const fetchJson = async (url) => {
    if (url.endsWith("a.json")) return [{ id: "1" }];
    const e = new Error("404");
    e.status = 404;
    throw e;
  };
  assert.deepEqual(await loadTiles(["a", "b"], fetchJson), [{ id: "1" }]);
});

test("loadTiles rethrows non-404 errors", async () => {
  const fetchJson = async () => {
    const e = new Error("500");
    e.status = 500;
    throw e;
  };
  await assert.rejects(loadTiles(["a"], fetchJson));
});
