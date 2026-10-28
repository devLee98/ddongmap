import type { Toilet } from "@/types/toilet";

export const FACILITY_STYLES = {
  both: { label: "남녀 이용", icon: "/icons/toilet.svg", color: "#0f766e" },
  male: { label: "남성용", icon: "/icons/toilet-male.svg", color: "#2563eb" },
  female: { label: "여성용", icon: "/icons/toilet-female.svg", color: "#db2777" },
  none: { label: "일반 시설 없음", icon: "/icons/toilet-unknown.svg", color: "#64748b" },
  unknown: { label: "시설 정보 확인 필요", icon: "/icons/toilet-unknown.svg", color: "#64748b" },
} as const;

export function getFacilityStyle(toilet: Pick<Toilet, "maleToiletCount" | "maleUrinalCount" | "femaleToiletCount">) {
  const valid = (count: number | null) => count !== null && Number.isInteger(count) && count >= 0;
  const male = (toilet.maleToiletCount ?? 0) > 0 || (toilet.maleUrinalCount ?? 0) > 0;
  const female = (toilet.femaleToiletCount ?? 0) > 0;
  // 남성은 대변기 또는 소변기가 있으면 이용 대상으로 판별하고, 특수 시설은 합산하지 않는다.
  if (male && female) return FACILITY_STYLES.both;
  // 정보가 비어 있으면 특정 성별 전용이라고 단정하지 않는다.
  const maleKnown = male || (valid(toilet.maleToiletCount) && valid(toilet.maleUrinalCount));
  const femaleKnown = valid(toilet.femaleToiletCount);
  if (!maleKnown || !femaleKnown) return FACILITY_STYLES.unknown;
  if (male) return FACILITY_STYLES.male;
  if (female) return FACILITY_STYLES.female;
  return FACILITY_STYLES.none;
}
