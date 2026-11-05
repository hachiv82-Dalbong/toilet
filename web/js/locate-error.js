// GeolocationPositionError.code: 1 = 권한 거부, 2 = 위치를 알 수 없음, 3 = 시간 초과
export function locationMessage(err) {
  return err?.code === 1 ? "위치 권한이 필요해요" : "현재 위치를 찾지 못했어요";
}

// 한 번 거부되면 브라우저가 다시 묻지 않으므로, 사용자가 직접 켜는 방법을 알려 준다
export function locationHelp(err) {
  if (err?.code === 1) {
    return "브라우저가 위치 사용을 막고 있어요. 주소창 옆 아이콘이나 브라우저 설정에서 이 사이트의 위치를 허용하고, 휴대폰 설정에서 브라우저 위치 권한도 켜 주세요. 카카오톡 등 앱 안에서 열었다면 Chrome이나 Safari로 열어 보세요.";
  }
  return "휴대폰의 위치 서비스가 켜져 있는지 확인해 주세요. 지하나 실내라면 실외로 나오면 잡힐 수 있어요.";
}
