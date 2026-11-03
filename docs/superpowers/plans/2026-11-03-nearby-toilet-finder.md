# 주변 공중화장실 찾기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 휴대폰으로 URL을 열면 지금 열려 있는 가장 가까운 공중화장실을 지도와 카드로 보여 주고, 카카오/네이버/구글 길찾기로 넘겨 주는 정적 웹페이지와, 행정안전부 API로 매주 데이터를 갱신하는 파이프라인.

> **Revision 1 (2026-11-03):** VWorld 약관이 결과 저장을 금지해서 지오코딩을 도로명주소 API로 바꿨다. 실제 API 응답을 확인한 결과 개방시간은 분류값(`상시`/`정시`/`미개방`)이었다. 이 두 변경은 문서 끝의 **Revision 1** 절에 정리했고, Task 2b, 4, 5에서는 그 절이 원래 내용보다 우선한다.

**Architecture:** GitHub Actions가 주 1회 행정안전부 API → 도로명주소 API 지오코딩(캐시) → 개방시간 해석 → 0.05° 격자 타일 JSON 생성 → GitHub Pages 배포. 페이지는 서버 없이 내 위치 주변 타일만 읽어 거리·열림 상태를 계산한다.

**Tech Stack:** Node.js 20 (ESM, 의존성 없음, 테스트는 `node --test`), 바닐라 HTML/CSS/JS, Leaflet 1.9.4 (unpkg CDN) + OpenStreetMap 타일, GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-03-nearby-toilet-finder-design.md`

## Global Constraints

- API 키(`SERVICE_KEY`, `JUSO_SEARCH_KEY`, `JUSO_COORD_KEY`)는 환경변수 / GitHub Secrets로만 읽는다. 로컬에서는 git이 무시하는 `.env`에 둔다. 저장소와 `web/` 어디에도 키가 들어가면 안 된다.
- 행정안전부 API: `https://apis.data.go.kr/1741000/public_restroom_info_v2/info_v2`, `numOfRows` 최대 100, `returnType=json`. 개발계정 일 10,000건. 전국 약 53,600건.
- 지오코더는 행정안전부 도로명주소 API(검색 + 좌표제공)만 사용한다. VWorld, 카카오, 네이버는 결과 저장을 금지해서 쓰지 않는다.
- 개방시간: `상시` → 24h, `정시` → `OPN_HR_DTL` 해석, `미개방` → 데이터에서 제외, 그 밖의 값 → unknown.
- 열림 상태는 `"open" | "unknown" | "closed"` 세 가지다. 애매하면 절대 `"open"`이 아니다.
- 화면 문구(고정): `지금 열림`, `운영시간 확인 필요`, `닫힘`, `위치 권한이 필요해요`, 경고 `열려 있는지 확인되지 않았어요. 개방시간: {원문}`.
- 도보 시간 = 직선거리 ÷ 67 m/분, 올림, `약 N분`으로 표기한다.
- "근처" 반경 = 700m.
- 시간 판정은 기기 시간대와 상관없이 KST(UTC+9) 기준이다.
- 한국어 전용, 휴대폰 화면 우선(PC에서도 깨지지 않게).
- 갱신: 주 1회 cron + `workflow_dispatch`(수동 실행).
- 브라우저는 전국 데이터를 한 번에 받지 않는다. 주변 타일만 받는다.

## Review Focus

1. 자정을 넘기는 개방시간(`22:00~06:00`)에서 새벽 2시는 `open`이어야 한다. → Task 2 테스트 `overnight range`
2. 기기 시간대가 KST가 아니어도(예: UTC 기기) 판정은 KST 기준이어야 한다. → Task 2 테스트 `uses KST regardless of host TZ`
3. 사용자가 타일 경계 바로 옆에 있으면 가장 가까운 화장실이 옆 타일에 있을 수 있으니 놓치면 안 된다. → Task 1 테스트 `tileKeysAround covers neighbours`, Task 3 테스트 `picks toilet from adjacent tile`
4. API 페이징 도중 오류가 나도 기존 데이터를 반쪽짜리로 덮어쓰지 않고, 빌드는 실패로 끝나야 한다. → Task 6 테스트 `aborts without writing on fetch failure`
5. 지오코딩 일일 한도를 다 써도 크래시 없이 그때까지의 캐시를 저장하고, 좌표 없는 항목은 이번 회차에서 빼고 개수를 기록해야 한다. → Task 5 테스트 `stops at budget and keeps partial cache`

---

## 파일 구조

```
package.json                     "type":"module", scripts.test = "node --test test/"
.gitignore                       node_modules/, .superpowers/, .env
README.md                        사용자 준비 작업(키 발급, Secrets, Pages 설정)
web/
  index.html                     지도 + 하단 카드 마크업, Leaflet CDN
  css/style.css
  js/geo.js                      거리·도보시간·표기
  js/tiles.js                    TILE_DEG, 타일 키, 주변 타일 로드
  js/hours.js                    openStatus(hours, now)
  js/pick.js                     추천 선택 규칙
  js/navlinks.js                 길찾기 URL
  js/app.js                      화면 연결(테스트 없음, 브라우저 확인)
  data/meta.json                 (생성물)
  data/tiles/{latIdx}_{lngIdx}.json   (생성물)
pipeline/
  probe.js                       API 1페이지를 받아 fixture 저장
  fields.js                      mapRecord(raw)
  fetch-toilets.js               fetchAllToilets
  parse-hours.js                 parseHours(text)
  geocode.js                     VWorld 지오코딩 + 캐시
  build.js                       전체 빌드 진입점
  cache/geocode.json             (생성물, 커밋함)
test/
  fixtures/api-page.json         (Task 4에서 실제 응답으로 생성)
  *.test.js
.github/workflows/update.yml
```

