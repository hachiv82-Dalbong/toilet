import { formatDistance, walkMinutes } from "./geo.js";
import { tileKeysAround, loadTiles } from "./tiles.js";
import { rankToilets, pickRecommendation } from "./pick.js";
import { navLinks } from "./navlinks.js";
import { locationMessage, locationHelp } from "./locate-error.js";
import { createMap, pinsToDraw } from "./map.js";

const SEOUL_CITY_HALL = { lat: 37.5663, lng: 126.9779 };
const MIN_SEARCHING_MS = 700;
const STATUS_LABEL = { open: "지금 열림", unknown: "운영시간 확인 필요", closed: "닫힘" };

const card = document.getElementById("card");
const sheet = document.getElementById("sheet");
const source = document.getElementById("source");
const mapView = createMap(window.naver, "map", SEOUL_CITY_HALL);
const metaLoaded = fetchJson("data/meta.json").catch(() => null);

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

function showMessage(text, retryLabel, help) {
  card.replaceChildren(el("p", "status-line", text));
  if (help) card.append(el("p", "meta help", help));
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

function notFoundMessage(meta) {
  const area = meta?.regions?.join("·");
  return area ? `주변에서 화장실을 찾지 못했어요. 지금은 ${area} 지역만 제공해요.` : "주변에서 화장실을 찾지 못했어요";
}

async function start() {
  showMessage("가까운 화장실을 찾는 중…");
  const startedAt = Date.now();
  let me;
  try {
    me = await locate();
  } catch (err) {
    // 거부 상태면 바로 실패해서 버튼이 안 눌린 것처럼 보이므로, 찾는 중 문구를 잠깐 보여 준다
    await new Promise((r) => setTimeout(r, Math.max(0, MIN_SEARCHING_MS - (Date.now() - startedAt))));
    showMessage(locationMessage(err), "다시 시도", locationHelp(err));
    return;
  }
  mapView.showMe(me);
  let found;
  try {
    found = await findNearest(me);
  } catch {
    mapView.center(me);
    showMessage("데이터를 불러오지 못했어요", "다시 시도");
    return;
  }
  const { ranked, pick } = found;
  // 카드를 먼저 그린다. 지도에 문제가 있어도 가장 가까운 화장실은 알 수 있어야 한다.
  if (pick) showToilet(pick.toilet, pick.warning);
  else showMessage(notFoundMessage(await metaLoaded));
  mapView.setPins(pinsToDraw(ranked, pick?.toilet), pick?.toilet, (t) => showToilet(t, t.status === "unknown"));
  if (pick) mapView.frame(me, pick.toilet, sheet.offsetHeight + 24);
  else mapView.center(me);
}

metaLoaded.then((meta) => {
  if (meta) source.textContent = `데이터: 행정안전부 · 갱신 ${meta.updatedAt}`;
});

start();
