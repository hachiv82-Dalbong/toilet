const KST_OFFSET_MIN = 9 * 60;

// 기기 시간대와 상관없이 KST 기준 자정부터의 분
function kstMinutes(now) {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + KST_OFFSET_MIN) % 1440;
}

export function openStatus(hours, now) {
  if (hours.type === "24h") return "open";
  if (hours.type !== "range") return "unknown";
  const t = kstMinutes(now);
  const { open, close } = hours;
  const isOpen = open < close ? open <= t && t < close : t >= open || t < close;
  return isOpen ? "open" : "closed";
}

const pad = (n) => String(n).padStart(2, "0");
const clock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// 해석하지 못한 글 안의 시간 범위. "1~12", "3-10월", 전화번호처럼 시간이 아닌 숫자는 건드리지 않는다.
const TIME_RANGE = /(?<![\d-])(\d{1,2})(?:[:;](\d{2})|(시))?\s*[~\-～〜∼]\s*(\d{1,2})(?:[:;](\d{2})|(시))?(?![\d월일:;-])/g;

function tidyRange(match, h1, m1, si1, h2, m2, si2) {
  const bare = m1 === undefined && !si1 && m2 === undefined && !si2;
  if (bare && (h1.length < 2 || h2.length < 2)) return match;
  const [open, close] = [Number(h1), Number(h2)];
  if (open > 24 || close > 30 || Number(m1 ?? 0) > 59 || Number(m2 ?? 0) > 59) return match;
  return `${pad(open)}:${m1 ?? "00"}-${pad(close > 24 ? close - 24 : close)}:${m2 ?? "00"}`;
}

// 화면에 보일 개방시간. 항상 HH:MM-HH:MM으로 쓰고, 알 수 없으면 빈 문자열을 돌려준다.
export function formatHours(hours, text) {
  if (hours.type === "24h") return "00:00-24:00";
  if (hours.type === "range") return `${clock(hours.open)}-${clock(hours.close)}`;
  const raw = String(text ?? "").trim();
  if (raw === "정시") return ""; // 구분값만 있고 실제 시간이 없다
  if (!/[\p{L}\d]/u.test(raw)) return ""; // ":~:", "-" 같은 빈 값
  if (raw.startsWith("24시간")) return "00:00-24:00";
  return raw.replace(TIME_RANGE, tidyRange);
}
