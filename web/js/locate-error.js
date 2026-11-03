// GeolocationPositionError.code: 1 = 권한 거부, 2 = 위치를 알 수 없음, 3 = 시간 초과
export function locationMessage(err) {
  return err?.code === 1 ? "위치 권한이 필요해요" : "현재 위치를 찾지 못했어요";
}
