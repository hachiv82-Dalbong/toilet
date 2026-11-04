# 가까운 화장실

휴대폰으로 열면 **지금 열려 있는 가장 가까운 공중화장실**을 지도와 카드로 보여 주는 웹페이지예요.
데이터는 행정안전부 공중화장실정보 API로 매주 자동 갱신하고, 주소는 행정안전부 도로명주소 API로 좌표로 바꿔요.

- 설계: [docs/superpowers/specs/2026-11-03-nearby-toilet-finder-design.md](docs/superpowers/specs/2026-11-03-nearby-toilet-finder-design.md)
- 구현 계획: [docs/superpowers/plans/2026-11-03-nearby-toilet-finder.md](docs/superpowers/plans/2026-11-03-nearby-toilet-finder.md)

## 처음 설정하기

1. **API 키 준비**
   - 공공데이터포털: 「행정안전부_공중화장실정보 조회서비스」 활용신청 → 일반 인증키 (`SERVICE_KEY`)
   - [도로명주소 개발자센터](https://business.juso.go.kr): **검색 API** 승인키 (`JUSO_SEARCH_KEY`), **좌표제공 API** 승인키 (`JUSO_COORD_KEY`)
2. **GitHub 저장소** (공개 저장소)를 만들고 이 폴더를 `main` 브랜치로 push해요.
3. 저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 위 키 3개를 같은 이름으로 등록해요.
4. **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해요.
5. **Actions** 탭 → `update-and-deploy` → **Run workflow**를 눌러 처음 데이터를 만들어요.
   끝나면 `https://<계정>.github.io/<저장소>/` 주소로 열 수 있어요.

처음에는 전국 약 5만 개 주소를 좌표로 바꿔야 해요. 하루 한도(`GEOCODE_BUDGET`, 기본 20,000개)를 넘는 주소는 다음 실행 때 이어서 채워요. 처음 며칠은 하루에 한 번씩 **Run workflow**를 눌러 주면 빨리 채워져요.

## 로컬에서 실행하기

```bash
npm test
```

```bash
python -m http.server 8080 -d web
```

`http://localhost:8080/?at=37.5663,126.9779`처럼 `?at=위도,경도`를 붙이면 그 위치를 내 위치로 써요(개발 확인용).

데이터를 직접 만들려면 키를 `.env`에 넣고 실행해요. `.env`는 git에 올라가지 않아요.

```bash
set -a; . ./.env; set +a; GEOCODE_BUDGET=200 node pipeline/build.js
```

## 데이터 출처

- 행정안전부 공중화장실정보 조회서비스 (공공데이터포털)
- 행정안전부 도로명주소 API (business.juso.go.kr)
- 지도: NAVER Maps (Dynamic Map). Client ID는 페이지 소스에 공개되는 값이고, 네이버 클라우드에 등록한 URL에서만 작동해요.
