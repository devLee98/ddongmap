import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "data/processed/toilets-all-success.json");
const outputPath = path.join(root, "data/processed/toilets-runtime.json");
const temporaryPath = `${outputPath}.tmp`;

const source = JSON.parse(await readFile(sourcePath, "utf8"));
if (!Array.isArray(source.items)) throw new Error("전국 화장실 성공 데이터의 items가 올바르지 않습니다.");

// 좌표 변환 이력과 중복 주소는 배포 함수에서 사용하지 않으므로 필요한 필드만 별도 파일로 만든다.
const items = source.items.map((item) => ({
  id: item.id,
  name: item.name,
  address: item.roadAddress || item.jibunAddress || "",
  lat: item.lat,
  lng: item.lng,
  maleToiletCount: item.maleToiletCount ?? null,
  maleUrinalCount: item.maleUrinalCount ?? null,
  femaleToiletCount: item.femaleToiletCount ?? null,
}));

await writeFile(temporaryPath, JSON.stringify({ items }), "utf8");
await rename(temporaryPath, outputPath);
console.log(`런타임 화장실 데이터 ${items.length}건 생성 완료`);
