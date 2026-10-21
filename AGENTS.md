<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Project Coding Guidelines

1. 주석 작성 규칙

새로운 기능을 구현하거나 기존 코드를 수정할 때 핵심 로직에는 반드시 한국어 주석을 작성한다.

코드가 무엇을 하는지뿐만 아니라 왜 해당 구현 방식을 선택했는지 설명한다.

비동기 처리, 상태 관리, 이벤트 처리, 성능 최적화 로직에는 반드시 주석을 작성한다.

단순한 변수 선언이나 자명한 코드에는 불필요한 주석을 작성하지 않는다.

코드 변경 시 기존 주석도 함께 검토하고 수정한다.
