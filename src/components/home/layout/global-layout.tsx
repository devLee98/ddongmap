import Link from "next/link";
import type { ReactNode } from "react";

export default function GolbalLayout({ children }: { children: ReactNode }) {
  return (
    // 동적 뷰포트 높이 안에서 헤더를 먼저 배치해 지도 때문에 페이지 스크롤이 생기지 않게 한다.
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="h-15 shrink-0 border-b">
        <div className="mx-auto flex h-full max-w-7xl items-center px-4">
          <Link href="/" className="font-bold">
            응가맵
          </Link>
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