**공유 타입** (모든 태스크가 이 이름을 그대로 쓴다)

```js
// Hours
{ type: "24h" } | { type: "range", open: number, close: number } /* 자정부터의 분, 0..1440 */ | { type: "unknown" }

// Toilet (타일 JSON의 원소)
{ id: string, name: string, addr: string, lat: number, lng: number,
  hours: Hours, hoursText: string,
  facilities: { male: number|null, female: number|null, disabled: number|null, child: number|null } }

// 타일 파일: Toilet[]  /  meta.json:
{ updatedAt: "YYYY-MM-DD", tileDeg: 0.05, count: number,
  skipped: { noAddr: number, geocodeFailed: number, geocodePending: number } }
```

---

### Task 0: 사전 준비 (사용자 + 확인)

코드 없음. 다음 태스크의 진행 조건이다.

- [ ] **Step 1:** 사용자에게 다음을 안내하고, 완료됐다는 답을 받는다: GitHub 계정, 공공데이터포털 「공중화장실정보 조회서비스」(15155058) 활용신청 → serviceKey, VWorld(vworld.kr) 오픈API 인증키(지오코더).
- [ ] **Step 2:** VWorld 이용약관과 오픈API 이용 정책에서 지오코딩 결과를 **저장하고 공개 저장소로 재배포**해도 되는지, 그리고 일일 호출 한도를 확인해 사용자에게 보고한다. 허용하지 않으면 **여기서 멈추고** 사용자에게 알린다. 그 경우 도로명주소 위치정보 DB 방식으로 Task 5를 다시 설계한다. 확인한 한도 값은 Task 5의 `GEOCODE_BUDGET` 기본값으로 쓴다(한도의 75%).

---

### Task 1: 프로젝트 골격 + 거리·타일 유틸

**Files:**
- Create: `package.json`, `.gitignore`, `web/js/geo.js`, `web/js/tiles.js`
- Test: `test/geo.test.js`, `test/tiles.test.js`

**Interfaces:**
- Produces:
  - `distanceMeters(a: {lat,lng}, b: {lat,lng}) -> number` (haversine, 지구 반지름 6371000)
  - `walkMinutes(meters: number) -> number` = `Math.max(1, Math.ceil(meters / 67))`
  - `formatDistance(meters: number) -> string`: 1000 미만이면 10m 단위로 반올림해 `"120m"`, 그 이상이면 소수 1자리 `"1.2km"`
  - `TILE_DEG = 0.05`
  - `tileKey(lat, lng) -> string` = `` `${Math.floor(lat/TILE_DEG)}_${Math.floor(lng/TILE_DEG)}` ``
  - `tileKeysAround(lat, lng, ring: number) -> string[]` 중심 타일 기준 (2·ring+1)² 개
  - `loadTiles(keys: string[], fetchJson: (url) => Promise<any>, base = "data/tiles/") -> Promise<Toilet[]>` 404는 빈 배열로 취급하고, 나머지 오류는 throw

- [ ] **Step 1:** `git init`, `.gitignore`(`node_modules/`, `.superpowers/`, `.env`), `package.json`(`{"type":"module","scripts":{"test":"node --test test/"},"engines":{"node":">=20"}}`)
- [ ] **Step 2: 실패하는 테스트 작성**

```js
// test/geo.test.js
import { test } from "node:test"; import assert from "node:assert/strict";
import { distanceMeters, walkMinutes, formatDistance } from "../web/js/geo.js";
test("distance Seoul City Hall -> Gwanghwamun ≈ 1.1km", () => {
  const d = distanceMeters({lat:37.5663,lng:126.9779},{lat:37.5759,lng:126.9768});
  assert.ok(d > 1000 && d < 1150, String(d));
});
test("walkMinutes", () => { assert.equal(walkMinutes(120), 2); assert.equal(walkMinutes(0), 1); assert.equal(walkMinutes(670), 10); });
test("formatDistance", () => { assert.equal(formatDistance(123), "120m"); assert.equal(formatDistance(1234), "1.2km"); });
```

```js
// test/tiles.test.js
import { test } from "node:test"; import assert from "node:assert/strict";
import { tileKey, tileKeysAround, loadTiles } from "../web/js/tiles.js";
test("tileKey", () => { assert.equal(tileKey(37.5663, 126.9779), "751_2539"); });
test("tileKeysAround covers neighbours", () => {
  const keys = tileKeysAround(37.5663, 126.9779, 1);
  assert.equal(keys.length, 9);
  for (const k of ["750_2538","752_2540","751_2539"]) assert.ok(keys.includes(k));
});
test("loadTiles merges and treats 404 as empty", async () => {
  const fetchJson = async (url) => { if (url.endsWith("a.json")) return [{id:"1"}]; const e = new Error("404"); e.status = 404; throw e; };
  assert.deepEqual(await loadTiles(["a","b"], fetchJson), [{id:"1"}]);
});
```

