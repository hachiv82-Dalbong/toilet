import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceMeters, walkMinutes, formatDistance } from "../web/js/geo.js";

test("distance Seoul City Hall -> Gwanghwamun ≈ 1.1km", () => {
  const d = distanceMeters({ lat: 37.5663, lng: 126.9779 }, { lat: 37.5759, lng: 126.9768 });
  assert.ok(d > 1000 && d < 1150, String(d));
});

test("walkMinutes", () => {
  assert.equal(walkMinutes(120), 2);
  assert.equal(walkMinutes(0), 1);
  assert.equal(walkMinutes(670), 10);
});

test("formatDistance", () => {
  assert.equal(formatDistance(123), "120m");
  assert.equal(formatDistance(1234), "1.2km");
});
