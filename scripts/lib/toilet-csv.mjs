// 주소 안의 쉼표와 줄바꿈을 보존해 CSV의 열이 어긋나지 않게 읽는다.
export function parseCsv(text) {
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

export function getGeneralFacilityCounts(row) {
  // 빈 값이나 잘못된 값은 0으로 바꾸지 않아 시설 없음으로 오인하지 않게 한다.
  const count = (value) => /^\d+$/.test(value?.trim() ?? "") ? Number(value.trim()) : null;
  // 어린이용·장애인용은 별도 열이므로 합산하지 않고 일반 시설 열만 보존한다.
  return {
    maleToiletCount: count(row["남성용-대변기수"]),
    maleUrinalCount: count(row["남성용-소변기수"]),
    femaleToiletCount: count(row["여성용-대변기수"]),
  };
}
