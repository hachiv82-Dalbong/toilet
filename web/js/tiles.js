export const TILE_DEG = 0.05;

const idx = (deg) => Math.floor(deg / TILE_DEG);

export function tileKey(lat, lng) {
  return `${idx(lat)}_${idx(lng)}`;
}

export function tileKeysAround(lat, lng, ring) {
  const keys = [];
  for (let dy = -ring; dy <= ring; dy++) {
    for (let dx = -ring; dx <= ring; dx++) keys.push(`${idx(lat) + dy}_${idx(lng) + dx}`);
  }
  return keys;
}

// fetchJson은 실패 시 error.status를 담아 throw해야 한다. 404는 "그 칸에 화장실 없음"으로 본다.
export async function loadTiles(keys, fetchJson, base = "data/tiles/") {
  const tiles = await Promise.all(
    keys.map((k) =>
      fetchJson(`${base}${k}.json`).catch((e) => {
        if (e.status === 404) return [];
        throw e;
      })
    )
  );
  return tiles.flat();
}