- [ ] **Step 3:** `npm test` 실행 → 모듈이 없어 FAIL
- [ ] **Step 4:** `web/js/geo.js`, `web/js/tiles.js` 구현 (브라우저와 Node 양쪽에서 import 가능한 순수 ESM)
- [ ] **Step 5:** `npm test` → PASS
- [ ] **Step 6:** 커밋 `feat: project scaffold, distance and tile utils`

---

### Task 2: 개방시간 해석 + 열림 판정

**Files:**
- Create: `pipeline/parse-hours.js`, `web/js/hours.js`
- Test: `test/hours.test.js`

**Interfaces:**
- Produces:
  - `parseHours(text: string|null) -> Hours` (pipeline)
  - `openStatus(hours: Hours, now: Date) -> "open"|"closed"|"unknown"` (web)

해석 규칙(1차 목록이다. Task 4의 실제 데이터를 보고 패턴을 추가하되 규칙의 방향은 유지한다):
- 앞뒤 공백을 지운 뒤 `24시간`, `00:00~24:00`, `00:00~23:59`이면 `{type:"24h"}`
- 텍스트 전체가 시각 범위 하나뿐이면 `{type:"range"}`. 형식은 `H:MM` 또는 `HH:MM`, `HH시`(분 0)이고, 구분자는 `~ - ～ 〜`, 공백은 허용한다. `24:00`은 1440이다.
- open == close이면 `unknown`
- 요일·계절·휴무 단어(`평일 주말 토 일 공휴 휴무 동절기 하절기 월 화 수 목 금`)가 있거나, 범위가 둘 이상이거나, 다른 글자가 섞이면 `unknown`
- `상시`, `정시`, `영업시간 내`, 빈칸, null은 `unknown` (spec 그대로)

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// test/hours.test.js
import { test } from "node:test"; import assert from "node:assert/strict";
import { parseHours } from "../pipeline/parse-hours.js";
import { openStatus } from "../web/js/hours.js";
const kst = (h, m = 0) => new Date(Date.UTC(2026, 10, 3, h - 9, m)); // KST h:m
test("parse 24h", () => { for (const t of ["24시간"," 24시간 ","00:00~24:00","00:00~23:59"]) assert.deepEqual(parseHours(t), {type:"24h"}); });
test("parse range variants", () => {
  for (const t of ["09:00~18:00","9:00-18:00","09:00 ～ 18:00","09시~18시"]) assert.deepEqual(parseHours(t), {type:"range",open:540,close:1080});
});
test("ambiguous -> unknown", () => {
  for (const t of ["상시","정시","영업시간 내","", null,"평일 09:00~18:00","09:00~12:00, 13:00~18:00","09:00~09:00"]) assert.equal(parseHours(t).type, "unknown", String(t));
});
test("openStatus range", () => {
  const h = {type:"range",open:540,close:1080};
  assert.equal(openStatus(h, kst(9)), "open"); assert.equal(openStatus(h, kst(17,59)), "open");
  assert.equal(openStatus(h, kst(18)), "closed"); assert.equal(openStatus(h, kst(8,59)), "closed");
});
test("overnight range", () => {
  const h = parseHours("22:00~06:00");
  assert.equal(openStatus(h, kst(2)), "open"); assert.equal(openStatus(h, kst(23)), "open"); assert.equal(openStatus(h, kst(12)), "closed");
});
test("uses KST regardless of host TZ", () => {
  // 2026-11-03 00:30 UTC = 09:30 KST
  assert.equal(openStatus({type:"range",open:540,close:1080}, new Date(Date.UTC(2026,10,3,0,30))), "open");
});
test("24h and unknown", () => { assert.equal(openStatus({type:"24h"}, kst(3)), "open"); assert.equal(openStatus({type:"unknown"}, kst(12)), "unknown"); });
```

- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 두 파일 구현. KST 분 = `(now.getUTCHours()*60 + now.getUTCMinutes() + 540) % 1440`. open < close이면 `open ≤ t < close`, open > close이면 `t ≥ open || t < close`.
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** 커밋 `feat: opening-hours parsing and KST open status`

---

### Task 3: 추천 선택 + 길찾기 링크

**Files:**
- Create: `web/js/pick.js`, `web/js/navlinks.js`
- Test: `test/pick.test.js`, `test/navlinks.test.js`

**Interfaces:**
- Consumes: `distanceMeters`(Task 1), `openStatus`(Task 2)
- Produces:
  - `rankToilets(toilets: Toilet[], me: {lat,lng}, now: Date) -> Ranked[]` 거리 오름차순, `Ranked = Toilet & { distance: number, status }`
  - `pickRecommendation(ranked: Ranked[], nearRadius = 700) -> { toilet: Ranked, warning: boolean } | null`
  - `navLinks(t: {name, lat, lng}) -> { kakao: string, naver: string, google: string }`
  - `NAVER_APPNAME`: 배포 URL의 호스트를 넣는 상수 (Task 8에서 확정, 그 전에는 `"toilet-finder"`)

선택 규칙(spec 6절):
1. 700m 안에 `open`이 있으면 그중 가장 가까운 곳, `warning:false`
2. 없고 700m 안에 `unknown`이 있으면 그중 가장 가까운 곳, `warning:true`
3. 그것도 없으면 반경 제한 없이 `open`/`unknown` 중 가장 가까운 곳, `warning = status==="unknown"`
4. 후보가 없으면 `null`. `closed`는 절대 추천하지 않는다.

링크 형식:
- kakao: `https://map.kakao.com/link/to/${enc(name)},${lat},${lng}`. name의 쉼표는 공백으로 바꾼 뒤 `encodeURIComponent`
- naver: `nmap://route/walk?dlat=${lat}&dlng=${lng}&dname=${enc(name)}&appname=${NAVER_APPNAME}`
- google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// test/pick.test.js
import { test } from "node:test"; import assert from "node:assert/strict";
import { rankToilets, pickRecommendation } from "../web/js/pick.js";
const me = { lat: 37.5663, lng: 126.9779 };
const at = (dLatM) => ({ lat: me.lat + dLatM / 111000, lng: me.lng }); // 북쪽으로 dLatM 미터
const T = (id, m, hours) => ({ id, name: id, addr: "", hoursText: "", facilities: {}, ...at(m), hours });
const noon = new Date(Date.UTC(2026, 10, 3, 3)); // 12:00 KST
const OPEN = { type: "24h" }, UNK = { type: "unknown" }, CLOSED = { type: "range", open: 0, close: 60 };
const pick = (ts) => pickRecommendation(rankToilets(ts, me, noon));
test("nearest open within radius wins over closer unknown", () => {
  const r = pick([T("u", 100, UNK), T("o", 400, OPEN)]);
  assert.equal(r.toilet.id, "o"); assert.equal(r.warning, false);
});
test("no open nearby -> nearest unknown with warning", () => {
  const r = pick([T("c", 50, CLOSED), T("u", 300, UNK), T("o", 2000, OPEN)]);
  assert.equal(r.toilet.id, "u"); assert.equal(r.warning, true);
});
test("nothing within radius -> nearest open/unknown anywhere", () => {
  const r = pick([T("c", 50, CLOSED), T("o", 3000, OPEN), T("u", 5000, UNK)]);
  assert.equal(r.toilet.id, "o"); assert.equal(r.warning, false);
});
test("never recommends closed; null when none", () => { assert.equal(pick([T("c", 10, CLOSED)]), null); assert.equal(pick([]), null); });
test("picks toilet from adjacent tile", () => {
  // 타일 경계(lat 37.55) 바로 위에 있는 사용자, 경계 아래쪽 80m에 화장실
  const r = pickRecommendation(rankToilets([{ ...T("x", 0, OPEN), lat: 37.5493, lng: 126.9779 }], { lat: 37.5501, lng: 126.9779 }, noon));
  assert.equal(r.toilet.id, "x");
});
```

```js
// test/navlinks.test.js
import { test } from "node:test"; import assert from "node:assert/strict";
import { navLinks } from "../web/js/navlinks.js";
test("nav links", () => {
  const l = navLinks({ name: "○○공원, 화장실", lat: 37.1, lng: 127.2 });
  assert.equal(l.kakao, "https://map.kakao.com/link/to/" + encodeURIComponent("○○공원  화장실") + ",37.1,127.2");
  assert.ok(l.naver.startsWith("nmap://route/walk?dlat=37.1&dlng=127.2&dname="));
  assert.equal(l.google, "https://www.google.com/maps/dir/?api=1&destination=37.1,127.2&travelmode=walking");
});
```

- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** 커밋 `feat: recommendation rule and navigation links`

---

### Task 4: API 확인 + 레코드 매핑 + 전체 수집

`SERVICE_KEY`가 필요하다(Task 0). 키는 셸 환경변수로만 넘긴다.

**Files:**
- Create: `pipeline/probe.js`, `pipeline/fields.js`, `pipeline/fetch-toilets.js`, `test/fixtures/api-page.json`
- Test: `test/fetch.test.js`

**Interfaces:**
- Produces:
  - `mapRecord(raw: object) -> { id, name, addr, hoursText, facilities } | null` (주소가 비면 `null`)
  - `fetchAllToilets({ serviceKey, fetchFn = fetch, numOfRows = 100 }) -> Promise<object[]>` 원본 레코드 배열. HTTP 오류, API 오류 코드, 파싱 실패가 나면 throw. 재시도는 페이지당 3회, 간격 2초.

- [ ] **Step 1:** `pipeline/probe.js` 작성 후 실행: `SERVICE_KEY=... node pipeline/probe.js`. 하는 일은 다음과 같다. (a) data.go.kr 상세 페이지의 "조회" 오퍼레이션 경로를 확인한다(기본 URL 뒤에 붙는 경로. 없으면 기본 URL 그대로). (b) `pageNo=1&numOfRows=5&returnType=json`을 요청한다. (c) 응답 전체에서 serviceKey를 지우고 `test/fixtures/api-page.json`에 저장한다. (d) 아이템 배열 경로, totalCount 경로, 결과 코드 경로, 필드 이름을 출력한다. 출력 결과를 이 계획의 아래 표에 기록한다.

  | 의미 | 응답 필드명 |
  |---|---|
  | 고유 ID | (probe 결과. 없으면 `name|addr`의 sha1 앞 12자) |
  | 화장실명 / 도로명주소 / 개방시간 | |
  | 남·여·장애인·어린이용 시설 수 | (대변기 기준. 남자 장애인·여자 장애인처럼 나뉘어 있으면 합산) |
  | 아이템 배열 / totalCount / 결과코드 | |

- [ ] **Step 2:** 전국 대략 건수(totalCount)와 개방시간 값 상위 50개 빈도를 출력하는 일회성 확인을 한다(`probe.js --hours`, 최대 1,000건 샘플). Task 2의 해석 규칙이 놓치는 흔한 패턴이 있으면 Task 2에 테스트와 패턴을 추가하고 따로 커밋한다. 애매한 것은 계속 `unknown`으로 둔다.
- [ ] **Step 3: 실패하는 테스트 작성** (fixture 기반. 기대값은 fixture의 첫 아이템에서 그대로 옮긴다)

```js
// test/fetch.test.js
import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs";
import { mapRecord } from "../pipeline/fields.js";
import { fetchAllToilets } from "../pipeline/fetch-toilets.js";
const page = JSON.parse(fs.readFileSync(new URL("./fixtures/api-page.json", import.meta.url)));
test("mapRecord maps first fixture item", () => {
  const r = mapRecord(/* fixture의 첫 아이템 경로 */);
  assert.equal(typeof r.name, "string"); assert.ok(r.addr.length > 0); assert.ok("hoursText" in r);
  // + fixture 첫 아이템의 실제 name/addr 값을 assert.equal로 고정
});
test("mapRecord returns null for blank address", () => { /* 주소 필드를 ""로 바꾼 사본 → null */ });
test("fetchAll pages until totalCount", async () => {
  // fake fetchFn: totalCount=250, 페이지마다 100/100/50건 → 결과 250건, 호출 3번, URL에 pageNo=1..3 & numOfRows=100
});
test("fetchAll throws after 3 failed attempts", async () => {
  // fake fetchFn: 2페이지에서 계속 500 → reject
});
```

- [ ] **Step 4:** `npm test` → FAIL
- [ ] **Step 5:** `fields.js`, `fetch-toilets.js` 구현. 요청 URL은 `serviceKey`를 `encodeURIComponent` 해서 붙인다(Decoding 키 기준).
- [ ] **Step 6:** `npm test` → PASS. fixture에 키가 없는지 `grep -r "$SERVICE_KEY" test/`로 확인한다(출력이 없어야 한다).
- [ ] **Step 7:** 커밋 `feat: fetch and map public restroom API records`

---

### Task 5: VWorld 지오코딩 + 캐시 + 한도

**Files:**
- Create: `pipeline/geocode.js`
- Test: `test/geocode.test.js`

**Interfaces:**
- Produces:
  - `vworldGeocode(addr, key, fetchFn) -> Promise<[lat, lng] | null>`. 요청은 `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&type=road&format=json&key=${key}&address=${enc(addr)}`. `response.status==="OK"`이면 `[Number(result.point.y), Number(result.point.x)]`, `"NOT_FOUND"`이면 `null`, `"ERROR"`나 HTTP 오류는 throw. 형식은 Task 0에서 문서로 확인한다. 다르면 이 줄을 고치고 사용자에게 알린다.
  - 캐시 타입: `{ [addr]: { lat, lng } | { failedAt: "YYYY-MM-DD" } }`
  - `geocodeAll(addrs: string[], cache, { key, fetchFn, budget, today }) -> Promise<{ cache, stats: { hit, newOk, newFailed, pending } }>`. 캐시에 좌표가 있으면 호출하지 않는다. `failedAt`이 30일이 안 됐으면 건너뛰고, 30일이 지났으면 다시 시도한다. 호출 수가 `budget`에 닿으면 남은 주소는 `pending`으로 세고 멈춘다. throw가 나면 그 주소는 `pending`으로 두고 계속하되, 연속 20회 throw면 멈춘다. 주소는 중복을 제거해서 처리한다.
  - `GEOCODE_BUDGET` 기본값 = Task 0에서 확인한 일일 한도의 75% (환경변수로 덮어쓸 수 있다)

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// test/geocode.test.js — fake fetchFn은 VWorld 응답 모양 {response:{status,result:{point:{x,y}}}}을 돌려준다
test("uses cache, calls only new addresses", ...)          // 캐시 A, 신규 B → 호출 1번, stats.hit=1, newOk=1
test("NOT_FOUND stored as failedAt, skipped within 30 days", ...)
test("retries failed after 30 days", ...)
test("stops at budget and keeps partial cache", ...)       // 주소 5개, budget 2 → 호출 2번, pending 3, cache에 2개
test("dedupes addresses", ...)                             // ["A","A"] → 호출 1번
test("stops after 20 consecutive errors", ...)
```

- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 구현. 호출 사이에 간격 50ms를 둔다(설정 가능, 테스트에서는 0).
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** 실제 키로 주소 3개를 수동 확인한다: `VWORLD_KEY=... node -e "import('./pipeline/geocode.js').then(m=>m.vworldGeocode('서울특별시 중구 세종대로 110', process.env.VWORLD_KEY, fetch)).then(console.log)"` → `[37.56…, 126.97…]`
- [ ] **Step 6:** 커밋 `feat: VWorld geocoding with cache and daily budget`

---

### Task 6: 빌드 진입점 (타일 + meta 생성)

**Files:**
- Create: `pipeline/build.js`
- Test: `test/build.test.js`

**Interfaces:**
- Consumes: `fetchAllToilets`, `mapRecord`, `parseHours`, `geocodeAll`, `tileKey`
- Produces:
  - `build({ fetchToilets, geocode, outDir, cachePath, today }) -> Promise<Meta>`. 의존성을 주입받으므로 테스트에서는 가짜 함수를 쓴다.
  - CLI: `node pipeline/build.js`. 환경변수 `SERVICE_KEY`, `VWORLD_KEY`, 선택 `GEOCODE_BUDGET`을 쓰고, 출력은 `web/data`, 캐시는 `pipeline/cache/geocode.json`

