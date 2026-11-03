import { test } from "node:test";
import assert from "node:assert/strict";
import { utmkToWgs84, wgs84ToUtmk } from "../pipeline/utmk.js";

test("origin maps to false easting/northing", () => {
  const p = wgs84ToUtmk(38, 127.5);
  assert.ok(Math.abs(p.x - 1000000) < 0.01 && Math.abs(p.y - 2000000) < 0.01, JSON.stringify(p));
});

test("round trip within 1cm across Korea", () => {
  for (const [lat, lng] of [[37.5663, 126.9779], [35.1796, 129.0756], [33.4996, 126.5312], [38.2, 128.6]]) {
    const p = wgs84ToUtmk(lat, lng);
    const q = utmkToWgs84(p.x, p.y);
    assert.ok(Math.abs(q.lat - lat) < 1e-7 && Math.abs(q.lng - lng) < 1e-7, `${lat},${lng} -> ${JSON.stringify(q)}`);
  }
});

test("Seoul is roughly 953km E / 1952km N", () => {
  const p = wgs84ToUtmk(37.5663, 126.9779);
  assert.ok(Math.abs(p.x - 953900) < 2000 && Math.abs(p.y - 1952000) < 2000, JSON.stringify(p));
});
