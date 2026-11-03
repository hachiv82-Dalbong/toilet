// 개방시간 자유 텍스트 → Hours. 확실히 해석되는 것만 24h/range로, 나머지는 전부 unknown.
// 애매한 것을 열림으로 판정하면 닫힌 화장실로 안내하게 되므로 보수적으로 둔다.

const UNKNOWN = { type: "unknown" };
const TIME = String.raw`(\d{1,2})(?::(\d{2})|시)`;
const RANGE = new RegExp(String.raw`^${TIME}\s*[~\-～〜]\s*${TIME}$`);

function toMinutes(h, m) {
  const hour = Number(h);
  const min = m === undefined ? 0 : Number(m);
  if (min > 59 || hour > 24 || (hour === 24 && min !== 0)) return null;
  return hour * 60 + min;
}

export function parseHours(text) {
  if (text == null) return UNKNOWN;
  const t = String(text).trim().replace(/\s+/g, " ");
  if (t === "24시간") return { type: "24h" };

  const m = RANGE.exec(t);
  if (!m) return UNKNOWN;
  const open = toMinutes(m[1], m[2]);
  const close = toMinutes(m[3], m[4]);
  if (open === null || close === null || open === close) return UNKNOWN;
  if (open === 0 && close >= 1439) return { type: "24h" };
  return { type: "range", open, close };
}