동작:
1. 수집 → `mapRecord` → `null`(주소 없음)은 `skipped.noAddr`로 센다
2. 지오코딩 → 좌표가 없는 레코드는 제외한다(`geocodeFailed`, `geocodePending` 집계)
3. `Toilet`으로 만든다(`hours = parseHours(hoursText)`) → 타일별로 묶는다
4. 임시 디렉터리 `outDir + ".tmp"`에 `tiles/*.json`, `meta.json`을 쓴 뒤 기존 `outDir/tiles`와 `meta.json`을 통째로 바꾼다(없어진 타일 파일도 사라지게)
5. 캐시는 지오코딩이 끝난 직후 항상 저장한다(수집이 성공했을 때만)
6. 수집 단계에서 throw가 나면 **아무것도 쓰지 않고** throw. CLI는 종료 코드 1

- [ ] **Step 1: 실패하는 테스트 작성** (`os.tmpdir()` 아래 임시 폴더 사용)

```js
test("writes tiles and meta", ...)        // 레코드 3개(서로 다른 타일 2개) → tiles 파일 2개, meta.count=3, tileDeg=0.05, updatedAt=today
test("excludes no-address and ungeocoded, counts them", ...)  // skipped 값 확인
test("removes stale tiles from previous run", ...)            // 기존 outDir/tiles/999_999.json 이 사라짐
test("aborts without writing on fetch failure", ...)          // fetchToilets reject → 기존 meta.json·타일 그대로, 캐시 파일도 그대로, build reject
```

- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** 실제 실행을 작은 규모로 확인: `GEOCODE_BUDGET=200 node pipeline/build.js` → `web/data/meta.json`의 count > 0, 타일 파일이 생겼는지 확인. 타일 하나의 용량과 전체 예상 용량을 보고해 첫 화면 목표(타일 9개)에 무리가 없는지 판단한다. 9개 합계가 1MB를 넘을 것 같으면 사용자에게 알리고 `TILE_DEG`를 0.02로 줄이는 방안을 제시한다.
- [ ] **Step 6:** 커밋 `feat: build pipeline writing tiled data atomically` (생성된 `web/data`와 캐시도 커밋)

---

### Task 7: 화면 (B안)

**Files:**
- Create: `web/index.html`, `web/css/style.css`, `web/js/app.js`
- 참고 시안: `.superpowers/brainstorm/831-1793715393/content/first-screen.html`의 B

**Interfaces:**
- Consumes: Task 1·2·3의 web 모듈 전부, `data/meta.json`, `data/tiles/*.json`

동작(spec 6절):
- 화면 전체를 지도로 채운다(Leaflet, OSM 타일, 출처 표기). 하단 카드(바텀시트)는 상태 뱃지, 이름, `formatDistance · 도보 약 N분`, 도로명주소, 개방시간 원문, 시설 수(작게), 길찾기 버튼 3개(카카오 노랑 / 네이버 초록 / 구글 파랑)로 구성한다.
- 시작하면 `navigator.geolocation.getCurrentPosition`(enableHighAccuracy, timeout 10s)를 호출하고, 동시에 `meta.json`을 받는다.
- 위치를 얻으면 `tileKeysAround(ring=1)` → `loadTiles` → `rankToilets` → `pickRecommendation`. 결과가 `null`이면 ring=2로 한 번 더 시도한다. 그래도 없으면 카드에 "주변에서 화장실을 찾지 못했어요"를 표시한다.
- 핀 색: 추천은 빨강(크게), `open`은 초록, `unknown`은 노랑, `closed`는 회색. 내 위치는 파란 점이다. 핀을 누르면 카드가 그 화장실로 바뀌고, 이때 경고는 그 화장실이 `unknown`일 때만 보인다.
- `warning:true`이면 카드 상단에 `열려 있는지 확인되지 않았어요. 개방시간: {hoursText}`를 표시한다.
- 위치를 거부하거나 실패하면 카드에 `위치 권한이 필요해요`와 [다시 시도] 버튼을 띄우고, 지도는 서울시청 중심으로 둔다(조작 가능).
- 네이버 버튼: `nmap://` 링크로 이동하고, 1.5초 뒤에도 페이지가 보이면(`document.visibilityState==="visible"`) `https://map.naver.com/p/search/${enc(addr)}`로 이동한다.
- 하단 작은 글씨: `데이터: 행정안전부 · 갱신 {meta.updatedAt}`
- 개발 확인용 쿼리 `?at=lat,lng`가 있으면 그 좌표를 내 위치로 쓴다.
- 첫 표시가 늦어지지 않도록 타일을 다 받은 뒤 한 번에 렌더한다. 로딩 중에는 카드에 "가까운 화장실을 찾는 중…"을 표시한다.

- [ ] **Step 1:** 세 파일 구현
- [ ] **Step 2:** 로컬 서버를 띄운다(`npx --yes http-server web -p 8080` 또는 `python -m http.server -d web 8080`). 브라우저 패널에서 모바일 뷰포트(375×812)로 `http://localhost:8080/?at=<Task 6에서 생성된 타일 안의 좌표>`를 연다. 확인할 것: 카드가 뜬다, 추천 핀이 빨강이다, 다른 핀을 누르면 카드가 바뀐다, 세 길찾기 링크의 href가 Task 3 형식과 맞다, 콘솔 오류가 없다.
- [ ] **Step 3:** `?at=` 없이 열고 위치를 거부한 상황에서 `위치 권한이 필요해요` 카드가 뜨는지 확인한다.
- [ ] **Step 4:** 데스크톱 폭(1280)에서도 레이아웃이 깨지지 않는지 스크린샷으로 확인한다.
- [ ] **Step 5:** 커밋 `feat: map page with bottom card (layout B)`

