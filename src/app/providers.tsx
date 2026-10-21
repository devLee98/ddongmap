"use client";

import {
  environmentManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  // 서버에서는 호출마다 캐시를 분리해 사용자 간 데이터 공유를 방지한다.
  if (environmentManager.isServer()) {
    return new QueryClient();
  }

  // 브라우저에서는 초기 렌더링이 중단되어도 같은 클라이언트를 재사용해 캐시를 유지한다.
  browserQueryClient ??= new QueryClient();
  return browserQueryClient;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
      {/* 쿼리 캐시를 필요할 때 확인하도록 개발 도구는 닫힌 상태로 시작한다. */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
