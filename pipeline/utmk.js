// EPSG:5179 (UTM-K, GRS80) ↔ WGS84. 도로명주소 좌표제공 API가 UTM-K로 좌표를 준다.
// 횡메르카토르 정·역변환 급수 (Snyder, Map Projections — A Working Manual, 1987)

const A = 6378137;
const F = 1 / 298.257222101;
const E2 = 2 * F - F * F;
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const LAT0 = (38 * Math.PI) / 180;
const LNG0 = (127.5 * Math.PI) / 180;
const FE = 1000000;
const FN = 2000000;

const E4 = E2 * E2;
const E6 = E4 * E2;
const M1 = 1 - E2 / 4 - (3 * E4) / 64 - (5 * E6) / 256;

function meridianArc(phi) {
  return (
    A *
    (M1 * phi -
      ((3 * E2) / 8 + (3 * E4) / 32 + (45 * E6) / 1024) * Math.sin(2 * phi) +
      ((15 * E4) / 256 + (45 * E6) / 1024) * Math.sin(4 * phi) -
      ((35 * E6) / 3072) * Math.sin(6 * phi))
  );
}

const M0 = meridianArc(LAT0);
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function wgs84ToUtmk(lat, lng) {
  const phi = toRad(lat);
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const n = A / Math.sqrt(1 - E2 * sin * sin);
  const t = Math.tan(phi) ** 2;
  const c = EP2 * cos * cos;
  const a = (toRad(lng) - LNG0) * cos;
  const x = FE + K0 * n * (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120);
  const y =
    FN +
    K0 *
      (meridianArc(phi) -
        M0 +
        n * Math.tan(phi) * (a ** 2 / 2 + ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 + ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720));
  return { x, y };
}

export function utmkToWgs84(x, y) {
  const m = M0 + (y - FN) / K0;
  const mu = m / (A * M1);
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const c1 = EP2 * cos1 * cos1;
  const t1 = Math.tan(phi1) ** 2;
  const n1 = A / Math.sqrt(1 - E2 * sin1 * sin1);
  const r1 = (A * (1 - E2)) / (1 - E2 * sin1 * sin1) ** 1.5;
  const d = (x - FE) / (n1 * K0);
  const phi =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6) / 720);
  const lng = LNG0 + (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) / 120) / cos1;
  return { lat: toDeg(phi), lng: toDeg(lng) };
}
