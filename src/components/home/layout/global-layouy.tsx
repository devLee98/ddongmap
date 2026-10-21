import Link from "next/link";
import type { ReactNode } from "react";

export default function GolbalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="h-15 shrink-0 border-b">
        <div className="mx-auto flex h-full max-w-7xl items-center px-4">
          <Link href="/" className="font-bold">
            응가맵
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
