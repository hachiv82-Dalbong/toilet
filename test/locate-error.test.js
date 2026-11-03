import { test } from "node:test";
import assert from "node:assert/strict";
import { locationMessage } from "../web/js/locate-error.js";

test("permission denied asks for permission", () => {
  assert.equal(locationMessage({ code: 1 }), "위치 권한이 필요해요");
});

test("timeout or unavailable says location not found", () => {
  assert.equal(locationMessage({ code: 2 }), "현재 위치를 찾지 못했어요");
  assert.equal(locationMessage({ code: 3 }), "현재 위치를 찾지 못했어요");
  assert.equal(locationMessage(new Error("no geolocation")), "현재 위치를 찾지 못했어요");
});
