# BuildPlanner TODO

## Backend
- [x] DB 스키마: researches, research_sources, research_plans 테이블 추가
- [x] 멀티소스 수집 API: GitHub REST API 연동
- [x] 멀티소스 수집 API: Hugging Face Hub API 연동
- [x] 멀티소스 수집 API: Papers with Code API 연동
- [x] 멀티소스 수집 API: Hacker News Algolia API 연동
- [x] 소스 점수화 로직 구현 (stars, downloads, 최신성, 커뮤니티 반응)
- [x] LLM 분석 라우터 구현 (핵심 기술, 오픈소스, 유사 서비스, 난이도, 라이선스)
- [x] 앱 개발 계획서 .md 자동 생성 라우터 구현
- [x] 리서치 히스토리 저장/조회 라우터 구현

## Frontend
- [x] 전체 디자인 시스템 설정 (색상, 폰트, 애니메이션)
- [x] 메인 랜딩/키워드 입력 화면 구현
- [x] 리서치 진행 상태 표시 (로딩/스트리밍)
- [x] 검색 결과 탭 뷰 (GitHub, HF, Papers, HN 카드)
- [x] LLM 분석 요약 섹션 구현
- [x] 계획서 Markdown 미리보기 렌더링
- [x] .md 파일 다운로드 기능 구현
- [x] 리서치 히스토리 페이지 구현
- [x] 반응형 레이아웃 완성

## Testing
- [x] 백엔드 라우터 vitest 테스트 작성
- [x] 통합 테스트 검증

## 역설계 모드 (Teardown)
- [x] DB 스키마: researches.mode/target_product/target_url, research_plans.teardownJson, sourceType에 web/review 추가
- [x] 마이그레이션 생성 (drizzle/0003_next_dracula.sql) — 적용은 `pnpm db:push` 필요
- [x] 공개 페이지 수집기 (webIntel.ts): robots.txt 준수, HTML→텍스트 추출
- [x] HN 댓글 수집기: 제품 관련 사용자 불만 수집 (균열 분석 근거)
- [x] A단계 원리 추출 (extractPrinciples)
- [x] B단계 균열 분석 (findFaultLines)
- [x] C단계 도약 설계 (designLeapfrog) — 원본 구현 경로 사용 금지 제약
- [x] D단계 차별화 감사 (auditDivergence) — 60점 미만 시 1회 재설계
- [x] 역설계 설계서 .md 생성 (generateTeardownMarkdown)
- [x] tRPC 라우터: research.startTeardown, reRun/import/modify 모드 분기
- [x] 스케줄 갱신 시 역설계 보고서 보존
- [x] 프론트: 홈 모드 토글 + 제품명/URL 입력
- [x] 프론트: 원리/균열/도약/원본자료 탭
- [x] 프론트: 히스토리 역설계 배지
- [x] 테스트 34건 추가 (robots 파싱, HTML 추출, JSON 복구, 댓글 귀속, 보고서 생성)

### 실측 후 보정 (실제 네트워크 검증에서 발견)
- [x] 댓글 귀속 정확도: 제품명이 일반 단어일 때("Linear") 선형대수 글이 근거로 섞이던 문제
      → 도메인 인용 / story_url 일치 기준으로 confirmed·unconfirmed 등급 부여
- [x] HN 채용 스레드("Who is hiring?") 제외 — 도메인은 언급하나 제품 평가가 아님
- [x] 프롬프트에 근거 신뢰도 전달 — 미확인 근거는 확인된 근거가 5건 미만일 때만 경고 문구와 함께 포함
- [x] Vite 감시자 폴링 전환 — Z: 매핑 드라이브에서 fs.watch가 `UNKNOWN` 으로 서버를 죽이던 문제

## 미적용 / 환경 이슈
- [ ] DB 마이그레이션 적용 — MySQL(localhost:3306) 미기동으로 보류. 기동 후 `pnpm db:push`
- [ ] 마이그레이션 저널 불일치 — `_journal.json`은 0000_wealthy_tomorrow_man을 참조하나 해당 .sql 없음
- [ ] OAUTH_SERVER_URL 미설정 — 로그인 불가, protectedProcedure 전부 UNAUTHORIZED
- [ ] GEMINI_API_KEY/OPENAI_API_KEY 미설정 — LLM 4단 체인 실행 불가
