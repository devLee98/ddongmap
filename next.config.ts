import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // 서버가 파일 시스템으로 읽는 전국 데이터가 배포 결과에도 포함되도록 명시한다.
  outputFileTracingIncludes: {
    "/api/toilets": ["./data/processed/toilets-all-success.json"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
