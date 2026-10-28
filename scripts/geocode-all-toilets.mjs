import { readFile, writeFile, appendFile, mkdir, rename, open, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";
import { getGeneralFacilityCounts } from "./lib/toilet-csv.mjs";

nextEnv.loadEnvConfig(process.cwd());
const directory = "data/processed";
const journalPath = `${directory}/toilets-all-checkpoint.jsonl`;
const progressPath = `${directory}/toilets-all-progress.json`;
const lockPath = `${directory}/toilets-all.lock`;
const results = new Map();
const cache = new Map();
let calls = 0;
let stopped = false;
let total = 0;
let saveQueue = Promise.resolve();

// 따옴표 안의 줄바꿈과 쉼표를 보존해 전국 CSV의 주소가 잘리지 않도록 읽는다.
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
    } else value += char;
  }
  if (quoted) throw new Error("CSV의 따옴표가 닫히지 않았습니다.");
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const keyOf = (item) => JSON.stringify([item.id, item.name, item.roadAddress, item.jibunAddress]);

async function atomicJson(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2), "utf8");
  // Windows에서 다른 프로그램이 파일을 일시적으로 잡으면 교체가 실패할 수 있어 제한적으로 재시도한다.
  for (let retry = 0; ; retry++) {
    try {
      await rename(`${path}.tmp`, path);
      return;
    } catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || retry >= 9) throw error;
      await delay(300 * (retry + 1));
    }
  }
}

async function snapshot(state, error = null) {
  const items = [...results.values()];
  const success = items.filter((item) => item.status === "matched");
  const failed = items.filter((item) => item.status !== "matched");
  const updatedAt = new Date().toISOString();
  // 전체 파일은 일정 건수마다 저장하고, 개별 결과는 추적 기록에 추가해 중단 시 손실을 줄인다.
  await atomicJson(`${directory}/toilets-all-success.json`, { updatedAt, total: success.length, items: success });
  await atomicJson(`${directory}/toilets-all-failed.json`, { updatedAt, total: failed.length, items: failed });
  const progress = { updatedAt, state, total, processed: items.length, remaining: total - items.length, success: success.length, failedOrReview: failed.length, apiCallsThisRun: calls, error };
  await atomicJson(progressPath, progress);
  console.log(JSON.stringify(progress));
}

