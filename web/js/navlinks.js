// 네이버 앱 스킴이 요구하는 호출 앱 식별자. 배포 호스트가 정해지면 그 값으로 바꾼다.
export const NAVER_APPNAME = "toilet-finder";

export function navLinks({ name, lat, lng }) {
  const kakaoName = encodeURIComponent(name.replace(/,/g, " "));
  return {
    kakao: `https://map.kakao.com/link/to/${kakaoName},${lat},${lng}`,
    naver: `nmap://route/walk?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(name)}&appname=${NAVER_APPNAME}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`,
  };
}
