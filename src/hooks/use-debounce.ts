"use client";

import { useEffect, useState } from "react";

export function useDebounce(value: string, delay = 1000) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // 입력이 멈춘 뒤에만 검색어를 갱신해 타이핑마다 요청하지 않게 한다.
    const timer = setTimeout(() => setDebouncedValue(value), delay);

    // 다음 글자가 입력되거나 화면을 떠나면 이전 예약을 취소한다.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
