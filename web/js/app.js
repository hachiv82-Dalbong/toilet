import { formatDistance, walkMinutes } from "./geo.js";
import { tileKeysAround, loadTiles } from "./tiles.js";
import { rankToilets, pickRecommendation } from "./pick.js";
import { navLinks } from "./navlinks.js";
import { locationMessage } from "./locate-error.js";

const L = window.L;
const SEOUL_CITY_HALL = { lat: 37.5663, lng: 126.9779 };
const STATUS_LABEL = { open: "지금 열림", unknown: "운영시간 확인 필요", closed: "닫힘" };
const PIN = {
  recommended: { radius: 11, color: "#ffffff", weight: 3, fillColor: "#e8442e", fillOpacity: 1 },
  open: { radius: 7, color: "#ffffff", weight: 2, fillColor: "#1f9d3a", fillOpacity: 1 },
  unknown: { radius: 7, color: "#ffffff", weight: 2, fillColor: "#f2b705", fillOpacity: 1 },
  closed: { radius: 6, color: "#ffffff", weight: 2, fillColor: "#9aa0a8", fillOpacity: 1 },
};

const card = document.getElementById("card");
const sheet = document.getElementById("sheet");
const source = document.getElementById("source");

// tolerance: 작은 핀도 손가락으로 누르기 쉽게 터치 인식 범위를 넓힌다
const map = L.map("map", { zoomControl: false, renderer: L.canvas({ tolerance: 12 }) }).setView([SEOUL_CITY_HALL.lat, SEOUL_CITY_HALL.lng], 15);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
map.attributionControl.setPosition("topright");
const pins = L.layerGroup().addTo(map);
let meMarker = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status} ${url}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

function showMessage(text, retryLabel) {
  card.replaceChildren(el("p", "status-line", text));
  if (retryLabel) {
    const btn = el("button", "btn", retryLabel);
    btn.type = "button";
    btn.addEventListener("click", start);
    card.append(btn);
  }
}

function facilitiesText(f) {
  const parts = [["남", f.male], ["여", f.female], ["장애인", f.disabled], ["어린이", f.child]]
    .filter(([, n]) => n != null && n > 0)
    .map(([label, n]) => `${label} ${n}`);
  return parts.length ? `변기 수: ${parts.join(" · ")}` : null;
}

function openNaver(event, link, addr) {
  event.preventDefault();
  window.location.href = link;
  // 앱이 없으면 페이지가 그대로 보이므로 웹 검색으로 넘긴다
  setTimeout(() => {
    if (document.visibilityState === "visible") window.location.href = `https://map.naver.com/p/search/${encodeURIComponent(addr)}`;
  }, 1500);
}

function showToilet(t, warning) {
  const nodes = [];
  if (warning) nodes.push(el("p", "warning", `열려 있는지 확인되지 않았어요. 개방시간: ${t.hoursText || "정보 없음"}`));
  nodes.push(el("span", `badge ${t.status}`, STATUS_LABEL[t.status]));
  nodes.push(el("h1", "name", t.name));
  nodes.push(el("p", "dist", `${formatDistance(t.distance)} · 도보 약 ${walkMinutes(t.distance)}분`));
  nodes.push(el("p", "addr", t.addr));
  if (t.hoursText) nodes.push(el("p", "meta", `개방시간: ${t.hoursText}`));
  const fac = facilitiesText(t.facilities ?? {});
  if (fac) nodes.push(el("p", "meta", fac));

  const links = navLinks(t);
  const navs = el("div", "navs");
  for (const [key, label] of [["kakao", "카카오맵"], ["naver", "네이버"], ["google", "구글"]]) {
    const a = el("a", key, label);
    a.href = links[key];
    a.rel = "noopener";
    if (key === "naver") a.addEventListener("click", (e) => openNaver(e, links.naver, t.addr));
    else a.target = "_blank";
    navs.append(a);
  }
  nodes.push(navs);
  card.replaceChildren(...nodes);
}

function drawPins(ranked, recommended) {
  pins.clearLayers();
  // 추천 핀이 위에 오도록 마지막에 그린다
  for (const t of [...ranked].reverse()) {
    if (t === recommended) continue;
    L.circleMarker([t.lat, t.lng], PIN[t.status]).on("click", () => showToilet(t, t.status === "unknown")).addTo(pins);
  }
  if (recommended) {
    L.circleMarker([recommended.lat, recommended.lng], PIN.recommended)
      .on("click", () => showToilet(recommended, recommended.status === "unknown"))
      .addTo(pins);
  }
}

function showMe(me) {
  if (meMarker) meMarker.remove();
  meMarker = L.marker([me.lat, me.lng], {
    icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
    interactive: false,
    keyboard: false,
  }).addTo(map);
}

function frame(me, t) {
  const pad = sheet.offsetHeight + 24;
  map.fitBounds(L.latLngBounds([me.lat, me.lng], [t.lat, t.lng]), { paddingTopLeft: [40, 40], paddingBottomRight: [40, pad], maxZoom: 16 });
}

function locate() {
  const at = new URLSearchParams(location.search).get("at");
  if (at) {
    const [lat, lng] = at.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return Promise.resolve({ lat, lng });
  }
  const once = (options) =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("no geolocation"));
      navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, options);
    });
  // 지하·실내에서는 정밀 위치가 자주 실패하므로, 권한 거부가 아니면 대략적인 위치로 한 번 더 시도한다
  return once({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }).catch((err) => {
    if (err?.code === 1) throw err;
    return once({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  });
}

async function findNearest(me) {
  const now = new Date();
  let ranked = [];
  for (const ring of [1, 2]) {
    ranked = rankToilets(await loadTiles(tileKeysAround(me.lat, me.lng, ring), fetchJson), me, now);
    const pick = pickRecommendation(ranked);
    if (pick) return { ranked, pick };
  }
  return { ranked, pick: null };
}

async function start() {
  showMessage("가까운 화장실을 찾는 중…");
  let me;
  try {
    me = await locate();
  } catch (err) {
    showMessage(locationMessage(err), "다시 시도");
    return;
  }
  showMe(me);
  try {
    const { ranked, pick } = await findNearest(me);
    drawPins(ranked, pick?.toilet);
    if (!pick) {
      map.setView([me.lat, me.lng], 15);
      showMessage("주변에서 화장실을 찾지 못했어요");
      return;
    }
    showToilet(pick.toilet, pick.warning);
    frame(me, pick.toilet);
  } catch {
    map.setView([me.lat, me.lng], 15);
    showMessage("데이터를 불러오지 못했어요", "다시 시도");
  }
}

fetchJson("data/meta.json")
  .then((meta) => {
    source.textContent = `데이터: 행정안전부 · 갱신 ${meta.updatedAt}`;
  })
  .catch(() => {});

start();
