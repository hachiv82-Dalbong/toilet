const ENDPOINT = "https://apis.data.go.kr/1741000/public_restroom_info_v2/info_v2";
const ATTEMPTS = 3;
const MIN_COMPLETE_RATIO = 0.95; // 이보다 적게 받으면 반쪽 데이터로 보고 실패시킨다

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage({ serviceKey, fetchFn, pageNo, numOfRows }) {
  const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(serviceKey)}&pageNo=${pageNo}&numOfRows=${numOfRows}&returnType=json`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${pageNo}`);
  const json = await res.json();
  if (json.OpenAPI_ServiceResponse) {
    throw new Error(`API error: ${json.OpenAPI_ServiceResponse.cmmMsgHeader?.errMsg ?? "unknown"}`);
  }
  const { header, body } = json.response ?? {};
  if (header?.resultCode !== "0") throw new Error(`API resultCode ${header?.resultCode}: ${header?.resultMsg}`);
  const item = body.items?.item ?? [];
  return { totalCount: Number(body.totalCount), items: Array.isArray(item) ? item : [item] };
}

async function fetchPageWithRetry(opts, retryDelayMs) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchPage(opts);
    } catch (e) {
      if (attempt >= ATTEMPTS) throw e;
      await sleep(retryDelayMs);
    }
  }
}

export async function fetchAllToilets({ serviceKey, fetchFn = fetch, numOfRows = 100, retryDelayMs = 2000 }) {
  const opts = { serviceKey, fetchFn, numOfRows };
  const first = await fetchPageWithRetry({ ...opts, pageNo: 1 }, retryDelayMs);
  const pages = Math.ceil(first.totalCount / numOfRows);
  const all = [...first.items];
  for (let pageNo = 2; pageNo <= pages; pageNo++) {
    all.push(...(await fetchPageWithRetry({ ...opts, pageNo }, retryDelayMs)).items);
  }
  if (all.length < first.totalCount * MIN_COMPLETE_RATIO) {
    throw new Error(`incomplete fetch: ${all.length} of ${first.totalCount}`);
  }
  return all;
}
