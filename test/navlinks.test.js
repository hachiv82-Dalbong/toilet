import { test } from "node:test";
import assert from "node:assert/strict";
import { navLinks } from "../web/js/navlinks.js";

test("nav links", () => {
  const l = navLinks({ name: "○○공원, 화장실", lat: 37.1, lng: 127.2 });
  assert.equal(l.kakao, "https://map.kakao.com/link/to/" + encodeURIComponent("○○공원  화장실") + ",37.1,127.2");
  assert.ok(l.naver.startsWith("nmap://route/walk?dlat=37.1&dlng=127.2&dname="));
  assert.ok(l.naver.includes("&appname="));
  assert.equal(l.google, "https://www.google.com/maps/dir/?api=1&destination=37.1,127.2&travelmode=walking");
});
