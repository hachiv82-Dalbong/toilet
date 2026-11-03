// 전체 빌드: API 수집 → 매핑 → 지오코딩(캐시) → 타일 JSON + meta.json
//   node pipeline/build.js   (env: SERVICE_KEY, JUSO_SEARCH_KEY, JUSO_COORD_KEY, 선택 GEOCODE_BUDGET)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchAllToilets } from "./fetch-toilets.js";
import { mapRecord } from "./fields.js";
import { hoursFromRecord } from "./parse-hours.js";
import { geocodeAll, jusoGeocode } from "./geocode.js";
import { TILE_DEG, tileKey } from "../web/js/tiles.js";

const round6 = (n) => Math.round(n * 1e6) / 1e6;
const readJsonOr = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback);

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data));
}

// 새 결과를 임시 폴더에 다 쓴 뒤 기존 tiles/ 와 meta.json 을 통째로 바꾼다.
function replaceOutput(outDir, tiles, meta) {
  const tmp = `${outDir}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, "tiles"), { recursive: true });
  for (const [key, list] of tiles) writeJson(path.join(tmp, "tiles", `${key}.json`), list);
  writeJson(path.join(tmp, "meta.json"), meta);

  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(path.join(outDir, "tiles"), { recursive: true, force: true });
  fs.renameSync(path.join(tmp, "tiles"), path.join(outDir, "tiles"));
  fs.renameSync(path.join(tmp, "meta.json"), path.join(outDir, "meta.json"));
  fs.rmSync(tmp, { recursive: true, force: true });
}

export async function build({ fetchToilets, geocode, outDir, cachePath, today }) {
  const raws = await fetchToilets();
  const skipped = { noAddr: 0, notOpen: 0, geocodeFailed: 0, geocodePending: 0 };

  const byId = new Map();
  for (const raw of raws) {
    const rec = mapRecord(raw);
    if (!rec) {
      skipped.noAddr++;
      continue;
    }
    const hours = hoursFromRecord(rec.hoursCategory, rec.hoursDetail);
    if (!hours) {
      skipped.notOpen++;
      continue;
    }
    byId.set(rec.id, { ...rec, hours });
  }
  const records = [...byId.values()];

  // 지오코딩은 몇 시간 걸릴 수 있으므로 중간에 죽어도 그때까지의 결과는 남게 saveCache로 수시로 저장한다
  const saveCache = (c) => writeJson(cachePath, c);
  const { cache } = await geocode(
    records.map((r) => r.addr),
    readJsonOr(cachePath, {}),
    saveCache
  );
  saveCache(cache);

  const tiles = new Map();
  let count = 0;
  for (const r of records) {
    const c = cache[r.addr];
    if (!c) {
      skipped.geocodePending++;
      continue;
    }
    if (!("lat" in c)) {
      skipped.geocodeFailed++;
      continue;
    }
    const toilet = {
      id: r.id,
      name: r.name,
      addr: r.addr,
      lat: round6(c.lat),
      lng: round6(c.lng),
      hours: r.hours,
      hoursText: r.hoursDetail || r.hoursCategory,
      facilities: r.facilities,
    };
    const key = tileKey(toilet.lat, toilet.lng);
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key).push(toilet);
    count++;
  }

  const meta = { updatedAt: today, tileDeg: TILE_DEG, count, skipped };
  replaceOutput(outDir, tiles, meta);
  return meta;
}

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const serviceKey = requireEnv("SERVICE_KEY");
  const keys = { searchKey: requireEnv("JUSO_SEARCH_KEY"), coordKey: requireEnv("JUSO_COORD_KEY") };
  const budget = Number(process.env.GEOCODE_BUDGET ?? 20000);
  // Actions 작업 제한(300분) 안에 타일 생성과 커밋까지 끝나도록 지오코딩은 시작 후 4시간에서 끊는다
  const deadline = Date.now() + Number(process.env.GEOCODE_MAX_MINUTES ?? 240) * 60000;
  const today = kstToday();
  try {
    const meta = await build({
      fetchToilets: () => fetchAllToilets({ serviceKey }),
      geocode: async (addrs, cache, saveCache) => {
        const result = await geocodeAll(addrs, cache, {
          geocodeOne: (a) => jusoGeocode(a, keys),
          budget,
          today,
          deadline,
          checkpointEvery: 500,
          onCheckpoint: saveCache,
        });
        console.log("geocode", JSON.stringify(result.stats));
        return result;
      },
      outDir: path.join(root, "web", "data"),
      cachePath: path.join(root, "pipeline", "cache", "geocode.json"),
      today,
    });
    console.log("meta", JSON.stringify(meta));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
