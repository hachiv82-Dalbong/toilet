// 개방시간 → Hours. 확실히 해석되는 것만 24h/range로, 나머지는 전부 unknown.
// 애매한 것을 열림으로 판정하면 닫힌 화장실로 안내하게 되므로 보수적으로 둔다.

const UNKNOWN = { type: "unknown" };
const TIME = String.raw`(\d{1,2})(?:[:;](\d{2})|(시))?`;
const RANGE = new RegExp(String.raw`^${TIME}\s*[~\-～〜∼]\s*${TIME}$`);
const ALL_DAY = /^(24시간|상시)( ?(개방|운영|이용))?$/;
const ALL_DAY_MIN_CLOSE = 1430; // "00:00~23:50"도 사실상 하루 종일이다
const MAX_CLOSE_HOUR = 30; // "05:00~25:00"처럼 다음 날 새벽까지 표기하는 경우

function toMinutes(h, m, maxHour) {
  const hour = Number(h);
  const min = m === undefined ? 0 : Number(m);
  if (min > 59 || hour > maxHour || (hour === maxHour && min !== 0)) return null;
  return hour * 60 + min;
}

export function parseHours(text) {
  if (text == null) return UNKNOWN;
  const t = String(text).trim().replace(/\s+/g, " ");
  if (ALL_DAY.test(t)) return { type: "24h" };

  const m = RANGE.exec(t);
  if (!m) return UNKNOWN;
  const [, h1, m1, si1, h2, m2, si2] = m;
  // "08~20"처럼 시·분 표시가 전혀 없으면 두 자리일 때만 시간으로 본다("1~12", "3-10"은 시간이 아닐 수 있다)
  const bare = m1 === undefined && !si1 && m2 === undefined && !si2;
  if (bare && (h1.length < 2 || h2.length < 2)) return UNKNOWN;
  const open = toMinutes(h1, m1, 24);
  let close = toMinutes(h2, m2, MAX_CLOSE_HOUR);
  if (open === null || close === null) return UNKNOWN;
  if (open === 0 && (close === 0 || close >= ALL_DAY_MIN_CLOSE)) return { type: "24h" };
  if (close > 1440) close -= 1440;
  if (open === close) return UNKNOWN;
  return { type: "range", open, close };
}

// API의 OPN_HR(구분)과 OPN_HR_DTL(상세). null은 미개방 → 데이터에서 제외한다.
// 상시인데 세부 시간이 따로 적혀 있으면 더 구체적인 세부 시간을 따른다.
const ALWAYS_DETAILS = new Set(["", "상시", "연중무휴", "0", "-"]);

export function hoursFromRecord(category, detail) {
  const c = String(category ?? "").trim();
  const d = String(detail ?? "").trim();
  if (d === "미개방") return null;
  if (c === "상시") return ALWAYS_DETAILS.has(d) ? { type: "24h" } : parseHours(d);
  if (c === "정시") return parseHours(detail);
  if (c === "미개방") return null;
  // 구분값이 그 밖의 값이어도 시간이 또렷하면 읽는다
  return parseHours(d || c);
}
