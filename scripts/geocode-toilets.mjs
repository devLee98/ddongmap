import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";

// Next.js와 같은 환경 변수 로딩을 사용하고 Secret은 서버 전용 변수로만 읽는다.
nextEnv.loadEnvConfig(process.cwd());
const dryRun = process.argv.includes("--dry-run");
const output = "data/processed/toilets-first-100-success.json";
const issuesOutput = "data/processed/toilets-first-100-failed.json";

async function saveIssues(items) {
  // 원본 주소와 API 후보를 함께 보존해야 나중에 주소 수정이나 수동 좌표 확인이 가능하다.
  const issues = items.filter((item) => item.status !== "matched").map((item) => ({
    ...item,
    reason: item.status === "needs_review"
      ? "주소 검색 결과가 여러 개여서 위치 확인이 필요합니다."
      : "입력한 주소에서 좌표를 찾지 못했습니다.",
  }));
  // 전체 결과와 별도로 저장하되 임시 파일 교체로 저장 도중 중단에 대비한다.
  await writeFile(`${issuesOutput}.tmp`, JSON.stringify({ updatedAt: new Date().toISOString(), total: issues.length, items: issues }, null, 2), "utf8");
  await rename(`${issuesOutput}.tmp`, issuesOutput);
}

async function saveResults(items) {
  // 성공 파일에는 유효한 좌표를 가진 항목만 넣어 화면에서 상태 필터 없이 사용할 수 있게 한다.
  const success = items.filter((item) => item.status === "matched");
  if (success.some((item) => !Number.isFinite(item.lat) || !Number.isFinite(item.lng))) {
    throw new Error("성공 데이터에 유효하지 않은 좌표가 있습니다.");
  }
  await writeFile(`${output}.tmp`, JSON.stringify({ updatedAt: new Date().toISOString(), total: success.length, items: success }, null, 2), "utf8");
  await rename(`${output}.tmp`, output);
  await saveIssues(items);
}

// 따옴표 안의 쉼표·줄바꿈과 이스케이프된 따옴표를 보존해 주소가 잘리지 않게 한다.
function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = []; value = "";
      if (rows.length === 101) return rows;
    } else value += char;
  }
  if (quoted) throw new Error("CSV의 따옴표가 닫히지 않았습니다.");
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

async function main() {
  // 기존 결과 분리는 인증 정보나 추가 API 호출 없이 수행할 수 있게 한다.
  if (process.argv.includes("--migrate-results")) {
    const saved = JSON.parse(await readFile("data/processed/toilets-first-100.json", "utf8"));
    await saveResults(saved.items);
    console.log(`성공·실패 결과 분리 완료: ${saved.items.length}건 (API 호출 없음)`);
    return;
  }
  const bytes = await readFile("data/raw/toiletdata.csv");
  let text;
  // 편집기에서 UTF-8로 변환한 경우와 기존 CP949 파일을 모두 지원한다.
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder("euc-kr").decode(bytes); }
  const [headers, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  for (const name of ["관리번호", "화장실명", "소재지도로명주소", "소재지지번주소"]) {
    if (!headers.includes(name)) throw new Error(`필수 컬럼 누락: ${name}`);
  }
  const toilets = rows.map((cells) => {
    if (cells.length !== headers.length) throw new Error("CSV 컬럼 개수가 일치하지 않습니다.");
    const row = Object.fromEntries(headers.map((key, i) => [key, cells[i].trim()]));
    const toilet = { id: row["관리번호"], name: row["화장실명"], roadAddress: row["소재지도로명주소"], jibunAddress: row["소재지지번주소"] };
    // 원본의 다른 행에 손상 문자가 있어도 시험 범위는 읽되, 사용할 주소가 깨졌으면 중단한다.
    if (Object.values(toilet).some((value) => value.includes("\uFFFD"))) throw new Error("시험 범위에 인코딩이 손상된 이름 또는 주소가 있습니다.");
    return toilet;
  });
  if (dryRun) {
    console.log(JSON.stringify({ rows: toilets.length, first: toilets[0], last: toilets.at(-1), maxApiCalls: toilets.length * 2 }, null, 2));
    return;
  }
  const clientId = process.env.NAVER_MAP_CLIENT_ID || process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error(".env.local에 NAVER_MAP_CLIENT_ID와 NAVER_MAP_CLIENT_SECRET을 설정해 주세요. Maps Application의 인증 정보를 사용해야 합니다.");

  const cache = new Map();
  const results = [];
  let calls = 0;
  // 성공 및 검색 결과 없음만 재사용하고, 인증·통신 오류는 즉시 중단해 호출 낭비를 막는다.
  let previous = [];
  // 분리된 두 파일을 함께 읽어 실패·검토 항목의 이전 조회 결과도 재사용한다.
  for (const path of [output, issuesOutput]) {
    try { previous.push(...JSON.parse(await readFile(path, "utf8")).items); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (const item of previous) {
    for (const attempt of item.attempts) cache.set(attempt.query, attempt);
  }
  async function geocode(query) {
    if (cache.has(query)) return cache.get(query);
    // 순차 호출과 간격으로 급격한 요청을 피하며 자동 재시도는 하지 않는다.
    await delay(250);
    const url = new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
    url.searchParams.set("query", query);
    url.searchParams.set("count", "2");
    calls++;
    const response = await fetch(url, {
      headers: { "x-ncp-apigw-api-key-id": clientId, "x-ncp-apigw-api-key": secret, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}: 설정·한도를 확인한 후 다시 실행하세요.`);
    const data = await response.json();
    if (data.status !== "OK" || !Array.isArray(data.addresses)) throw new Error("Geocoding 응답이 정상 형식이 아닙니다.");
    const matches = data.addresses.map((address) => {
      const lat = Number(address.y), lng = Number(address.x);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error("잘못된 좌표 응답입니다.");
      return { lat, lng, roadAddress: address.roadAddress, jibunAddress: address.jibunAddress };
    });
    const attempt = { query, matches, totalCount: data.meta?.totalCount ?? matches.length };
    cache.set(query, attempt);
    return attempt;
  }
  await mkdir("data/processed", { recursive: true });
  for (const toilet of toilets) {
    const attempts = [];
    let matched;
    for (const address of [...new Set([toilet.roadAddress, toilet.jibunAddress].filter(Boolean))]) {
      const attempt = await geocode(address);
      attempts.push(attempt);
      if (attempt.matches.length) { matched = attempt; break; }
    }
    // 복수 후보를 임의로 확정하지 않고 검토 대상으로 저장해 잘못된 위치 표시를 막는다.
    const status = !matched ? "not_found" : matched.totalCount > 1 ? "needs_review" : "matched";
    results.push({ ...toilet, status, lat: status === "matched" ? matched.matches[0].lat : null, lng: status === "matched" ? matched.matches[0].lng : null, attempts });
    // 매 행마다 성공과 실패를 분리 저장하여 작업이 중단되어도 결과를 남긴다.
    await saveResults(results);
    console.log(`${results.length}/${toilets.length} ${toilet.name}: ${status}`);
  }
  console.log(`완료: ${output} (이번 실행 API 호출 ${calls}회)`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
