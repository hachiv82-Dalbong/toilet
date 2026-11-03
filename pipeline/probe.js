// 개발용 확인 도구: API 응답 구조와 개방시간 분포를 본다.
//   SERVICE_KEY=... node pipeline/probe.js           → 첫 레코드와 totalCount
//   SERVICE_KEY=... node pipeline/probe.js --hours   → 1,000건 샘플의 개방시간 빈도
const ENDPOINT = "https://apis.data.go.kr/1741000/public_restroom_info_v2/info_v2";
const key = process.env.SERVICE_KEY;
if (!key) throw new Error("SERVICE_KEY is not set");

const page = async (pageNo, numOfRows) => {
  const res = await fetch(`${ENDPOINT}?serviceKey=${encodeURIComponent(key)}&pageNo=${pageNo}&numOfRows=${numOfRows}&returnType=json`);
  return (await res.json()).response.body;
};

if (process.argv.includes("--hours")) {
  const first = await page(1, 1);
  const step = Math.max(1, Math.floor(first.totalCount / 100 / 10));
  const freq = new Map();
  for (let i = 0; i < 10; i++) {
    for (const it of (await page(1 + i * step, 100)).items.item) {
      const k = `${it.OPN_HR} | ${it.OPN_HR_DTL}`;
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
  }
  for (const [k, v] of [...freq].sort((a, b) => b[1] - a[1]).slice(0, 50)) console.log(String(v).padStart(4), k);
} else {
  const body = await page(1, 1);
  console.log("totalCount", body.totalCount);
  console.log(JSON.stringify(body.items.item[0], null, 1));
}
