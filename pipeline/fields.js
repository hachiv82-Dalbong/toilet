// 행정안전부 공중화장실정보 API(info_v2) 응답 레코드 → 파이프라인 내부 레코드

const FACILITY_FIELDS = {
  male: ["MALE_TOILT_CNT", "MALE_URNL_CNT"],
  female: ["FEMALE_TOILT_CNT"],
  disabled: ["MALE_FRDBL_TOILT_CNT", "MALE_FRDBL_URNL_CNT", "FEMALE_FRDBL_TOILT_CNT"],
  child: ["MALE_CHLD_TOILT_CNT", "MALE_CHLD_URNL_CNT", "FEMALE_CHLD_TOILT_CNT"],
};

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function sumCounts(raw, fields) {
  const values = fields.map((f) => clean(raw[f])).filter((v) => v !== "");
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + (Number.isFinite(Number(v)) ? Number(v) : 0), 0);
}

export function mapRecord(raw) {
  const road = clean(raw.LCTN_ROAD_NM_ADDR).replace(/\s*\([^()]*\)$/, "");
  const addr = road || clean(raw.LCTN_LOTNO_ADDR);
  if (!addr) return null;
  return {
    id: clean(raw.MNG_NO),
    name: clean(raw.RSTRM_NM),
    addr,
    hoursCategory: clean(raw.OPN_HR),
    hoursDetail: clean(raw.OPN_HR_DTL),
    facilities: Object.fromEntries(Object.entries(FACILITY_FIELDS).map(([k, fields]) => [k, sumCounts(raw, fields)])),
  };
}
