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