---

### Task 8: 자동 갱신 + 배포 + 안내

**Files:**
- Create: `.github/workflows/update.yml`, `README.md`
- Modify: `web/js/navlinks.js` (`NAVER_APPNAME` = 배포 호스트)

**Interfaces:**
- Consumes: `npm test`, `node pipeline/build.js`

워크플로:
- `on: schedule: - cron: "0 18 * * 0"`(월요일 03:00 KST)와 `workflow_dispatch`, 그리고 `push`(main, `web/**` 변경 시. 배포만 하고 빌드는 건너뜀)
- `permissions: contents: write, pages: write, id-token: write`
- job `update`(schedule/dispatch일 때만): checkout → setup-node 20 → `npm test` → `node pipeline/build.js`(env는 Secrets) → `web/data`와 `pipeline/cache`에 변경이 있으면 `github-actions[bot]`으로 커밋하고 push
- job `deploy`(update 이후, 또는 push일 때): checkout(최신 main) → `actions/upload-pages-artifact`(path: `web`) → `actions/deploy-pages`
- 빌드가 실패하면 커밋하지 않고 배포도 하지 않는다(기존 사이트 유지)

- [ ] **Step 1:** `update.yml`, `README.md` 작성. README에는 사용자 작업을 단계별로 적는다: 저장소 생성/푸시, Secrets `SERVICE_KEY`·`VWORLD_KEY` 등록, Settings → Pages → Source "GitHub Actions", Actions 탭에서 수동 실행. 처음 전국 지오코딩이 한도를 넘으면 며칠 동안 하루 한 번 수동 실행한다는 안내도 넣는다.
- [ ] **Step 2:** 사용자와 함께 원격 저장소를 연결하고 push한다(사용자 확인 후). Secrets 등록과 Pages 설정은 사용자가 직접 한다.
- [ ] **Step 3:** Actions에서 `workflow_dispatch`로 실행 → 두 job 모두 성공하는지 확인한다(`gh run watch` 또는 사용자 확인). 배포 URL을 받는다.
- [ ] **Step 4:** 배포 URL로 `NAVER_APPNAME`을 확정하고 커밋·push한다 → 재배포된다.
- [ ] **Step 5:** 배포 URL을 브라우저 패널에서 `?at=37.5663,126.9779`로 열어 카드가 뜨는지 확인한다. 사용자에게 실제 휴대폰으로 열어 위치 허용 → 카드 → 세 길찾기 버튼이 앱/웹으로 넘어가는지 확인을 부탁한다.
- [ ] **Step 6:** 커밋 `ci: weekly data update and Pages deploy`

---

## Revision 1 (2026-11-03)

### Task 2b: 개방시간 구분값 + 세부 시간 해석 확장

**Files:** Modify `pipeline/parse-hours.js`, Test `test/hours.test.js`

**Interfaces:**
- Produces: `hoursFromRecord(category: string, detail: string) -> Hours | null`. `null`이면 `미개방`이고, Task 6에서 제외한다.
  - `상시` → `{type:"24h"}`
  - `정시` → `parseHours(detail)`
  - `미개방` → `null`
  - 그 밖의 값이나 빈칸 → `{type:"unknown"}`. 공백은 지우고 비교한다.
- `parseHours` 확장
  - 종료 시각이 24시를 넘으면(`25:00`, 최대 `30:00`) 1440을 빼서 자정을 넘기는 범위로 본다. `05:00~25:00` → `{open:300, close:60}`
  - 시와 분 구분자로 `;`도 허용한다(`18;00`).
  - `(평일)`이나 휴관 문구처럼 요일 조건이 붙으면 지금처럼 unknown으로 둔다.

테스트 (기존 파일에 추가):
```js
import { hoursFromRecord } from "../pipeline/parse-hours.js";
test("category 상시 -> 24h", () => { assert.deepEqual(hoursFromRecord("상시", ""), {type:"24h"}); assert.deepEqual(hoursFromRecord(" 상시 ", "상시"), {type:"24h"}); });
test("category 정시 parses detail", () => { assert.deepEqual(hoursFromRecord("정시", "09:00~18:00"), {type:"range",open:540,close:1080}); assert.equal(hoursFromRecord("정시", "근무시간 내").type, "unknown"); });
test("category 미개방 -> null", () => { assert.equal(hoursFromRecord("미개방", "0"), null); });
test("other category -> unknown", () => { assert.equal(hoursFromRecord("", "").type, "unknown"); assert.equal(hoursFromRecord("기타", "").type, "unknown"); });
test("past-midnight end hour", () => { assert.deepEqual(parseHours("05:00~25:00"), {type:"range",open:300,close:60}); assert.equal(parseHours("05:00~31:00").type, "unknown"); });
test("semicolon typo", () => { assert.deepEqual(parseHours("09:00~18;00"), {type:"range",open:540,close:1080}); });
```

### Task 4 (변경): 필드 매핑 확정

Task 4 Step 1의 확인은 끝났다. 결과는 다음과 같다.

