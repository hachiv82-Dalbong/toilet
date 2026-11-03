// 주소 → 좌표. 행정안전부 도로명주소 API(검색 → 좌표제공)를 쓰고, 결과는 캐시에 쌓아 다음 실행에서 재사용한다.
import { utmkToWgs84 } from "./utmk.js";

const SEARCH_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do";
const COORD_URL = "https://business.juso.go.kr/addrlink/addrCoordApi.do";
const COORD_PARAMS = ["admCd", "rnMgtSn", "udrtYn", "buldMnnm", "buldSlno"];
const RETRY_FAILED_AFTER_DAYS = 30;
const MAX_CONSECUTIVE_ERRORS = 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const daysBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;

// "…로 273, 민락국민체육센터"처럼 붙은 건물명은 검색을 방해하므로 쉼표 앞까지만 쓴다.
export function searchKeyword(addr) {
  return addr.split(",")[0].trim();
}

async function getJuso(url, fetchFn) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { results } = await res.json();
  const { errorCode, errorMessage } = results?.common ?? {};
  if (errorCode !== "0") throw new Error(`juso ${errorCode}: ${errorMessage}`);
  return results.juso ?? [];
}

export async function jusoGeocode(addr, { searchKey, coordKey }, fetchFn = fetch) {
  const keyword = encodeURIComponent(searchKeyword(addr));
  const [hit] = await getJuso(`${SEARCH_URL}?confmKey=${searchKey}&currentPage=1&countPerPage=1&keyword=${keyword}&resultType=json`, fetchFn);
  if (!hit) return null;
  const params = COORD_PARAMS.map((k) => `${k}=${encodeURIComponent(hit[k] ?? "")}`).join("&");
  const [coord] = await getJuso(`${COORD_URL}?confmKey=${coordKey}&${params}&resultType=json`, fetchFn);
  if (!coord?.entX || !coord?.entY) return null;
  const { lat, lng } = utmkToWgs84(Number(coord.entX), Number(coord.entY));
  return [lat, lng];
}

// cache: { [addr]: { lat, lng } | { failedAt: "YYYY-MM-DD" } }. budget은 이번 실행에서 조회할 주소 수 상한.
export async function geocodeAll(addrs, cache, { geocodeOne, budget, today, delayMs = 50 }) {
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
    if (calls >= budget || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      stats.pending++;
      continue;
    }

    if (calls > 0 && delayMs) await sleep(delayMs);
    calls++;
    try {
      const result = await geocodeOne(addr);
      consecutiveErrors = 0;
      if (result) {
        next[addr] = { lat: result[0], lng: result[1] };
        stats.newOk++;
      } else {
        next[addr] = { failedAt: today };
        stats.newFailed++;
      }
    } catch {
      consecutiveErrors++;
      stats.pending++;
    }
  }
  return { cache: next, stats };
}
