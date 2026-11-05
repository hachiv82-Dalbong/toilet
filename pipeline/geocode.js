// 주소 → 좌표. 행정안전부 도로명주소 API(검색 → 좌표제공)를 쓰고, 결과는 캐시에 쌓아 다음 실행에서 재사용한다.
import { utmkToWgs84 } from "./utmk.js";

const SEARCH_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do";
const COORD_URL = "https://business.juso.go.kr/addrlink/addrCoordApi.do";
const COORD_PARAMS = ["admCd", "rnMgtSn", "udrtYn", "buldMnnm", "buldSlno"];
const RETRY_FAILED_AFTER_DAYS = 30;
const MAX_CONSECUTIVE_ERRORS = 20;
// 빠르게 부르면 E0007로 거절된다(실측: 0.1초 간격이면 20여 번째부터). 주소 하나가 호출 2번이다.
const PACE_MS = 600;
const THROTTLE_BACKOFF_MS = 10000;
const THROTTLE_RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const daysBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;

// "…로 273, 민락국민체육센터"처럼 붙은 건물명은 검색을 방해하므로 쉼표 앞까지만 쓴다.
export function searchKeyword(addr) {
  return addr.split(",")[0].trim();
}

// 검색어 자체의 문제(너무 짧음, 범위가 넓음, 특수문자 등)라 다시 해도 같다 → "찾지 못함"으로 캐시한다.
// 그 밖의 코드(키 오류, 시스템 오류)는 throw해서 다음 실행에 다시 시도한다.
const INPUT_ERRORS = new Set(["E0005", "E0006", "E0008", "E0009", "E0011", "E0012", "E0013", "E0015"]);
const THROTTLED = "E0007"; // 짧은 시간에 요청이 많음. 주소 문제가 아니므로 절대 "찾지 못함"으로 캐시하면 안 된다.

async function getJuso(url, fetchFn) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { results } = await res.json();
  const { errorCode, errorMessage, totalCount } = results?.common ?? {};
  if (INPUT_ERRORS.has(errorCode)) return { list: [], totalCount: 0 };
  if (errorCode === THROTTLED) throw Object.assign(new Error(`juso ${errorCode}: ${errorMessage}`), { throttled: true });
  if (errorCode !== "0") throw new Error(`juso ${errorCode}: ${errorMessage}`);
  return { list: results.juso ?? [], totalCount: Number(totalCount ?? (results.juso ?? []).length) };
}

const squash = (s) => String(s ?? "").replace(/\s+/g, "");

export async function jusoGeocode(addr, { searchKey, coordKey }, fetchFn = fetch) {
  const keyword = searchKeyword(addr);
  const search = await getJuso(
    `${SEARCH_URL}?confmKey=${encodeURIComponent(searchKey)}&currentPage=1&countPerPage=5&keyword=${encodeURIComponent(keyword)}&resultType=json`,
    fetchFn
  );
  // 검색은 비슷한 주소도 함께 돌려준다. 도로명주소가 정확히 같은 후보를 쓰고, 없으면 후보가 하나뿐일 때만 믿는다.
  // 급한 사람을 엉뚱한 곳으로 보내느니 지도에서 빼는 편이 낫다.
  const exact = search.list.find((j) => squash(j.roadAddrPart1) === squash(keyword));
  const hit = exact ?? (search.totalCount === 1 ? search.list[0] : null);
  if (!hit) return null;
  const params = COORD_PARAMS.map((k) => `${k}=${encodeURIComponent(hit[k] ?? "")}`).join("&");
  const { list: [coord] } = await getJuso(`${COORD_URL}?confmKey=${encodeURIComponent(coordKey)}&${params}&resultType=json`, fetchFn);
  if (!coord?.entX || !coord?.entY) return null;
  const { lat, lng } = utmkToWgs84(Number(coord.entX), Number(coord.entY));
  return [lat, lng];
}

// cache: { [addr]: { lat, lng } | { failedAt: "YYYY-MM-DD" } }. budget은 이번 실행에서 조회할 주소 수 상한.
// deadline(ms, now() 기준)을 넘기면 멈추고, checkpointEvery건마다 onCheckpoint(cache)로 중간 저장한다.
export async function geocodeAll(
  addrs,
  cache,
  { geocodeOne, budget, today, delayMs = PACE_MS, throttleBackoffMs = THROTTLE_BACKOFF_MS, deadline = Infinity, now = Date.now, checkpointEvery = 0, onCheckpoint }
) {
  const lookup = async (addr) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await geocodeOne(addr);
      } catch (e) {
        if (!e.throttled || attempt >= THROTTLE_RETRIES) throw e;
        await sleep(throttleBackoffMs);
      }
    }
  };
  const next = { ...cache };
  const stats = { hit: 0, newOk: 0, newFailed: 0, knownFailed: 0, pending: 0 };
  let calls = 0;
  let consecutiveErrors = 0;

  for (const addr of new Set(addrs)) {
    const entry = next[addr];
    if (entry && "lat" in entry) {
      stats.hit++;
      continue;
    }
    if (entry?.failedAt && daysBetween(entry.failedAt, today) < RETRY_FAILED_AFTER_DAYS) {
      stats.knownFailed++;
      continue;
    }
    if (calls >= budget || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS || now() >= deadline) {
      stats.pending++;
      continue;
    }

    if (calls > 0 && delayMs) await sleep(delayMs);
    calls++;
    try {
      const result = await lookup(addr);
      consecutiveErrors = 0;
      if (result) {
        next[addr] = { lat: result[0], lng: result[1] };
        stats.newOk++;
      } else {
        next[addr] = { failedAt: today };
        stats.newFailed++;
      }
    } catch (e) {
      consecutiveErrors++;
      stats.pending++;
      stats.lastError = e.message;
    }
    if (checkpointEvery && onCheckpoint && calls % checkpointEvery === 0) onCheckpoint(next);
  }
  return { cache: next, stats };
}
