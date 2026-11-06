// 네이버 지도(Dynamic Map) 감싸기. 지도가 실패해도 카드는 보여야 하므로 오류를 밖으로 내보내지 않는다.

const MAX_PINS = 300; // 핀이 DOM 요소라 밀집 지역에서 휴대폰이 느려지지 않게 제한한다
const PIN_SIZE = 36; // 작은 점도 손가락으로 누르기 쉽게 터치 영역을 넓힌다
const ME_SIZE = 22;
const DEFAULT_ZOOM = 15;
const MAX_FIT_ZOOM = 16;
const FIT_MARGIN = 40;

export function pinsToDraw(ranked, recommended, limit = MAX_PINS) {
  const pins = ranked.slice(0, limit);
  if (recommended && !pins.includes(recommended)) pins.push(recommended);
  return pins;
}

const NOOP_VIEW = { showMe() {}, setPins() {}, frame() {}, center() {}, onPick() {}, interactive: false };

function safely(view) {
  const guard = (fn) => (...args) => {
    try {
      fn(...args);
    } catch (e) {
      console.error(e);
    }
  };
  return Object.fromEntries(Object.entries(view).map(([name, fn]) => [name, guard(fn)]));
}

export function createMap(api, elementId, center) {
  const maps = api?.maps;
  if (!maps) return NOOP_VIEW;

  let map;
  try {
    map = new maps.Map(elementId, {
      center: new maps.LatLng(center.lat, center.lng),
      zoom: DEFAULT_ZOOM,
      scaleControl: false,
      // 기본 위치(왼쪽 아래)는 하단 카드에 가려지므로 위로 올린다. 네이버 로고는 가리면 안 된다.
      logoControlOptions: { position: maps.Position.TOP_LEFT },
      mapDataControlOptions: { position: maps.Position.TOP_LEFT },
    });
  } catch (e) {
    console.error(e);
    return NOOP_VIEW;
  }

  const latLng = (p) => new maps.LatLng(p.lat, p.lng);
  const icon = (className, size) => ({
    content: `<div class="${className}"></div>`,
    size: new maps.Size(size, size),
    anchor: new maps.Point(size / 2, size / 2),
  });

  let meMarker = null;
  let pinMarkers = [];
  let pickHandler = null;
  let listeningForPick = false;

  const view = safely({
    showMe(me) {
      if (meMarker) meMarker.setMap(null);
      meMarker = new maps.Marker({ map, position: latLng(me), clickable: false, zIndex: 300, icon: icon("me-dot", ME_SIZE) });
    },
    setPins(pins, recommended, onSelect) {
      for (const m of pinMarkers) m.setMap(null);
      const pinClass = (t, selected) => `pin ${t.status}${t === recommended ? " recommended" : ""}${selected ? " selected" : ""}`;
      const zIndex = (t, selected) => (selected ? 250 : t === recommended ? 200 : 100);
      let current = null; // 지금 카드에 보이는 화장실의 핀을 눈에 띄게 한다
      const mark = (entry, selected) => {
        entry.marker.setIcon(icon(pinClass(entry.toilet, selected), PIN_SIZE));
        entry.marker.setZIndex(zIndex(entry.toilet, selected));
      };
      pinMarkers = pins.map((t) => {
        const selected = t === recommended;
        const marker = new maps.Marker({ map, position: latLng(t), zIndex: zIndex(t, selected), icon: icon(pinClass(t, selected), PIN_SIZE) });
        const entry = { marker, toilet: t };
        if (selected) current = entry;
        maps.Event.addListener(marker, "click", () => {
          if (current && current !== entry) mark(current, false);
          mark(entry, true);
          current = entry;
          onSelect(t);
        });
        return marker;
      });
    },
    frame(me, t, bottomMargin) {
      const sw = new maps.LatLng(Math.min(me.lat, t.lat), Math.min(me.lng, t.lng));
      const ne = new maps.LatLng(Math.max(me.lat, t.lat), Math.max(me.lng, t.lng));
      map.fitBounds(new maps.LatLngBounds(sw, ne), {
        top: FIT_MARGIN,
        right: FIT_MARGIN,
        bottom: bottomMargin,
        left: FIT_MARGIN,
        maxZoom: MAX_FIT_ZOOM,
      });
    },
    center(me) {
      map.setCenter(latLng(me));
      map.setZoom(DEFAULT_ZOOM);
    },
    // 위치 권한이 없을 때 지도를 눌러 내 위치를 정한다. null이면 그만 받는다.
    onPick(handler) {
      pickHandler = handler;
      if (handler && !listeningForPick) {
        maps.Event.addListener(map, "click", (e) => pickHandler?.({ lat: e.coord.lat(), lng: e.coord.lng() }));
        listeningForPick = true;
      }
    },
  });
  return { ...view, interactive: true };
}