async function loadPrevious() {
  // 완료 후 체크포인트를 정리해도 최종 파일을 읽어 이미 변환한 주소의 API 호출을 방지한다.
  for (const path of [
    `${directory}/toilets-first-100-success.json`,
    `${directory}/toilets-first-100-failed.json`,
    `${directory}/toilets-all-success.json`,
    `${directory}/toilets-all-failed.json`,
  ]) {
    try {
      const data = JSON.parse(await readFile(path, "utf8"));
      for (const item of data.items) results.set(keyOf(item), item);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  // 중단 시 마지막 불완전한 줄만 제외하고 저장된 결과를 복구해 완료한 주소를 다시 호출하지 않는다.
  try {
    const text = await readFile(journalPath, "utf8");
    const end = text.lastIndexOf("\n") + 1;
    for (const line of text.slice(0, end).split("\n").filter(Boolean)) {
      const item = JSON.parse(line);
      results.set(keyOf(item), item);
    }
    if (end < text.length) await writeFile(journalPath, text.slice(0, end), "utf8");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const item of results.values()) {
    for (const attempt of item.attempts ?? []) cache.set(attempt.query, Promise.resolve(attempt));
  }
}

async function main() {
  const bytes = await readFile("data/raw/toiletdata.csv");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder("euc-kr").decode(bytes); }
  const [headers, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  for (const name of ["관리번호", "화장실명", "소재지도로명주소", "소재지지번주소"]) {
    if (!headers.includes(name)) throw new Error(`필수 컬럼 누락: ${name}`);
  }
  const toilets = rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV ${index + 2}행의 컬럼 개수가 다릅니다.`);
    const row = Object.fromEntries(headers.map((key, i) => [key, cells[i].trim()]));
    return { id: row["관리번호"], name: row["화장실명"], roadAddress: row["소재지도로명주소"], jibunAddress: row["소재지지번주소"], ...getGeneralFacilityCounts(row) };
  });
  total = toilets.length;
  if (new Set(toilets.map(keyOf)).size !== total) throw new Error("동일한 식별 정보를 가진 중복 행이 있습니다. 중복 처리를 먼저 확인해야 합니다.");
  await mkdir(directory, { recursive: true });
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ total, maxInitialCalls: total * 2, invalidTextRows: toilets.filter((item) => [item.id, item.name, item.roadAddress, item.jibunAddress].some((value) => value.includes("\uFFFD"))).length }));
    return;
  }
  const clientId = process.env.NAVER_MAP_CLIENT_ID || process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("Maps 인증 정보를 .env.local에 설정해 주세요.");
  // 중복 실행으로 API가 이중 호출되지 않도록 실행 잠금을 사용한다.
  const lock = await open(lockPath, "wx");
  await lock.writeFile(String(process.pid));
  let fatalError = null;
  try {
    await loadPrevious();
    const validKeys = new Set(toilets.map(keyOf));
    for (const key of results.keys()) if (!validKeys.has(key)) results.delete(key);
    await snapshot("running");

    function geocode(query) {
      if (cache.has(query)) return cache.get(query);
      // 진행 중인 요청도 공유해 같은 주소가 여러 작업에서 동시에 호출되지 않게 한다.
      const promise = (async () => {
        for (let retry = 0; retry < 3; retry++) {
          if (stopped) throw new Error("작업이 중단되었습니다.");
          await delay(100);
          const url = new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
          url.searchParams.set("query", query);
          url.searchParams.set("count", "2");
          let response;
          try {
            calls++;
            response = await fetch(url, { headers: { "x-ncp-apigw-api-key-id": clientId, "x-ncp-apigw-api-key": secret, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
          } catch {
            if (retry === 2) throw new Error("네트워크 연결 실패: 결과를 저장하고 중단합니다.");
            await delay(2000 * (retry + 1));
            continue;
          }
          if (!response.ok) {
            // 인증 및 호출 한도 오류는 중단하고, 일시적인 서버 장애만 제한적으로 재시도한다.
            if (response.status >= 500 && retry < 2) { await delay(2000 * (retry + 1)); continue; }
            throw new Error(`Geocoding HTTP ${response.status}: 설정과 한도를 확인해 주세요.`);
          }
          const data = await response.json();
          if (data.status !== "OK" || !Array.isArray(data.addresses)) throw new Error("Geocoding 응답 형식 오류");
          const matches = data.addresses.map((address) => {
            const lat = Number(address.y), lng = Number(address.x);
            if (!address.y || !address.x || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error("잘못된 좌표 응답");
            return { lat, lng, roadAddress: address.roadAddress, jibunAddress: address.jibunAddress };
          });
          return { query, matches, totalCount: data.meta?.totalCount ?? matches.length };
        }
      })();
      cache.set(query, promise);
      return promise;
    }

    const pending = toilets.filter((item) => !results.has(keyOf(item)));
    let cursor = 0;
    // 동시 작업 수를 제한하고, 저장은 한 줄씩 순서대로 처리해 체크포인트 손상을 막는다.
    async function worker() {
      while (!stopped && cursor < pending.length) {
        const toilet = pending[cursor++];
        try {
          const attempts = [];
          let matched;
          const invalid = [toilet.id, toilet.name, toilet.roadAddress, toilet.jibunAddress].some((value) => value.includes("\uFFFD"));
          if (!invalid) {
            for (const query of [...new Set([toilet.roadAddress, toilet.jibunAddress].filter(Boolean))]) {
              const attempt = await geocode(query);
              attempts.push(attempt);
              if (attempt.matches.length) { matched = attempt; break; }
            }
          }
          const status = invalid ? "invalid_text" : !matched ? "not_found" : matched.totalCount > 1 ? "needs_review" : "matched";
          const item = { ...toilet, status, lat: status === "matched" ? matched.matches[0].lat : null, lng: status === "matched" ? matched.matches[0].lng : null, attempts };
          if (status !== "matched") item.reason = invalid ? "원본 이름 또는 주소의 문자 손상" : matched ? "위치 후보가 여러 개여서 확인 필요" : "주소에서 좌표를 찾지 못함";
          saveQueue = saveQueue.then(async () => {
            await appendFile(journalPath, `${JSON.stringify(item)}\n`, "utf8");
            results.set(keyOf(item), item);
            if (results.size % 500 === 0) await snapshot("running");
          });
          await saveQueue;
        } catch (error) { fatalError ??= error; stopped = true; }
      }
    }
    await Promise.all(Array.from({ length: 6 }, () => worker()));
    // 저장 실패로 대기열이 거절돼도 종료 상태를 기록할 기회는 남겨 running으로 오인하지 않게 한다.
    try { await saveQueue; }
    catch (error) { fatalError ??= error; stopped = true; }
    await snapshot(fatalError || stopped ? "stopped" : "completed", fatalError?.message);
    if (fatalError) throw fatalError;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

// 정상 종료 요청은 처리 중인 작업을 저장한 다음 종료해 다음 실행에서 이어갈 수 있게 한다.
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
