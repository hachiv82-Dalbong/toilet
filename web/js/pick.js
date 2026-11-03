import { distanceMeters } from "./geo.js";
import { openStatus } from "./hours.js";

export function rankToilets(toilets, me, now) {
  return toilets
    .map((t) => ({ ...t, distance: distanceMeters(me, t), status: openStatus(t.hours, now) }))
    .sort((a, b) => a.distance - b.distance);
}

// ranked는 거리 오름차순. 닫힌 곳은 절대 추천하지 않는다.
export function pickRecommendation(ranked, nearRadius = 700) {
  const near = ranked.filter((t) => t.distance <= nearRadius);
  const nearOpen = near.find((t) => t.status === "open");
  if (nearOpen) return { toilet: nearOpen, warning: false };
  const nearUnknown = near.find((t) => t.status === "unknown");
  if (nearUnknown) return { toilet: nearUnknown, warning: true };
  const any = ranked.find((t) => t.status !== "closed");
  return any ? { toilet: any, warning: any.status === "unknown" } : null;
}