| 의미 | 응답 필드명 |
|---|---|
| 고유 ID | `MNG_NO` |
| 화장실명 / 도로명주소 / 지번주소 | `RSTRM_NM` / `LCTN_ROAD_NM_ADDR` / `LCTN_LOTNO_ADDR` |
| 개방시간 구분 / 상세 | `OPN_HR` / `OPN_HR_DTL` |
| 남 / 여 | `MALE_TOILT_CNT`+`MALE_URNL_CNT` / `FEMALE_TOILT_CNT` |
| 장애인 | `MALE_FRDBL_TOILT_CNT`+`MALE_FRDBL_URNL_CNT`+`FEMALE_FRDBL_TOILT_CNT` |
| 어린이 | `MALE_CHLD_TOILT_CNT`+`MALE_CHLD_URNL_CNT`+`FEMALE_CHLD_TOILT_CNT` |
| 아이템 배열 / totalCount / 결과코드 | `response.body.items.item` / `response.body.totalCount` / `response.header.resultCode`(`"0"`이면 정상) |

- `mapRecord(raw) -> { id, name, addr, hoursCategory, hoursDetail, facilities } | null`
  - `addr`는 도로명주소에서 끝의 `(…)`를 뺀 값이다. 도로명주소가 비어 있으면 지번주소를 쓰고, 둘 다 비어 있으면 `null`을 돌려준다.
  - 각 시설 수는 위 필드의 합이다. 숫자가 아닌 값은 0으로 치고, 모든 필드가 빈 값이면 `null`이다.
- 데이터 목록이 아닌 오류 응답(`OpenAPI_ServiceResponse`나 `resultCode !== "0"`)은 throw한다.
- Task 6에서 `hoursText`는 `hoursDetail || hoursCategory`이다.

### Task 5 (변경): 도로명주소 API 지오코딩

**Files:** Create `pipeline/utmk.js`, `pipeline/geocode.js`; Test `test/utmk.test.js`, `test/geocode.test.js`

**Interfaces:**
- `utmkToWgs84(x, y) -> { lat, lng }`, `wgs84ToUtmk(lat, lng) -> { x, y }`
  - EPSG:5179 기준이다. GRS80(a=6378137, f=1/298.257222101), 원점 위도 38°, 중앙 경선 127.5°, k0=0.9996, FE=1,000,000, FN=2,000,000. 횡메르카토르 정·역변환 급수(Snyder)를 쓴다.
- `jusoGeocode(addr, { searchKey, coordKey }, fetchFn) -> Promise<[lat, lng] | null>`
  1. `https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=…&currentPage=1&countPerPage=1&keyword=${enc(addr)}&resultType=json`
     - `results.common.errorCode !== "0"`이면 throw한다.
     - `results.juso`가 비어 있으면 `null`을 돌려준다.
  2. 첫 결과의 `admCd, rnMgtSn, udrtYn, buldMnnm, buldSlno`로 `https://business.juso.go.kr/addrlink/addrCoordApi.do?confmKey=…&admCd=…&rnMgtSn=…&udrtYn=…&buldMnnm=…&buldSlno=…&resultType=json`를 호출한다.
     - 응답의 `entX, entY`를 `utmkToWgs84`로 바꾼다.
     - 좌표가 비어 있으면 `null`이다.
  - 형식은 키를 발급받은 뒤 실제 응답으로 확인한다. 다르면 이 줄을 고치고 ledger에 Ruling을 남긴다.
- `geocodeAll(addrs, cache, { geocodeOne, budget, today, delayMs = 50 }) -> Promise<{ cache, stats }>`. 원래 Task 5 동작과 같고, 지오코더만 `geocodeOne(addr)`으로 주입받는다. `budget`은 주소 수 기준이다.
- `GEOCODE_BUDGET` 기본값은 20000 주소다. 한도를 확인하면 바꾼다.

테스트:
```js
// test/utmk.test.js
test("origin maps to false easting/northing", () => { const p = wgs84ToUtmk(38, 127.5); assert.ok(Math.abs(p.x - 1000000) < 0.01 && Math.abs(p.y - 2000000) < 0.01); });
test("round trip within 1cm across Korea", () => { for (const [lat,lng] of [[37.5663,126.9779],[35.1796,129.0756],[33.4996,126.5312],[38.2,128.6]]) { const p = wgs84ToUtmk(lat,lng); const q = utmkToWgs84(p.x,p.y); assert.ok(Math.abs(q.lat-lat)<1e-7 && Math.abs(q.lng-lng)<1e-7); } });
test("Seoul is roughly 953km E / 1952km N", () => { const p = wgs84ToUtmk(37.5663, 126.9779); assert.ok(Math.abs(p.x-953900)<2000 && Math.abs(p.y-1952000)<2000, JSON.stringify(p)); });
```
`test/geocode.test.js`: 원래 Task 5의 여섯 테스트에 `geocodeOne`을 가짜로 주입한다. 여기에 `jusoGeocode` 테스트를 더한다. 가짜 fetch로 검색 응답 → 좌표 응답을 이어 받아 WGS84를 돌려주는지, 검색 결과가 0건이면 null인지, errorCode가 "E0001"이면 throw하는지 확인한다.

### Task 6/8 영향
- Task 6 `build`에서 `hoursFromRecord`가 `null`인 레코드는 제외하고 `skipped.notOpen`으로 센다.
- Task 8 Secrets는 `SERVICE_KEY`, `JUSO_SEARCH_KEY`, `JUSO_COORD_KEY` 세 개다.
