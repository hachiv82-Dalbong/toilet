import { test } from "node:test";
import assert from "node:assert/strict";
import { createMap, pinsToDraw } from "../web/js/map.js";

const me = { lat: 37.5663, lng: 126.9779 };
const toilet = { id: "1", lat: 37.5675, lng: 126.9789, status: "open" };

function assertUsable(view) {
  assert.doesNotThrow(() => {
    view.showMe(me);
    view.setPins([toilet], toilet, () => {});
    view.frame(me, toilet, 200);
    view.center(me);
  });
}

test("map falls back to no-op when the Naver script did not load", () => {
  assertUsable(createMap(undefined, "map", me));
});

test("map errors never escape, so the card still shows", () => {
  class Boom {
    constructor() {
      throw new Error("auth failure");
    }
  }
  assert.doesNotThrow(() => {
    const view = createMap({ maps: { Map: Boom, LatLng: Boom, Marker: Boom, Position: {} } }, "map", me);
    assertUsable(view);
  });
});

test("pinsToDraw keeps only the nearest pins", () => {
  const ranked = ["a", "b", "c", "d"].map((id) => ({ id }));
  assert.deepEqual(pinsToDraw(ranked, ranked[0], 2).map((t) => t.id), ["a", "b"]);
});

test("pinsToDraw always includes the recommended toilet", () => {
  const ranked = ["a", "b", "c", "d"].map((id) => ({ id }));
  assert.deepEqual(pinsToDraw(ranked, ranked[3], 2).map((t) => t.id), ["a", "b", "d"]);
});

test("pinsToDraw handles no recommendation", () => {
  const ranked = [{ id: "a" }];
  assert.deepEqual(pinsToDraw(ranked, undefined, 2).map((t) => t.id), ["a"]);
});

test("frame passes south-west then north-east corners wherever the toilet is", () => {
  let corners;
  class LatLng {
    constructor(lat, lng) {
      Object.assign(this, { lat, lng });
    }
  }
  class Stub {}
  class FakeMap {
    fitBounds() {}
  }
  class LatLngBounds {
    constructor(sw, ne) {
      corners = { sw, ne };
    }
  }
  const view = createMap({ maps: { Map: FakeMap, LatLng, LatLngBounds, Marker: Stub, Position: {} } }, "map", me);
  view.frame(me, { lat: 37.5, lng: 126.9 }, 200); // 내 위치의 남서쪽 화장실
  assert.deepEqual([corners.sw.lat, corners.sw.lng], [37.5, 126.9]);
  assert.deepEqual([corners.ne.lat, corners.ne.lng], [me.lat, me.lng]);
  view.frame(me, { lat: 37.6, lng: 126.9 }, 200); // 북서쪽 화장실
  assert.deepEqual([corners.sw.lat, corners.sw.lng], [me.lat, 126.9]);
  assert.deepEqual([corners.ne.lat, corners.ne.lng], [37.6, me.lng]);
});

function fakeMaps() {
  const listeners = [];
  class LatLng {
    constructor(lat, lng) {
      Object.assign(this, { lat, lng });
    }
  }
  class FakeMap {}
  const api = { maps: { Map: FakeMap, LatLng, Position: {}, Event: { addListener: (target, name, fn) => listeners.push({ target, name, fn }) } } };
  const tap = (lat, lng) => listeners.filter((l) => l.name === "click").forEach((l) => l.fn({ coord: { lat: () => lat, lng: () => lng } }));
  return { api, tap, listeners };
}

test("onPick reports the tapped location", () => {
  const { api, tap } = fakeMaps();
  const view = createMap(api, "map", me);
  const picked = [];
  view.onPick((p) => picked.push(p));
  tap(37.5, 127.1);
  assert.deepEqual(picked, [{ lat: 37.5, lng: 127.1 }]);
});

test("onPick(null) stops reporting taps", () => {
  const { api, tap } = fakeMaps();
  const view = createMap(api, "map", me);
  const picked = [];
  view.onPick((p) => picked.push(p));
  view.onPick(null);
  tap(37.5, 127.1);
  assert.deepEqual(picked, []);
});

test("view says whether the map can be tapped", () => {
  assert.equal(createMap(undefined, "map", me).interactive, false);
  assert.equal(createMap(fakeMaps().api, "map", me).interactive, true);
});

function fakeMapsWithMarkers() {
  const created = [];
  const { api } = fakeMaps();
  class Marker {
    constructor(opts) {
      created.push(opts);
    }
    setMap() {}
  }
  class Pair {}
  Object.assign(api.maps, { Marker, Size: Pair, Point: Pair });
  return { api, created };
}

test("recommended pin keeps its status class, so an unconfirmed toilet is never shown as open", () => {
  const { api, created } = fakeMapsWithMarkers();
  const view = createMap(api, "map", me);
  const unknown = { id: "u", lat: 37.5, lng: 127, status: "unknown" };
  view.setPins([unknown], unknown, () => {});
  assert.match(created[0].icon.content, /class="pin unknown recommended"/);
});

test("other pins carry only their status class", () => {
  const { api, created } = fakeMapsWithMarkers();
  const view = createMap(api, "map", me);
  view.setPins([{ id: "c", lat: 37.5, lng: 127, status: "closed" }], null, () => {});
  assert.match(created[0].icon.content, /class="pin closed"/);
});
