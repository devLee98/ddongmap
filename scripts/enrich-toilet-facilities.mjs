import { readFile, writeFile, rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { parseCsv, getGeneralFacilityCounts } from "./lib/toilet-csv.mjs";

const keyOf = (item) => JSON.stringify([item.id, item.name, item.roadAddress, item.jibunAddress]);

async function main() {
  const bytes = await readFile("data/raw/toiletdata.csv");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder("euc-kr").decode(bytes); }
  const [headers, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  for (const header of ["남성용-대변기수", "남성용-소변기수", "여성용-대변기수"]) {
    if (!headers.includes(header)) throw new Error(`필수 컬럼 누락: ${header}`);
  }
  const countsByKey = new Map();
  for (const cells of rows) {
    if (cells.length !== headers.length) throw new Error("CSV 컬럼 개수 오류");
    const row = Object.fromEntries(headers.map((header, i) => [header, cells[i].trim()]));
    const key = keyOf({ id: row["관리번호"], name: row["화장실명"], roadAddress: row["소재지도로명주소"], jibunAddress: row["소재지지번주소"] });
    if (countsByKey.has(key)) throw new Error("원본에서 동일한 화장실이 중복되었습니다.");
    countsByKey.set(key, getGeneralFacilityCounts(row));
  }
  // 모든 매칭을 먼저 검증한 후 저장해 누락된 행이 있을 때 일부 파일만 변경되는 일을 막는다.
  const outputs = [];
  for (const name of ["success", "failed"]) {
    const path = `data/processed/toilets-all-${name}.json`;
    const data = JSON.parse(await readFile(path, "utf8"));
    data.items = data.items.map((item) => {
      const counts = countsByKey.get(keyOf(item));
      if (!counts) throw new Error(`CSV에서 항목을 찾을 수 없습니다: ${item.id}`);
      return { ...item, ...counts };
    });
    outputs.push({ path, data });
  }
  for (const { path, data } of outputs) {
    await writeFile(`${path}.tmp`, JSON.stringify(data, null, 2), "utf8");
    // Windows 파일 잠금은 잠깐 기다린 뒤 재시도하며 기존 결과는 삭제하지 않는다.
    for (let retry = 0; ; retry++) {
      try { await rename(`${path}.tmp`, path); break; }
      catch (error) {
        if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || retry >= 9) throw error;
        await delay(300 * (retry + 1));
      }
    }
    console.log(`${path}: ${data.items.length}건에 일반 시설 정보 추가 (API 호출 없음)`);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
