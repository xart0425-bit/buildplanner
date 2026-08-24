/**
 * Fixed text for the generated dev kit (README, memory file, loop/, specs/, context/).
 *
 * Unlike the plan and teardown reports, most of this is read by a *coding agent* rather
 * than a person — but a kit whose scaffolding is Korean while its specs are French reads
 * as broken, so it follows the same language setting as everything else.
 */
import type { AnalysisLanguage } from "@shared/languages";

export interface KitStrings {
  /** Filled in by `kitStrings()` so callers can reach the sibling tables. */
  language: AnalysisLanguage;
  /** loop/RALPH.md — the procedure the agent repeats each iteration. */
  ralphSteps: (testCommand: string, lintCommand: string) => string[];
  ralphIntro: string;
  ralphRules: string;
  ralphFooter: (agentLabel: string) => string;

  loop: {
    goalTitle: string;
    goalIntro: string;
    what: string;
    done: string;
    doNot: string;
    doNotItems: string[];
    verifyCommands: string;
    originalIdea: string;
    difficulty: string;

    progressTitle: string;
    progressIntro: string;
    currentState: string;
    activeSpec: string;
    completed: string;
    lastVerified: string;
    notRunYet: string;
    log: string;
    initialised: string;
    specsCreated: (n: number) => string;
    nextTask: string;
    progressTemplate: string;

    evaluatorTitle: string;
    evaluatorIntro: string;
    procedure: string;
    evaluatorSteps: string[];
    verdictPrinciples: string;
    verdictPrincipleItems: string[];
  };

  specs: {
    indexTitle: string;
    indexIntro: string;
    id: string;
    title: string;
    priority: string;
    dependsOn: string;
    status: string;
    file: string;
    firstTask: string;
    state: string;
    goal: string;
    requirements: string;
    acceptanceCriteria: string;
    acceptanceNote: string;
    verification: string;
    outOfScope: string;
    outOfScopeDefault: string;
    workLog: string;
    workLogHint: string;
    seeSpecBody: string;
    none: string;
  };

  memory: {
    intro: (agentLabel: string, keyword: string, model: string) => string;
    howItWorks: string;
    path: string;
    role: string;
    roles: Record<
      "goal" | "progress" | "ralph" | "evaluator" | "index" | "specFiles" | "context" | "plan",
      string
    >;
    everySession: string;
    sessionSteps: (testCommand: string) => string[];
    commands: string;
    devServer: string;
    tests: string;
    lint: string;
    build: string;
    techStack: string;
    area: string;
    technology: string;
    rules: string;
    designGuidelines: string;
    referenceImages: string;
    userRequirements: string;
    requirementPriority: string;
    existingProjects: string;
    existingProjectsNote: string;
    seeLocalProjects: string;
  };

  readme: {
    intro: string;
    quickStart: string;
    runOnce: string;
    runLoop: string;
    macLinux: string;
    windows: string;
    cliNote: (cli: string) => string;
    folderStructure: string;
    memoryFileComment: string;
    howItWorks: string;
    diagramCaption: string;
    humanRole: string;
    buildInfo: string;
    originalIdea: string;
    targetAgent: string;
    memoryFileLabel: string;
    analysisModel: string;
    specCount: string;
  };

  context: {
    architecture: string;
    overview: string;
    proposedTree: string;
    phases: string;
    coreTech: string;
    techStackTitle: string;
    commandsTitle: string;
    purpose: string;
    command: string;
    dev: string;
    test: string;
    lint: string;
    build: string;
    packageManager: string;
    runtime: string;
    risksTitle: string;
    risks: string;
    mitigation: string;
    noRisks: string;
    licenseNotes: string;
    defaultLicenseNote: string;
    referencesTitle: string;
    referencesIntro: string;
    openSourceRefs: string;
    collectedSources: (n: number) => string;
    noSources: string;
    similarServices: string;
    designTitle: string;
    designIntro: string;
    localProjectsTitle: string;
    localProjectsIntro: string;
    files: string;
    partiallyScanned: string;
    directoryTree: string;
    readmeExcerpt: string;
    teardownTitle: string;
    analysisTarget: string;
    newConcept: string;
    positioning: string;
    originalFaultLines: string;
    evidence: string;
    opportunity: string;
    differentiators: string;
    originalWay: string;
    ourWay: string;
    divergenceScore: string;
    legalNote: string;
  };

  assets: {
    title: string;
    intro: string;
  };

  scripts: {
    header: (agentLabel: string) => string;
    headerNote: string;
    iterationFailed: (n: string) => string;
    allDone: string;
    testFailed: string;
    verifyComment: string;
  };
}

const en: Omit<KitStrings, "language"> = {
  ralphIntro: "Perform exactly one iteration, in this order.",
  ralphRules: "Rules:",
  ralphSteps: (test, lint) => [
    "Read `loop/GOAL.md` and `loop/PROGRESS.md` to establish the current state.",
    "From `specs/INDEX.md`, pick the **single highest-priority spec** whose status is TODO or DOING.",
    "Read that spec file and the documents under `context/`.",
    "Implement only that one spec. Do not go beyond its scope.",
    `Run \`${test}\` and \`${lint}\` and make them pass.`,
    "Check the spec's Acceptance Criteria one by one and **verify for yourself that each is actually met**.",
    "Append what you did, the verification result and the next task to `loop/PROGRESS.md`, and update the status in `specs/INDEX.md`.",
    "Commit. Use the message `<SPEC-ID>: <one-line summary>`.",
    "When every spec is DONE and all conditions in `loop/GOAL.md` are satisfied, write `ALL-SPECS-DONE` on the last line of `loop/PROGRESS.md`.",
  ],
  ralphFooter: (agent) =>
    `This file is the **prompt for one iteration**, passed verbatim to ${agent}.\n\`scripts/loop.sh\` (or \`scripts/loop.ps1\`) re-sends it in a fresh context every iteration.\nDo not develop in one long conversation — run many short iterations. The state lives in files, not in the chat.`,
  loop: {
    goalTitle: "GOAL — what, and how far",
    goalIntro:
      "The core of loop engineering: a human does **not** dictate HOW. Define WHAT and the DONE conditions, and let the agent run the judge → implement → verify → fix loop by itself.",
    what: "WHAT",
    done: "DONE (completion criteria)",
    doNot: "What not to do",
    doNotItems: [
      "Adding features that are not in a spec",
      "Deleting or skipping tests to make them pass",
      "Ending an iteration with something failing",
      "Keeping progress only in the conversation (always write it to `loop/PROGRESS.md`)",
    ],
    verifyCommands: "Verification commands",
    originalIdea: "Original idea",
    difficulty: "Difficulty",
    progressTitle: "PROGRESS",
    progressIntro:
      "**Where the project's memory lives.** The agent's context disappears every iteration; this file does not. Every new iteration reads it first and appends a block at the end.",
    currentState: "Current state",
    activeSpec: "Active spec",
    completed: "Completed",
    lastVerified: "Last verification",
    notRunYet: "(not run yet)",
    log: "Log",
    initialised: "[init] kit created",
    specsCreated: (n) => `${n} specs created`,
    nextTask: "Next task",
    progressTemplate: `After each iteration, append a block in this shape:

### [YYYY-MM-DD HH:mm] SPEC-00X — title

- Did:
- Verification: PASS/FAIL (command and summarised output)
- Open problems:
- Next task:`,
    evaluatorTitle: "EVALUATOR — Generator ⇄ Evaluator checklist",
    evaluatorIntro:
      "If whoever built it also passes it, the loop quietly rots. After each implementation (Generator), judge it in a **separate context/session** using this procedure.",
    procedure: "Procedure",
    evaluatorSteps: [
      "Read the target spec's Acceptance Criteria one at a time.",
      "Confirm each one from an **execution result**. Reading the code and concluding \"it should work\" does not count.",
      "Run the commands below yourself.",
      "Record the verdict in exactly this shape.",
    ],
    verdictPrinciples: "Judging principles",
    verdictPrincipleItems: [
      "When in doubt, it is a **FAIL**.",
      "If there is no test and therefore no way to confirm, that is a FAIL. (Demand the test first.)",
      "If changes outside the spec's scope are mixed in, that is a FAIL.",
      "Only on PASS may the status in `specs/INDEX.md` become DONE.",
    ],
  },
  specs: {
    indexTitle: "Spec index",
    indexIntro:
      "Each iteration, the agent picks **the single highest-priority spec whose status is TODO/DOING** from this table.\nWhen a spec is finished, the agent updates this table itself. (TODO → DOING → DONE)",
    id: "ID",
    title: "Title",
    priority: "Priority",
    dependsOn: "Depends on",
    status: "Status",
    file: "File",
    firstTask: "First task",
    state: "Status",
    goal: "Goal",
    requirements: "Requirements",
    acceptanceCriteria: "Acceptance Criteria",
    acceptanceNote:
      "Every box must be checked for this spec to be DONE. Confirm from **execution results**, not assumptions.",
    verification: "Verification",
    outOfScope: "Out of scope",
    outOfScopeDefault: "Everything not stated in this spec",
    workLog: "Work log",
    workLogHint: "the agent appends one line here each time it works on this spec",
    seeSpecBody: "(see the spec body)",
    none: "none",
  },
  memory: {
    intro: (agent, keyword, model) =>
      `This file is the project memory ${agent} reads automatically at the start of a session.\nGenerated by BuildPlanner from an analysis of "${keyword}". (model: ${model})`,
    howItWorks: "How this repository works",
    path: "Path",
    role: "Role",
    roles: {
      goal: "Final goal (WHAT) and completion conditions (DONE)",
      progress: "The project's memory. Read every iteration, written every iteration",
      ralph: "The prompt for one iteration",
      evaluator: "Independent verification (Generator ⇄ Evaluator) procedure",
      index: "Spec list and status (TODO / DOING / DONE)",
      specFiles: "Individual specs. The source of truth",
      context: "Architecture, tech stack, risks, references",
      plan: "The full original build plan",
    },
    everySession: "At the start of every session",
    sessionSteps: (test) => [
      "Read `loop/GOAL.md` → `loop/PROGRESS.md` → `specs/INDEX.md`, in that order.",
      "Pick **one** spec to work on next.",
      `Implement → \`${test}\` → check the Acceptance Criteria → record in \`loop/PROGRESS.md\`.`,
    ],
    commands: "Commands",
    devServer: "dev server",
    tests: "tests (the basis of every verification)",
    lint: "lint",
    build: "build",
    techStack: "Tech stack",
    area: "Area",
    technology: "Technology",
    rules: "Rules",
    designGuidelines: "Design guidelines (from reference images)",
    referenceImages: "Reference images",
    userRequirements: "User-supplied requirements",
    requirementPriority: "the requirements in this document take precedence over other judgement.",
    existingProjects: "Existing projects to continue",
    existingProjectsNote:
      "This is not a new project but an extension of the codebases below. Open the real paths and check their current state before implementing.",
    seeLocalProjects: "See `context/local-projects.md` for the full structure.",
  },
  readme: {
    intro:
      "A **development starter kit** generated by BuildPlanner. Unzip it and hand the folder to your agent as-is.",
    quickStart: "Quick start",
    runOnce: "1) run a single iteration",
    runLoop: "2) keep looping (10 iterations by default)",
    macLinux: "macOS / Linux",
    windows: "Windows",
    cliNote: (cli) =>
      `The flags of the \`${cli}\` CLI vary by version. If they differ, change only the command at the top of the scripts.`,
    folderStructure: "Folder structure",
    memoryFileComment: "project memory the agent reads automatically",
    howItWorks: "How it works",
    diagramCaption: "",
    humanRole:
      "The human's job is to **define the goal and the completion conditions, and review the result**.\nThe \"how\" is what the agent finds by running the loop.",
    buildInfo: "Build info",
    originalIdea: "Original idea",
    targetAgent: "Target agent",
    memoryFileLabel: "memory file",
    analysisModel: "Analysis model",
    specCount: "Specs",
  },
  context: {
    architecture: "Architecture",
    overview: "Overview",
    proposedTree: "Proposed directory structure",
    phases: "Development phases",
    coreTech: "Core technologies",
    techStackTitle: "Tech stack",
    commandsTitle: "Commands",
    purpose: "Purpose",
    command: "Command",
    dev: "Develop",
    test: "Test",
    lint: "Lint",
    build: "Build",
    packageManager: "Package manager",
    runtime: "Runtime",
    risksTitle: "Risks and licensing",
    risks: "Risks",
    mitigation: "Mitigation",
    noRisks: "_No risks identified_",
    licenseNotes: "Licensing notes",
    defaultLicenseNote:
      "- Check the license of each referenced open-source project individually (MIT/Apache 2.0 allow commercial use; GPL requires releasing source).",
    referencesTitle: "References",
    referencesIntro:
      "Sources collected while writing the plan. Start here when you get stuck during implementation.",
    openSourceRefs: "Reference open source",
    collectedSources: (n) => `Collected sources (top ${n})`,
    noSources: "_No sources collected_",
    similarServices: "Similar services",
    designTitle: "Design guidelines",
    designIntro:
      "Derived from the reference images the user attached. UI work follows these. The original images are in `assets/references/`.",
    localProjectsTitle: "Referenced local projects",
    localProjectsIntro:
      "Codebases that **already exist** on the user's local disk.\nThis plan assumes you extend them rather than start from scratch. Open the real paths and check their current state before working.",
    files: "files",
    partiallyScanned: "partially scanned",
    directoryTree: "Directory structure",
    readmeExcerpt: "README excerpt",
    teardownTitle: "Teardown background",
    analysisTarget: "Subject",
    newConcept: "New concept",
    positioning: "Positioning",
    originalFaultLines: "Where the original strains",
    evidence: "Evidence",
    opportunity: "Opportunity",
    differentiators: "Differentiating features",
    originalWay: "Original approach",
    ourWay: "New approach",
    divergenceScore: "Divergence score",
    legalNote: "Legal notes",
  },
  assets: {
    title: "Reference images",
    intro:
      "Interface/design references attached by the user.\nUse their layout, composition and tone as the basis when building the UI.",
  },
  scripts: {
    header: (agent) => `BuildPlanner autonomous loop runner (${agent})`,
    headerNote:
      "Each iteration passes loop/RALPH.md in a fresh context. State lives in files, not in the conversation.",
    iterationFailed: (n) => `(iteration ${n} failed - the next one will pick up from here)`,
    allDone: "All specs complete. Ending the loop.",
    testFailed: "(tests failed - handing it to the next iteration)",
    verifyComment:
      "Verification is the loop's brake. A failure does not stop it; the next iteration fixes it.",
  },
};

const ko: Omit<KitStrings, "language"> = {
  ralphIntro: "아래 순서를 정확히 지켜 한 번의 반복(iteration)을 수행하라.",
  ralphRules: "규칙:",
  ralphSteps: (test, lint) => [
    "`loop/GOAL.md`와 `loop/PROGRESS.md`를 읽고 현재 상태를 파악한다.",
    "`specs/INDEX.md`에서 상태가 TODO 또는 DOING인 스펙 중 **우선순위가 가장 높은 것 하나**를 고른다.",
    "해당 스펙 파일과 `context/` 문서를 읽는다.",
    "그 스펙 하나만 구현한다. 범위를 넘는 작업은 하지 않는다.",
    `\`${test}\` 와 \`${lint}\` 를 실행해 통과시킨다.`,
    "스펙의 Acceptance Criteria를 하나씩 대조해 **실제로 충족했는지 스스로 검증**한다.",
    "`loop/PROGRESS.md`에 수행 내용·검증 결과·다음 작업을 append하고, `specs/INDEX.md`의 상태를 갱신한다.",
    "커밋한다. 커밋 메시지는 `<SPEC-ID>: <한 줄 요약>`.",
    "모든 스펙이 DONE이고 `loop/GOAL.md`의 DONE 조건을 전부 만족하면 `loop/PROGRESS.md` 마지막 줄에 `ALL-SPECS-DONE`을 기록한다.",
  ],
  ralphFooter: (agent) =>
    `이 파일은 ${agent} 에 그대로 전달되는 **루프 1회분 프롬프트**다.\n\`scripts/loop.sh\` 또는 \`scripts/loop.ps1\` 이 매 반복마다 새 컨텍스트로 이 내용을 다시 전달한다.\n긴 대화 하나로 개발하지 말고, 짧은 반복을 여러 번 돌려라 — 상태는 대화가 아니라 파일에 있다.`,
  loop: {
    goalTitle: "GOAL — 무엇을, 어디까지",
    goalIntro:
      "Loop Engineering의 핵심: 사람은 **HOW를 지시하지 않는다.** WHAT과 DONE 조건만 정의하고, 에이전트가 판단 → 구현 → 검증 → 수정 루프를 스스로 돌린다.",
    what: "WHAT",
    done: "DONE (완료 조건)",
    doNot: "하지 말아야 할 것",
    doNotItems: [
      "스펙에 없는 기능 추가",
      "테스트를 삭제하거나 skip 처리해서 통과시키기",
      "실패한 상태로 반복 종료",
      "진행 상황을 대화 기억에만 남기기 (반드시 `loop/PROGRESS.md`에 기록)",
    ],
    verifyCommands: "검증 명령",
    originalIdea: "원본 아이디어",
    difficulty: "난이도",
    progressTitle: "PROGRESS",
    progressIntro:
      "**프로젝트의 기억이 사는 곳.** 에이전트의 컨텍스트는 매 반복마다 사라지지만 이 파일은 남는다. 새 반복은 항상 이 파일을 먼저 읽고 시작하며, 매 반복 끝에 한 블록씩 append 한다.",
    currentState: "현재 상태",
    activeSpec: "활성 스펙",
    completed: "완료",
    lastVerified: "마지막 검증",
    notRunYet: "(아직 실행 안 됨)",
    log: "로그",
    initialised: "[초기화] 킷 생성됨",
    specsCreated: (n) => `스펙 ${n}건 생성`,
    nextTask: "다음 작업",
    progressTemplate: `매 반복 뒤 아래 형식으로 추가:

### [YYYY-MM-DD HH:mm] SPEC-00X — 제목

- 한 일:
- 검증 결과: PASS/FAIL (명령과 출력 요약)
- 남은 문제:
- 다음 작업:`,
    evaluatorTitle: "EVALUATOR — Generator ⇄ Evaluator 체크리스트",
    evaluatorIntro:
      "만든 주체가 스스로 합격 판정을 내리면 루프는 조용히 망가진다. 구현(Generator)이 끝날 때마다 **다른 컨텍스트/세션**에서 이 절차로 판정한다.",
    procedure: "절차",
    evaluatorSteps: [
      "대상 스펙의 Acceptance Criteria를 하나씩 읽는다.",
      "각 항목을 **실행 결과**로 확인한다. 코드를 읽고 \"될 것 같다\"는 근거로 삼지 않는다.",
      "아래 명령을 직접 실행한다.",
      "다음 형식으로만 판정을 남긴다.",
    ],
    verdictPrinciples: "판정 원칙",
    verdictPrincipleItems: [
      "의심스러우면 **FAIL**이다.",
      "테스트가 없어서 확인이 불가능하면 FAIL이다. (테스트부터 요구한다)",
      "스펙 범위를 넘어선 변경이 섞여 있으면 FAIL이다.",
      "PASS일 때만 `specs/INDEX.md`의 상태를 DONE으로 바꾼다.",
    ],
  },
  specs: {
    indexTitle: "스펙 인덱스",
    indexIntro:
      "에이전트는 매 반복마다 이 표에서 **상태가 TODO/DOING 인 것 중 우선순위가 가장 높은 스펙 하나**를 고른다.\n스펙을 끝내면 이 표의 상태를 직접 갱신한다. (TODO → DOING → DONE)",
    id: "ID",
    title: "제목",
    priority: "우선순위",
    dependsOn: "선행",
    status: "상태",
    file: "파일",
    firstTask: "첫 작업",
    state: "상태",
    goal: "Goal",
    requirements: "Requirements",
    acceptanceCriteria: "Acceptance Criteria",
    acceptanceNote:
      "이 체크박스가 전부 채워져야 이 스펙은 DONE이다. 추측이 아니라 **실행 결과**로 확인한다.",
    verification: "Verification",
    outOfScope: "Out of scope",
    outOfScopeDefault: "이 스펙에 명시되지 않은 모든 것",
    workLog: "작업 로그",
    workLogHint: "에이전트가 이 스펙을 처리할 때마다 한 줄씩 append 한다",
    seeSpecBody: "(스펙 본문 참조)",
    none: "없음",
  },
  memory: {
    intro: (agent, keyword, model) =>
      `이 파일은 ${agent}가 세션 시작 시 자동으로 읽는 프로젝트 메모리다.\nBuildPlanner가 "${keyword}" 분석 결과로 생성했다. (대상 모델: ${model})`,
    howItWorks: "이 저장소의 작동 방식",
    path: "경로",
    role: "역할",
    roles: {
      goal: "최종 목표(WHAT)와 완료 조건(DONE)",
      progress: "프로젝트의 기억. 매 반복마다 읽고, 매 반복 끝에 기록",
      ralph: "반복 1회분 실행 프롬프트",
      evaluator: "독립 검증(Generator ⇄ Evaluator) 절차",
      index: "스펙 목록과 상태 (TODO / DOING / DONE)",
      specFiles: "개별 스펙. 진실의 원천",
      context: "아키텍처·기술스택·리스크·참고자료",
      plan: "원본 개발 계획서 전문",
    },
    everySession: "매 세션 시작 시",
    sessionSteps: (test) => [
      "`loop/GOAL.md` → `loop/PROGRESS.md` → `specs/INDEX.md` 순서로 읽는다.",
      "다음에 할 스펙 **하나**를 고른다.",
      `구현 → \`${test}\` → Acceptance Criteria 대조 → \`loop/PROGRESS.md\` 기록.`,
    ],
    commands: "명령어",
    devServer: "개발 서버",
    tests: "테스트 (모든 검증의 기준)",
    lint: "린트",
    build: "빌드",
    techStack: "기술 스택",
    area: "영역",
    technology: "기술",
    rules: "규칙",
    designGuidelines: "디자인 지침 (참고 이미지 기반)",
    referenceImages: "참고 이미지",
    userRequirements: "사용자 첨부 요구사항",
    requirementPriority: "이 문서의 요구사항이 다른 판단보다 우선한다.",
    existingProjects: "이어받을 기존 프로젝트",
    existingProjectsNote:
      "이 작업은 새 프로젝트가 아니라 아래 코드베이스의 확장이다. 구현 전에 실제 경로를 열어 현재 상태를 확인한다.",
    seeLocalProjects: "자세한 구조는 `context/local-projects.md` 참조.",
  },
  readme: {
    intro:
      "BuildPlanner가 생성한 **개발 시작 킷**입니다. 압축을 풀고 이 폴더를 그대로 에이전트에게 열어주면 됩니다.",
    quickStart: "빠른 시작",
    runOnce: "1) 한 번만 돌려보기",
    runLoop: "2) 루프로 계속 돌리기 (기본 10회)",
    macLinux: "macOS / Linux",
    windows: "Windows",
    cliNote: (cli) =>
      `\`${cli}\` CLI의 플래그는 버전에 따라 다를 수 있습니다. 스크립트 첫 부분의 명령만 바꿔 쓰면 됩니다.`,
    folderStructure: "폴더 구조",
    memoryFileComment: "에이전트가 자동으로 읽는 프로젝트 메모리",
    howItWorks: "작동 원리",
    diagramCaption: "",
    humanRole:
      "사람이 할 일은 **목표와 완료 조건을 정의하고 결과를 검토하는 것**이고,\n\"어떻게\"는 에이전트가 루프를 돌며 스스로 찾습니다.",
    buildInfo: "생성 정보",
    originalIdea: "원본 아이디어",
    targetAgent: "대상 에이전트",
    memoryFileLabel: "메모리 파일",
    analysisModel: "분석 모델",
    specCount: "스펙 수",
  },
  context: {
    architecture: "아키텍처",
    overview: "개요",
    proposedTree: "제안 디렉터리 구조",
    phases: "개발 단계",
    coreTech: "핵심 기술",
    techStackTitle: "기술 스택",
    commandsTitle: "명령어",
    purpose: "목적",
    command: "명령",
    dev: "개발",
    test: "테스트",
    lint: "린트",
    build: "빌드",
    packageManager: "패키지 매니저",
    runtime: "런타임",
    risksTitle: "리스크와 라이선스",
    risks: "리스크",
    mitigation: "대응",
    noRisks: "_식별된 리스크 없음_",
    licenseNotes: "라이선스 주의사항",
    defaultLicenseNote:
      "- 참고 오픈소스의 라이선스를 개별 확인할 것 (MIT/Apache 2.0은 상업적 사용 가능, GPL은 소스 공개 의무)",
    referencesTitle: "참고 자료",
    referencesIntro: "계획서 작성 시 수집된 소스입니다. 구현 중 막히면 여기부터 확인하세요.",
    openSourceRefs: "참고 오픈소스",
    collectedSources: (n) => `수집 소스 (상위 ${n}건)`,
    noSources: "_수집된 소스 없음_",
    similarServices: "유사 서비스",
    designTitle: "디자인 지침",
    designIntro:
      "사용자가 첨부한 참고 이미지에서 도출된 지침입니다. UI 작업은 이 기준을 따릅니다. 원본 이미지는 `assets/references/` 에 있습니다.",
    localProjectsTitle: "참고 로컬 프로젝트",
    localProjectsIntro:
      "사용자의 로컬 디스크에 **이미 존재하는** 코드베이스입니다.\n이 계획은 처음부터 만드는 것이 아니라 아래 프로젝트를 이어받아 확장하는 것을 전제로 합니다. 작업 전에 실제 경로를 열어 현재 상태를 먼저 확인하세요.",
    files: "파일",
    partiallyScanned: "일부만 스캔됨",
    directoryTree: "디렉터리 구조",
    readmeExcerpt: "README 발췌",
    teardownTitle: "역설계 배경",
    analysisTarget: "분석 대상",
    newConcept: "새 개념",
    positioning: "포지셔닝",
    originalFaultLines: "원본의 개선 지점",
    evidence: "근거",
    opportunity: "기회",
    differentiators: "차별화 기능",
    originalWay: "기존 방식",
    ourWay: "새 방식",
    divergenceScore: "차별화 점수",
    legalNote: "법적 주의",
  },
  assets: {
    title: "참고 이미지",
    intro:
      "사용자가 첨부한 인터페이스/디자인 참고 이미지입니다.\nUI를 만들 때 이 이미지의 레이아웃·구성·톤앤매너를 기준으로 삼으세요.",
  },
  scripts: {
    header: (agent) => `BuildPlanner 자율 루프 러너 (${agent})`,
    headerNote:
      "매 반복마다 새 컨텍스트로 loop/RALPH.md를 전달한다. 상태는 대화가 아니라 파일에 남는다.",
    iterationFailed: (n) => `(반복 ${n} 실패 - 다음 반복에서 이어서 시도합니다)`,
    allDone: "모든 스펙 완료. 루프를 종료합니다.",
    testFailed: "(테스트 실패 - 다음 반복의 작업으로 넘깁니다)",
    verifyComment: "검증은 루프의 브레이크. 실패해도 멈추지 않고 다음 반복이 고치게 한다.",
  },
};

const ja: Omit<KitStrings, "language"> = {
  ...en,
  ralphIntro: "以下の手順を正確に守り、1回の反復（イテレーション）を実行せよ。",
  ralphRules: "ルール:",
  ralphSteps: (test, lint) => [
    "`loop/GOAL.md` と `loop/PROGRESS.md` を読み、現在の状態を把握する。",
    "`specs/INDEX.md` から、状態が TODO または DOING のスペックのうち **優先度が最も高いもの1件** を選ぶ。",
    "そのスペックファイルと `context/` の文書を読む。",
    "そのスペック1件だけを実装する。範囲を超える作業はしない。",
    `\`${test}\` と \`${lint}\` を実行して通す。`,
    "スペックの Acceptance Criteria を1つずつ照合し、**実際に満たしたか自分で検証**する。",
    "`loop/PROGRESS.md` に実施内容・検証結果・次の作業を追記し、`specs/INDEX.md` の状態を更新する。",
    "コミットする。メッセージは `<SPEC-ID>: <一行要約>`。",
    "すべてのスペックが DONE で `loop/GOAL.md` の DONE 条件をすべて満たしたら、`loop/PROGRESS.md` の最終行に `ALL-SPECS-DONE` と記録する。",
  ],
  ralphFooter: (agent) =>
    `このファイルは ${agent} にそのまま渡される **1反復分のプロンプト** です。\n\`scripts/loop.sh\` または \`scripts/loop.ps1\` が毎回新しいコンテキストでこれを渡します。\n長い会話1本で開発せず、短い反復を何度も回してください。状態は会話ではなくファイルにあります。`,
  loop: {
    ...en.loop,
    goalTitle: "GOAL — 何を、どこまで",
    goalIntro:
      "ループエンジニアリングの核心：人は **HOW を指示しない**。WHAT と DONE 条件だけを定義し、エージェントが判断 → 実装 → 検証 → 修正のループを自ら回す。",
    done: "DONE（完了条件）",
    doNot: "してはいけないこと",
    doNotItems: [
      "スペックにない機能の追加",
      "テストを削除・スキップして通すこと",
      "失敗したまま反復を終えること",
      "進捗を会話の記憶だけに残すこと（必ず `loop/PROGRESS.md` に記録）",
    ],
    verifyCommands: "検証コマンド",
    originalIdea: "元のアイデア",
    difficulty: "難易度",
    progressIntro:
      "**プロジェクトの記憶が住む場所。** エージェントのコンテキストは毎回消えるが、このファイルは残る。新しい反復は必ずこれを先に読み、反復の終わりに1ブロック追記する。",
    currentState: "現在の状態",
    activeSpec: "対象スペック",
    completed: "完了",
    lastVerified: "最終検証",
    notRunYet: "（未実行）",
    log: "ログ",
    initialised: "[初期化] キット生成",
    specsCreated: (n) => `スペック ${n} 件を生成`,
    nextTask: "次の作業",
    evaluatorTitle: "EVALUATOR — Generator ⇄ Evaluator チェックリスト",
    evaluatorIntro:
      "作った本人が合格判定を出すと、ループは静かに壊れる。実装（Generator）のたびに **別のコンテキスト/セッション** でこの手順により判定する。",
    procedure: "手順",
    evaluatorSteps: [
      "対象スペックの Acceptance Criteria を1つずつ読む。",
      "各項目を **実行結果** で確認する。コードを読んで「動きそう」は根拠にしない。",
      "以下のコマンドを自分で実行する。",
      "次の形式でのみ判定を残す。",
    ],
    verdictPrinciples: "判定の原則",
    verdictPrincipleItems: [
      "疑わしければ **FAIL**。",
      "テストがなく確認できない場合は FAIL。（まずテストを要求する）",
      "スペック範囲外の変更が混ざっていれば FAIL。",
      "PASS のときだけ `specs/INDEX.md` の状態を DONE にする。",
    ],
  },
  specs: {
    ...en.specs,
    indexTitle: "スペック一覧",
    indexIntro:
      "エージェントは毎回、この表から **状態が TODO/DOING のうち優先度が最も高いスペック1件** を選ぶ。\nスペックを終えたら、この表の状態を自分で更新する。（TODO → DOING → DONE）",
    title: "タイトル",
    priority: "優先度",
    dependsOn: "先行",
    status: "状態",
    file: "ファイル",
    firstTask: "最初の作業",
    state: "状態",
    acceptanceNote:
      "すべてのチェックが埋まって初めてこのスペックは DONE。推測ではなく **実行結果** で確認する。",
    outOfScopeDefault: "このスペックに明記されていないすべて",
    workLog: "作業ログ",
    workLogHint: "エージェントはこのスペックを扱うたびに1行ずつ追記する",
    seeSpecBody: "（スペック本文を参照）",
    none: "なし",
  },
  memory: {
    ...en.memory,
    intro: (agent, keyword, model) =>
      `このファイルは ${agent} がセッション開始時に自動で読むプロジェクトメモリです。\nBuildPlanner が「${keyword}」の分析結果から生成しました。（対象モデル: ${model}）`,
    howItWorks: "このリポジトリの動作方式",
    path: "パス",
    role: "役割",
    roles: {
      goal: "最終目標（WHAT）と完了条件（DONE）",
      progress: "プロジェクトの記憶。毎回読み、毎回記録",
      ralph: "1反復分の実行プロンプト",
      evaluator: "独立検証（Generator ⇄ Evaluator）の手順",
      index: "スペック一覧と状態（TODO / DOING / DONE）",
      specFiles: "個別スペック。真実の source",
      context: "アーキテクチャ・技術スタック・リスク・参考資料",
      plan: "元の開発計画書 全文",
    },
    everySession: "毎セッション開始時",
    sessionSteps: (test) => [
      "`loop/GOAL.md` → `loop/PROGRESS.md` → `specs/INDEX.md` の順に読む。",
      "次に取り組むスペックを **1つ** 選ぶ。",
      `実装 → \`${test}\` → Acceptance Criteria 照合 → \`loop/PROGRESS.md\` に記録。`,
    ],
    commands: "コマンド",
    devServer: "開発サーバー",
    tests: "テスト（すべての検証の基準）",
    lint: "リント",
    build: "ビルド",
    techStack: "技術スタック",
    area: "領域",
    technology: "技術",
    rules: "ルール",
    designGuidelines: "デザイン指針（参考画像に基づく）",
    referenceImages: "参考画像",
    userRequirements: "ユーザー添付の要件",
    requirementPriority: "この文書の要件が他の判断より優先される。",
    existingProjects: "引き継ぐ既存プロジェクト",
    existingProjectsNote:
      "これは新規プロジェクトではなく、以下のコードベースの拡張である。実装前に実際のパスを開いて現状を確認する。",
    seeLocalProjects: "詳細な構造は `context/local-projects.md` を参照。",
  },
  readme: {
    ...en.readme,
    intro:
      "BuildPlanner が生成した **開発スターターキット** です。展開してこのフォルダをそのままエージェントに開かせてください。",
    quickStart: "クイックスタート",
    runOnce: "1) 1回だけ実行",
    runLoop: "2) ループで回す（既定10回）",
    cliNote: (cli) =>
      `\`${cli}\` CLI のフラグはバージョンによって異なります。スクリプト冒頭のコマンドだけ書き換えてください。`,
    folderStructure: "フォルダ構成",
    memoryFileComment: "エージェントが自動で読むプロジェクトメモリ",
    howItWorks: "動作原理",
    humanRole:
      "人がやることは **目標と完了条件を定義し、結果をレビューすること**。\n「どうやるか」はエージェントがループを回して自ら見つけます。",
    buildInfo: "生成情報",
    originalIdea: "元のアイデア",
    targetAgent: "対象エージェント",
    memoryFileLabel: "メモリファイル",
    analysisModel: "分析モデル",
    specCount: "スペック数",
  },
  context: {
    ...en.context,
    architecture: "アーキテクチャ",
    overview: "概要",
    proposedTree: "推奨ディレクトリ構成",
    phases: "開発フェーズ",
    coreTech: "コア技術",
    techStackTitle: "技術スタック",
    commandsTitle: "コマンド",
    purpose: "目的",
    command: "コマンド",
    dev: "開発",
    test: "テスト",
    lint: "リント",
    build: "ビルド",
    packageManager: "パッケージマネージャ",
    runtime: "ランタイム",
    risksTitle: "リスクとライセンス",
    risks: "リスク",
    mitigation: "対応",
    noRisks: "_特定されたリスクなし_",
    licenseNotes: "ライセンス注意事項",
    referencesTitle: "参考資料",
    referencesIntro: "計画書作成時に収集したソースです。実装で詰まったらここから確認してください。",
    openSourceRefs: "参考オープンソース",
    collectedSources: (n) => `収集ソース（上位 ${n} 件）`,
    noSources: "_収集ソースなし_",
    similarServices: "類似サービス",
    designTitle: "デザイン指針",
    designIntro:
      "ユーザーが添付した参考画像から導いた指針です。UI 作業はこれに従います。元画像は `assets/references/` にあります。",
    localProjectsTitle: "参照ローカルプロジェクト",
    localProjectsIntro:
      "ユーザーのローカルディスクに **すでに存在する** コードベースです。\nこの計画はゼロから作るのではなく、以下を引き継いで拡張する前提です。作業前に実際のパスを開いて現状を確認してください。",
    files: "ファイル",
    partiallyScanned: "一部のみスキャン",
    directoryTree: "ディレクトリ構造",
    readmeExcerpt: "README 抜粋",
    teardownTitle: "リバースエンジニアリングの背景",
    analysisTarget: "分析対象",
    newConcept: "新コンセプト",
    positioning: "ポジショニング",
    originalFaultLines: "原製品の改善点",
    evidence: "根拠",
    opportunity: "機会",
    differentiators: "差別化機能",
    originalWay: "従来の方式",
    ourWay: "新しい方式",
    divergenceScore: "差別化スコア",
    legalNote: "法的注意",
  },
  assets: {
    title: "参考画像",
    intro:
      "ユーザーが添付したインターフェース／デザインの参考画像です。\nUI を作る際は、これらのレイアウト・構成・トーンを基準にしてください。",
  },
  scripts: {
    ...en.scripts,
    header: (agent) => `BuildPlanner 自律ループランナー (${agent})`,
    headerNote:
      "毎回新しいコンテキストで loop/RALPH.md を渡す。状態は会話ではなくファイルに残る。",
    iterationFailed: (n) => `(反復 ${n} 失敗 - 次の反復で継続します)`,
    allDone: "すべてのスペックが完了。ループを終了します。",
    testFailed: "(テスト失敗 - 次の反復の作業に回します)",
    verifyComment: "検証はループのブレーキ。失敗しても止めず、次の反復で直させる。",
  },
};

const zh: Omit<KitStrings, "language"> = {
  ...en,
  ralphIntro: "严格按以下顺序执行一次迭代。",
  ralphRules: "规则:",
  ralphSteps: (test, lint) => [
    "阅读 `loop/GOAL.md` 与 `loop/PROGRESS.md`，掌握当前状态。",
    "从 `specs/INDEX.md` 中，在状态为 TODO 或 DOING 的规格里挑出 **优先级最高的一条**。",
    "阅读该规格文件与 `context/` 下的文档。",
    "只实现这一条规格，不做超出范围的工作。",
    `运行 \`${test}\` 和 \`${lint}\` 并使其通过。`,
    "逐条核对规格的 Acceptance Criteria，**自行验证是否真正达成**。",
    "在 `loop/PROGRESS.md` 追加所做的事、验证结果与下一步，并更新 `specs/INDEX.md` 的状态。",
    "提交。提交信息为 `<SPEC-ID>: <一行摘要>`。",
    "当全部规格为 DONE 且满足 `loop/GOAL.md` 的全部 DONE 条件时，在 `loop/PROGRESS.md` 最后一行写入 `ALL-SPECS-DONE`。",
  ],
  ralphFooter: (agent) =>
    `本文件是原样传给 ${agent} 的 **单次迭代提示词**。\n\`scripts/loop.sh\` 或 \`scripts/loop.ps1\` 会在每次迭代以全新上下文重新传入。\n不要用一段长对话开发，而要多跑短迭代——状态在文件里，不在对话里。`,
  loop: {
    ...en.loop,
    goalTitle: "GOAL — 做什么，做到哪",
    goalIntro:
      "循环工程的核心：人 **不指示 HOW**。只定义 WHAT 与 DONE 条件，由智能体自行运转判断 → 实现 → 验证 → 修正的循环。",
    done: "DONE（完成条件）",
    doNot: "不可以做的事",
    doNotItems: [
      "添加规格之外的功能",
      "删除或跳过测试来让它通过",
      "在失败状态下结束迭代",
      "只把进度留在对话记忆里（必须写入 `loop/PROGRESS.md`）",
    ],
    verifyCommands: "验证命令",
    originalIdea: "原始想法",
    difficulty: "难度",
    progressIntro:
      "**项目记忆所在之处。** 智能体的上下文每次迭代都会消失，但这个文件会留下。每次新迭代都先读它，并在结束时追加一段。",
    currentState: "当前状态",
    activeSpec: "当前规格",
    completed: "已完成",
    lastVerified: "最近验证",
    notRunYet: "（尚未运行）",
    log: "日志",
    initialised: "[初始化] 已生成开发套件",
    specsCreated: (n) => `已生成 ${n} 条规格`,
    nextTask: "下一步",
    evaluatorTitle: "EVALUATOR — Generator ⇄ Evaluator 检查表",
    evaluatorIntro:
      "如果由实现者自己判定合格，循环会悄悄失效。每次实现（Generator）结束后，在 **另一个上下文/会话** 中按此流程判定。",
    procedure: "流程",
    evaluatorSteps: [
      "逐条阅读目标规格的 Acceptance Criteria。",
      "用 **执行结果** 确认每一条。读代码后觉得「应该可以」不算依据。",
      "亲自运行下列命令。",
      "只按以下格式记录判定。",
    ],
    verdictPrinciples: "判定原则",
    verdictPrincipleItems: [
      "存疑即 **FAIL**。",
      "没有测试因而无法确认，判 FAIL。（先要求补测试）",
      "混入了超出规格范围的改动，判 FAIL。",
      "只有 PASS 时才把 `specs/INDEX.md` 的状态改为 DONE。",
    ],
  },
  specs: {
    ...en.specs,
    indexTitle: "规格索引",
    indexIntro:
      "智能体每次迭代都从此表中挑出 **状态为 TODO/DOING 且优先级最高的一条规格**。\n完成后由智能体自行更新此表状态。（TODO → DOING → DONE）",
    title: "标题",
    priority: "优先级",
    dependsOn: "前置",
    status: "状态",
    file: "文件",
    firstTask: "首个任务",
    state: "状态",
    acceptanceNote:
      "所有复选框都勾上，这条规格才算 DONE。以 **执行结果** 确认，而非推测。",
    outOfScopeDefault: "本规格未写明的一切",
    workLog: "工作日志",
    workLogHint: "智能体每次处理该规格时追加一行",
    seeSpecBody: "（见规格正文）",
    none: "无",
  },
  memory: {
    ...en.memory,
    intro: (agent, keyword, model) =>
      `本文件是 ${agent} 在会话开始时自动读取的项目记忆。\n由 BuildPlanner 根据对「${keyword}」的分析生成。（目标模型: ${model}）`,
    howItWorks: "本仓库的运作方式",
    path: "路径",
    role: "作用",
    roles: {
      goal: "最终目标（WHAT）与完成条件（DONE）",
      progress: "项目的记忆。每次迭代读取，每次迭代记录",
      ralph: "单次迭代的执行提示词",
      evaluator: "独立验证（Generator ⇄ Evaluator）流程",
      index: "规格列表与状态（TODO / DOING / DONE）",
      specFiles: "各条规格。事实来源",
      context: "架构·技术栈·风险·参考资料",
      plan: "原始开发计划书全文",
    },
    everySession: "每次会话开始时",
    sessionSteps: (test) => [
      "按 `loop/GOAL.md` → `loop/PROGRESS.md` → `specs/INDEX.md` 的顺序阅读。",
      "选出接下来要做的 **一条** 规格。",
      `实现 → \`${test}\` → 核对 Acceptance Criteria → 记录到 \`loop/PROGRESS.md\`。`,
    ],
    commands: "命令",
    devServer: "开发服务器",
    tests: "测试（一切验证的基准）",
    lint: "代码检查",
    build: "构建",
    techStack: "技术栈",
    area: "领域",
    technology: "技术",
    rules: "规则",
    designGuidelines: "设计规范（基于参考图片）",
    referenceImages: "参考图片",
    userRequirements: "用户提供的需求",
    requirementPriority: "该文档的需求优先于其他判断。",
    existingProjects: "要继承的既有项目",
    existingProjectsNote:
      "这不是新项目，而是对下列代码库的扩展。实现前请打开真实路径确认当前状态。",
    seeLocalProjects: "详细结构见 `context/local-projects.md`。",
  },
  readme: {
    ...en.readme,
    intro: "由 BuildPlanner 生成的 **开发启动套件**。解压后把这个文件夹直接交给智能体即可。",
    quickStart: "快速开始",
    runOnce: "1) 只跑一次",
    runLoop: "2) 持续循环（默认 10 次）",
    cliNote: (cli) => `\`${cli}\` CLI 的参数因版本而异。只需改脚本开头的命令即可。`,
    folderStructure: "目录结构",
    memoryFileComment: "智能体自动读取的项目记忆",
    howItWorks: "运作原理",
    humanRole:
      "人要做的是 **定义目标与完成条件，并复核结果**，\n「怎么做」由智能体在循环中自行找到。",
    buildInfo: "生成信息",
    originalIdea: "原始想法",
    targetAgent: "目标智能体",
    memoryFileLabel: "记忆文件",
    analysisModel: "分析模型",
    specCount: "规格数",
  },
  context: {
    ...en.context,
    architecture: "架构",
    overview: "概述",
    proposedTree: "建议目录结构",
    phases: "开发阶段",
    coreTech: "核心技术",
    techStackTitle: "技术栈",
    commandsTitle: "命令",
    purpose: "用途",
    command: "命令",
    dev: "开发",
    test: "测试",
    lint: "检查",
    build: "构建",
    packageManager: "包管理器",
    runtime: "运行时",
    risksTitle: "风险与许可证",
    risks: "风险",
    mitigation: "应对",
    noRisks: "_未识别到风险_",
    licenseNotes: "许可证注意事项",
    referencesTitle: "参考资料",
    referencesIntro: "撰写计划书时收集的来源。实现受阻时先从这里查。",
    openSourceRefs: "参考开源项目",
    collectedSources: (n) => `收集来源（前 ${n} 条）`,
    noSources: "_未收集到来源_",
    similarServices: "同类服务",
    designTitle: "设计规范",
    designIntro:
      "从用户附上的参考图片中导出的规范。UI 工作依此执行。原图在 `assets/references/`。",
    localProjectsTitle: "引用的本地项目",
    localProjectsIntro:
      "用户本地磁盘上 **已经存在** 的代码库。\n本计划不是从零开始，而是以继承并扩展下列项目为前提。动手前请打开真实路径确认现状。",
    files: "文件",
    partiallyScanned: "仅部分扫描",
    directoryTree: "目录结构",
    readmeExcerpt: "README 摘录",
    teardownTitle: "逆向工程背景",
    analysisTarget: "分析对象",
    newConcept: "新概念",
    positioning: "定位",
    originalFaultLines: "原产品的改进点",
    evidence: "依据",
    opportunity: "机会",
    differentiators: "差异化功能",
    originalWay: "原有做法",
    ourWay: "新做法",
    divergenceScore: "差异化评分",
    legalNote: "法律提示",
  },
  assets: {
    title: "参考图片",
    intro:
      "用户附上的界面／设计参考图片。\n制作 UI 时请以这些图片的布局、构成与调性为基准。",
  },
  scripts: {
    ...en.scripts,
    header: (agent) => `BuildPlanner 自主循环运行器 (${agent})`,
    headerNote: "每次迭代以全新上下文传入 loop/RALPH.md。状态留在文件里，而非对话里。",
    iterationFailed: (n) => `(第 ${n} 次迭代失败 - 下次迭代将继续)`,
    allDone: "所有规格已完成。结束循环。",
    testFailed: "(测试失败 - 交给下一次迭代处理)",
    verifyComment: "验证是循环的刹车。失败也不停止，由下一次迭代修复。",
  },
};

const fr: Omit<KitStrings, "language"> = {
  ...en,
  ralphIntro: "Effectue exactement une itération, dans cet ordre.",
  ralphRules: "Règles :",
  ralphSteps: (test, lint) => [
    "Lis `loop/GOAL.md` et `loop/PROGRESS.md` pour établir l'état actuel.",
    "Dans `specs/INDEX.md`, choisis **la spec la plus prioritaire** dont le statut est TODO ou DOING.",
    "Lis ce fichier de spec et les documents de `context/`.",
    "N'implémente que cette seule spec. Ne dépasse pas son périmètre.",
    `Lance \`${test}\` et \`${lint}\` et fais-les passer.`,
    "Reprends les Acceptance Criteria un par un et **vérifie toi-même que chacun est réellement satisfait**.",
    "Ajoute à `loop/PROGRESS.md` ce que tu as fait, le résultat de vérification et la tâche suivante, puis mets à jour le statut dans `specs/INDEX.md`.",
    "Commite. Message : `<SPEC-ID> : <résumé en une ligne>`.",
    "Quand toutes les specs sont DONE et que toutes les conditions de `loop/GOAL.md` sont remplies, écris `ALL-SPECS-DONE` en dernière ligne de `loop/PROGRESS.md`.",
  ],
  ralphFooter: (agent) =>
    `Ce fichier est le **prompt d'une itération**, transmis tel quel à ${agent}.\n\`scripts/loop.sh\` ou \`scripts/loop.ps1\` le renvoie dans un contexte neuf à chaque itération.\nNe développe pas dans une seule longue conversation : enchaîne des itérations courtes — l'état vit dans les fichiers, pas dans le chat.`,
  loop: {
    ...en.loop,
    goalTitle: "GOAL — quoi, et jusqu'où",
    goalIntro:
      "Le cœur du loop engineering : l'humain **ne dicte pas le COMMENT**. Il définit le QUOI et les conditions DONE, et l'agent fait tourner seul la boucle juger → implémenter → vérifier → corriger.",
    done: "DONE (critères d'achèvement)",
    doNot: "À ne pas faire",
    doNotItems: [
      "Ajouter des fonctionnalités absentes des specs",
      "Supprimer ou ignorer des tests pour les faire passer",
      "Terminer une itération avec quelque chose en échec",
      "Garder l'avancement seulement dans la conversation (toujours l'écrire dans `loop/PROGRESS.md`)",
    ],
    verifyCommands: "Commandes de vérification",
    originalIdea: "Idée d'origine",
    difficulty: "Difficulté",
    progressIntro:
      "**Là où vit la mémoire du projet.** Le contexte de l'agent disparaît à chaque itération, ce fichier non. Chaque nouvelle itération le lit d'abord et y ajoute un bloc à la fin.",
    currentState: "État actuel",
    activeSpec: "Spec en cours",
    completed: "Terminées",
    lastVerified: "Dernière vérification",
    notRunYet: "(pas encore exécuté)",
    log: "Journal",
    initialised: "[init] kit créé",
    specsCreated: (n) => `${n} specs créées`,
    nextTask: "Tâche suivante",
    evaluatorTitle: "EVALUATOR — checklist Generator ⇄ Evaluator",
    evaluatorIntro:
      "Si celui qui construit prononce aussi le verdict, la boucle pourrit en silence. Après chaque implémentation (Generator), juge dans un **contexte/session distinct** avec cette procédure.",
    procedure: "Procédure",
    evaluatorSteps: [
      "Lis les Acceptance Criteria de la spec, un par un.",
      "Confirme chacun par un **résultat d'exécution**. Lire le code et conclure « ça devrait marcher » ne compte pas.",
      "Lance toi-même les commandes ci-dessous.",
      "Consigne le verdict exactement sous cette forme.",
    ],
    verdictPrinciples: "Principes de jugement",
    verdictPrincipleItems: [
      "Dans le doute, c'est **FAIL**.",
      "S'il n'y a pas de test et donc aucun moyen de confirmer, c'est FAIL. (Exige d'abord le test.)",
      "Si des changements hors périmètre sont mélangés, c'est FAIL.",
      "Le statut dans `specs/INDEX.md` ne passe à DONE qu'en cas de PASS.",
    ],
  },
  specs: {
    ...en.specs,
    indexTitle: "Index des specs",
    indexIntro:
      "À chaque itération, l'agent choisit dans ce tableau **la spec la plus prioritaire au statut TODO/DOING**.\nUne fois la spec finie, il met lui-même le tableau à jour. (TODO → DOING → DONE)",
    title: "Titre",
    priority: "Priorité",
    dependsOn: "Dépend de",
    status: "Statut",
    file: "Fichier",
    firstTask: "Première tâche",
    state: "Statut",
    acceptanceNote:
      "Toutes les cases doivent être cochées pour que la spec soit DONE. Confirme par des **résultats d'exécution**, pas des suppositions.",
    outOfScopeDefault: "Tout ce qui n'est pas indiqué dans cette spec",
    workLog: "Journal de travail",
    workLogHint: "l'agent ajoute une ligne à chaque passage sur cette spec",
    seeSpecBody: "(voir le corps de la spec)",
    none: "aucune",
  },
  memory: {
    ...en.memory,
    intro: (agent, keyword, model) =>
      `Ce fichier est la mémoire projet que ${agent} lit automatiquement au début d'une session.\nGénéré par BuildPlanner à partir de l'analyse de « ${keyword} ». (modèle : ${model})`,
    howItWorks: "Comment fonctionne ce dépôt",
    path: "Chemin",
    role: "Rôle",
    roles: {
      goal: "Objectif final (QUOI) et conditions d'achèvement (DONE)",
      progress: "La mémoire du projet. Lue à chaque itération, écrite à chaque itération",
      ralph: "Le prompt d'une itération",
      evaluator: "Procédure de vérification indépendante (Generator ⇄ Evaluator)",
      index: "Liste des specs et statuts (TODO / DOING / DONE)",
      specFiles: "Specs individuelles. La source de vérité",
      context: "Architecture, stack technique, risques, références",
      plan: "Le plan de développement d'origine, intégral",
    },
    everySession: "Au début de chaque session",
    sessionSteps: (test) => [
      "Lis `loop/GOAL.md` → `loop/PROGRESS.md` → `specs/INDEX.md`, dans cet ordre.",
      "Choisis **une** spec à traiter.",
      `Implémente → \`${test}\` → contrôle des Acceptance Criteria → note dans \`loop/PROGRESS.md\`.`,
    ],
    commands: "Commandes",
    devServer: "serveur de dev",
    tests: "tests (la base de toute vérification)",
    lint: "lint",
    build: "build",
    techStack: "Stack technique",
    area: "Domaine",
    technology: "Technologie",
    rules: "Règles",
    designGuidelines: "Directives de design (d'après les images de référence)",
    referenceImages: "Images de référence",
    userRequirements: "Exigences fournies par l'utilisateur",
    requirementPriority: "les exigences de ce document priment sur tout autre jugement.",
    existingProjects: "Projets existants à poursuivre",
    existingProjectsNote:
      "Ce n'est pas un nouveau projet mais l'extension des bases de code ci-dessous. Ouvre les chemins réels et vérifie leur état avant d'implémenter.",
    seeLocalProjects: "Voir `context/local-projects.md` pour la structure complète.",
  },
  readme: {
    ...en.readme,
    intro:
      "Un **kit de démarrage de développement** généré par BuildPlanner. Décompresse-le et confie le dossier tel quel à ton agent.",
    quickStart: "Démarrage rapide",
    runOnce: "1) lancer une seule itération",
    runLoop: "2) boucler (10 itérations par défaut)",
    cliNote: (cli) =>
      `Les options du CLI \`${cli}\` varient selon la version. Ne modifie que la commande en tête des scripts.`,
    folderStructure: "Structure des dossiers",
    memoryFileComment: "mémoire projet lue automatiquement par l'agent",
    howItWorks: "Principe de fonctionnement",
    humanRole:
      "Le rôle humain est de **définir l'objectif et les conditions d'achèvement, puis de relire le résultat**.\nLe « comment » est ce que l'agent trouve en faisant tourner la boucle.",
    buildInfo: "Informations de génération",
    originalIdea: "Idée d'origine",
    targetAgent: "Agent cible",
    memoryFileLabel: "fichier mémoire",
    analysisModel: "Modèle d'analyse",
    specCount: "Nombre de specs",
  },
  context: {
    ...en.context,
    architecture: "Architecture",
    overview: "Vue d'ensemble",
    proposedTree: "Arborescence proposée",
    phases: "Phases de développement",
    coreTech: "Technologies clés",
    techStackTitle: "Stack technique",
    commandsTitle: "Commandes",
    purpose: "Objet",
    command: "Commande",
    dev: "Développer",
    test: "Tester",
    lint: "Linter",
    build: "Construire",
    packageManager: "Gestionnaire de paquets",
    runtime: "Runtime",
    risksTitle: "Risques et licences",
    risks: "Risques",
    mitigation: "Atténuation",
    noRisks: "_Aucun risque identifié_",
    licenseNotes: "Remarques sur les licences",
    referencesTitle: "Références",
    referencesIntro:
      "Sources collectées lors de la rédaction du plan. En cas de blocage, commence par là.",
    openSourceRefs: "Open source de référence",
    collectedSources: (n) => `Sources collectées (${n} premières)`,
    noSources: "_Aucune source collectée_",
    similarServices: "Services similaires",
    designTitle: "Directives de design",
    designIntro:
      "Déduites des images de référence jointes par l'utilisateur. Le travail UI les suit. Les images d'origine sont dans `assets/references/`.",
    localProjectsTitle: "Projets locaux référencés",
    localProjectsIntro:
      "Bases de code qui **existent déjà** sur le disque local de l'utilisateur.\nCe plan suppose que tu les prolonges plutôt que de repartir de zéro. Ouvre les chemins réels et vérifie leur état avant de travailler.",
    files: "fichiers",
    partiallyScanned: "partiellement scanné",
    directoryTree: "Arborescence",
    readmeExcerpt: "Extrait du README",
    teardownTitle: "Contexte du teardown",
    analysisTarget: "Sujet",
    newConcept: "Nouveau concept",
    positioning: "Positionnement",
    originalFaultLines: "Points de tension de l'original",
    evidence: "Preuve",
    opportunity: "Opportunité",
    differentiators: "Fonctionnalités différenciantes",
    originalWay: "Approche d'origine",
    ourWay: "Nouvelle approche",
    divergenceScore: "Score de différenciation",
    legalNote: "Notes juridiques",
  },
  assets: {
    title: "Images de référence",
    intro:
      "Références d'interface/design jointes par l'utilisateur.\nAppuie-toi sur leur mise en page, leur composition et leur tonalité pour construire l'UI.",
  },
  scripts: {
    ...en.scripts,
    header: (agent) => `Runner de boucle autonome BuildPlanner (${agent})`,
    headerNote:
      "Chaque itération transmet loop/RALPH.md dans un contexte neuf. L'état vit dans les fichiers, pas dans la conversation.",
    iterationFailed: (n) => `(itération ${n} en échec - la suivante reprendra)`,
    allDone: "Toutes les specs sont terminées. Fin de la boucle.",
    testFailed: "(tests en échec - transmis à l'itération suivante)",
    verifyComment:
      "La vérification est le frein de la boucle. Un échec ne l'arrête pas ; l'itération suivante corrige.",
  },
};

const ru: Omit<KitStrings, "language"> = {
  ...en,
  ralphIntro: "Выполни ровно одну итерацию в указанном порядке.",
  ralphRules: "Правила:",
  ralphSteps: (test, lint) => [
    "Прочитай `loop/GOAL.md` и `loop/PROGRESS.md`, чтобы понять текущее состояние.",
    "В `specs/INDEX.md` выбери **одну спецификацию с наивысшим приоритетом** со статусом TODO или DOING.",
    "Прочитай этот файл спецификации и документы из `context/`.",
    "Реализуй только её. Не выходи за рамки.",
    `Запусти \`${test}\` и \`${lint}\` и добейся их прохождения.`,
    "Пройди Acceptance Criteria по пунктам и **сам проверь, что каждый действительно выполнен**.",
    "Допиши в `loop/PROGRESS.md` сделанное, результат проверки и следующую задачу, обнови статус в `specs/INDEX.md`.",
    "Сделай коммит с сообщением `<SPEC-ID>: <краткое описание>`.",
    "Когда все спецификации DONE и выполнены все условия из `loop/GOAL.md`, запиши `ALL-SPECS-DONE` последней строкой в `loop/PROGRESS.md`.",
  ],
  ralphFooter: (agent) =>
    `Этот файл — **промпт одной итерации**, передаваемый в ${agent} как есть.\n\`scripts/loop.sh\` или \`scripts/loop.ps1\` заново передаёт его в чистом контексте на каждой итерации.\nНе разрабатывайте в одном длинном диалоге — делайте много коротких итераций: состояние живёт в файлах, а не в переписке.`,
  loop: {
    ...en.loop,
    goalTitle: "GOAL — что и до какого предела",
    goalIntro:
      "Суть loop engineering: человек **не диктует КАК**. Он задаёт ЧТО и условия DONE, а агент сам крутит цикл решить → реализовать → проверить → исправить.",
    done: "DONE (условия завершения)",
    doNot: "Чего делать нельзя",
    doNotItems: [
      "Добавлять функции, которых нет в спецификациях",
      "Удалять или пропускать тесты, чтобы они «прошли»",
      "Завершать итерацию с чем-то незелёным",
      "Держать прогресс только в диалоге (всегда записывайте в `loop/PROGRESS.md`)",
    ],
    verifyCommands: "Команды проверки",
    originalIdea: "Исходная идея",
    difficulty: "Сложность",
    progressIntro:
      "**Здесь живёт память проекта.** Контекст агента исчезает каждую итерацию, а этот файл остаётся. Новая итерация сначала читает его и в конце дописывает блок.",
    currentState: "Текущее состояние",
    activeSpec: "Активная спецификация",
    completed: "Завершено",
    lastVerified: "Последняя проверка",
    notRunYet: "(ещё не запускалось)",
    log: "Журнал",
    initialised: "[инициализация] набор создан",
    specsCreated: (n) => `создано спецификаций: ${n}`,
    nextTask: "Следующая задача",
    evaluatorTitle: "EVALUATOR — чек-лист Generator ⇄ Evaluator",
    evaluatorIntro:
      "Если тот, кто написал код, сам же выносит вердикт, цикл тихо разваливается. После каждой реализации (Generator) выносите вердикт в **отдельном контексте/сессии** по этой процедуре.",
    procedure: "Процедура",
    evaluatorSteps: [
      "Прочитайте Acceptance Criteria спецификации по пунктам.",
      "Подтвердите каждый **результатом запуска**. «Судя по коду, должно работать» — не основание.",
      "Сами выполните команды ниже.",
      "Зафиксируйте вердикт строго в таком виде.",
    ],
    verdictPrinciples: "Принципы вердикта",
    verdictPrincipleItems: [
      "Есть сомнения — значит **FAIL**.",
      "Нет теста и подтвердить нечем — FAIL. (Сначала требуйте тест.)",
      "Примешаны изменения вне рамок спецификации — FAIL.",
      "Статус в `specs/INDEX.md` становится DONE только при PASS.",
    ],
  },
  specs: {
    ...en.specs,
    indexTitle: "Указатель спецификаций",
    indexIntro:
      "Каждую итерацию агент выбирает из этой таблицы **одну спецификацию с наивысшим приоритетом в статусе TODO/DOING**.\nЗакончив, он сам обновляет статус. (TODO → DOING → DONE)",
    title: "Название",
    priority: "Приоритет",
    dependsOn: "Зависит от",
    status: "Статус",
    file: "Файл",
    firstTask: "Первая задача",
    state: "Статус",
    acceptanceNote:
      "Спецификация считается DONE только когда отмечены все пункты. Подтверждайте **результатами запуска**, а не предположениями.",
    outOfScopeDefault: "Всё, что не указано в этой спецификации",
    workLog: "Журнал работ",
    workLogHint: "агент дописывает строку каждый раз, когда берётся за эту спецификацию",
    seeSpecBody: "(см. текст спецификации)",
    none: "нет",
  },
  memory: {
    ...en.memory,
    intro: (agent, keyword, model) =>
      `Этот файл — память проекта, которую ${agent} читает автоматически в начале сессии.\nСоздано BuildPlanner по результатам анализа «${keyword}». (модель: ${model})`,
    howItWorks: "Как устроен этот репозиторий",
    path: "Путь",
    role: "Назначение",
    roles: {
      goal: "Конечная цель (ЧТО) и условия завершения (DONE)",
      progress: "Память проекта. Читается каждую итерацию и дополняется каждую итерацию",
      ralph: "Промпт одной итерации",
      evaluator: "Процедура независимой проверки (Generator ⇄ Evaluator)",
      index: "Список спецификаций и статусы (TODO / DOING / DONE)",
      specFiles: "Отдельные спецификации. Источник истины",
      context: "Архитектура, стек, риски, справочные материалы",
      plan: "Полный текст исходного плана разработки",
    },
    everySession: "В начале каждой сессии",
    sessionSteps: (test) => [
      "Прочитайте `loop/GOAL.md` → `loop/PROGRESS.md` → `specs/INDEX.md` именно в таком порядке.",
      "Выберите **одну** спецификацию для работы.",
      `Реализация → \`${test}\` → сверка Acceptance Criteria → запись в \`loop/PROGRESS.md\`.`,
    ],
    commands: "Команды",
    devServer: "dev-сервер",
    tests: "тесты (основа любой проверки)",
    lint: "линтер",
    build: "сборка",
    techStack: "Технологический стек",
    area: "Область",
    technology: "Технология",
    rules: "Правила",
    designGuidelines: "Рекомендации по дизайну (по приложенным изображениям)",
    referenceImages: "Справочные изображения",
    userRequirements: "Требования от пользователя",
    requirementPriority: "требования этого документа важнее прочих соображений.",
    existingProjects: "Существующие проекты для продолжения",
    existingProjectsNote:
      "Это не новый проект, а расширение перечисленных ниже кодовых баз. До реализации откройте реальные пути и проверьте текущее состояние.",
    seeLocalProjects: "Подробная структура — в `context/local-projects.md`.",
  },
  readme: {
    ...en.readme,
    intro:
      "**Стартовый набор для разработки**, созданный BuildPlanner. Распакуйте и передайте папку агенту как есть.",
    quickStart: "Быстрый старт",
    runOnce: "1) один прогон",
    runLoop: "2) цикл (по умолчанию 10 итераций)",
    cliNote: (cli) =>
      `Флаги CLI \`${cli}\` зависят от версии. При расхождении меняйте только команду в начале скриптов.`,
    folderStructure: "Структура папок",
    memoryFileComment: "память проекта, которую агент читает автоматически",
    howItWorks: "Как это работает",
    humanRole:
      "Задача человека — **определить цель и условия завершения и проверить результат**.\n«Как» агент находит сам, прокручивая цикл.",
    buildInfo: "Сведения о генерации",
    originalIdea: "Исходная идея",
    targetAgent: "Целевой агент",
    memoryFileLabel: "файл памяти",
    analysisModel: "Модель анализа",
    specCount: "Спецификаций",
  },
  context: {
    ...en.context,
    architecture: "Архитектура",
    overview: "Обзор",
    proposedTree: "Предлагаемая структура каталогов",
    phases: "Этапы разработки",
    coreTech: "Ключевые технологии",
    techStackTitle: "Технологический стек",
    commandsTitle: "Команды",
    purpose: "Назначение",
    command: "Команда",
    dev: "Разработка",
    test: "Тесты",
    lint: "Линтер",
    build: "Сборка",
    packageManager: "Менеджер пакетов",
    runtime: "Среда выполнения",
    risksTitle: "Риски и лицензии",
    risks: "Риски",
    mitigation: "Меры",
    noRisks: "_Риски не выявлены_",
    licenseNotes: "Замечания по лицензиям",
    referencesTitle: "Справочные материалы",
    referencesIntro:
      "Источники, собранные при подготовке плана. Если реализация застопорилась — начните отсюда.",
    openSourceRefs: "Опорные open source проекты",
    collectedSources: (n) => `Собранные источники (первые ${n})`,
    noSources: "_Источники не собраны_",
    similarServices: "Похожие сервисы",
    designTitle: "Рекомендации по дизайну",
    designIntro:
      "Выведены из приложенных пользователем изображений. UI следует им. Оригиналы — в `assets/references/`.",
    localProjectsTitle: "Указанные локальные проекты",
    localProjectsIntro:
      "Кодовые базы, которые **уже существуют** на локальном диске пользователя.\nПлан исходит из того, что вы продолжаете их, а не начинаете с нуля. Перед работой откройте реальные пути и проверьте состояние.",
    files: "файлов",
    partiallyScanned: "просканировано частично",
    directoryTree: "Структура каталогов",
    readmeExcerpt: "Фрагмент README",
    teardownTitle: "Контекст разбора",
    analysisTarget: "Объект анализа",
    newConcept: "Новая концепция",
    positioning: "Позиционирование",
    originalFaultLines: "Слабые места оригинала",
    evidence: "Обоснование",
    opportunity: "Возможность",
    differentiators: "Отличительные возможности",
    originalWay: "Прежний подход",
    ourWay: "Новый подход",
    divergenceScore: "Оценка отличия",
    legalNote: "Юридические замечания",
  },
  assets: {
    title: "Справочные изображения",
    intro:
      "Приложенные пользователем образцы интерфейса и дизайна.\nПри создании UI опирайтесь на их компоновку, состав и тональность.",
  },
  scripts: {
    ...en.scripts,
    header: (agent) => `Автономный цикл BuildPlanner (${agent})`,
    headerNote:
      "Каждая итерация передаёт loop/RALPH.md в чистом контексте. Состояние живёт в файлах, а не в переписке.",
    iterationFailed: (n) => `(итерация ${n} не удалась - следующая продолжит)`,
    allDone: "Все спецификации выполнены. Завершаем цикл.",
    testFailed: "(тесты не прошли - передаём следующей итерации)",
    verifyComment:
      "Проверка — тормоз цикла. Сбой его не останавливает: исправит следующая итерация.",
  },
};

const STRINGS: Record<AnalysisLanguage, Omit<KitStrings, "language">> = { en, ko, ja, zh, fr, ru };

export function kitStrings(language: AnalysisLanguage): KitStrings {
  return { ...(STRINGS[language] ?? en), language };
}

/**
 * Short labels for the agent-specific extras (slash-command front matter, Cursor rules).
 * Kept in their own table so the six large objects above stay readable; the bodies of
 * those files are composed from the strings above rather than duplicated here.
 */
export interface AgentExtraStrings {
  loopCommandDescription: string;
  statusCommandDescription: string;
  statusCommandBody: string;
  evaluatorAgentDescription: string;
  evaluatorRole: string;
  cursorRulesDescription: string;
  cursorLoopDescription: string;
  cursorRules: (testCommand: string) => string[];
}

const AGENT_EXTRAS: Record<AnalysisLanguage, AgentExtraStrings> = {
  en: {
    loopCommandDescription: "Run one loop iteration: pick a spec, implement, verify, record",
    statusCommandDescription: "Summarise current progress",
    statusCommandBody:
      "Read `loop/PROGRESS.md` and `specs/INDEX.md`, then summarise in a table how many specs are done / in progress / waiting, plus the single next task. Do not modify any code.",
    evaluatorAgentDescription:
      "Judges an implementation independently against the spec's Acceptance Criteria. Use right after implementing.",
    evaluatorRole: "You are the Evaluator. You **do not write code.** You only judge.",
    cursorRulesDescription: "Project ground rules",
    cursorLoopDescription: "Loop procedure",
    cursorRules: (test) => [
      "This repository is developed spec-first. The source of truth is `specs/`.",
      "Before working, read `loop/GOAL.md`, `loop/PROGRESS.md` and the relevant spec file.",
      `Implement one spec at a time and verify with \`${test}\` when done.`,
      "Record the result in `loop/PROGRESS.md`.",
    ],
  },
  ko: {
    loopCommandDescription: "스펙 하나를 골라 구현·검증·기록하는 루프 1회 실행",
    statusCommandDescription: "현재 진행 상태 요약",
    statusCommandBody:
      "`loop/PROGRESS.md`와 `specs/INDEX.md`를 읽고, 완료/진행/대기 스펙 수와 다음에 해야 할 작업 하나를 표로 요약하라. 코드는 수정하지 마라.",
    evaluatorAgentDescription:
      "구현 결과를 스펙의 Acceptance Criteria와 대조해 독립적으로 판정한다. 구현 직후 사용한다.",
    evaluatorRole: "너는 Evaluator다. 코드를 **작성하지 않는다.** 오직 판정만 한다.",
    cursorRulesDescription: "프로젝트 기본 규칙",
    cursorLoopDescription: "루프 실행 절차",
    cursorRules: (test) => [
      "이 저장소는 Spec 주도로 개발한다. 진실의 원천은 `specs/` 이다.",
      "작업 전 `loop/GOAL.md`, `loop/PROGRESS.md`, 해당 스펙 파일을 읽는다.",
      `한 번에 스펙 하나만 구현하고, 완료 후 \`${test}\`로 검증한다.`,
      "결과는 `loop/PROGRESS.md`에 기록한다.",
    ],
  },
  ja: {
    loopCommandDescription: "スペックを1件選び、実装・検証・記録するループを1回実行",
    statusCommandDescription: "現在の進捗を要約",
    statusCommandBody:
      "`loop/PROGRESS.md` と `specs/INDEX.md` を読み、完了／進行中／待機のスペック数と次にやる作業1件を表で要約せよ。コードは変更しないこと。",
    evaluatorAgentDescription:
      "実装結果をスペックの Acceptance Criteria と照合し独立に判定する。実装直後に使う。",
    evaluatorRole: "あなたは Evaluator です。コードは **書きません。** 判定のみ行います。",
    cursorRulesDescription: "プロジェクトの基本ルール",
    cursorLoopDescription: "ループ実行手順",
    cursorRules: (test) => [
      "このリポジトリはスペック主導で開発する。真実の source は `specs/` である。",
      "作業前に `loop/GOAL.md`、`loop/PROGRESS.md`、該当スペックファイルを読む。",
      `一度に1件のスペックだけ実装し、完了後 \`${test}\` で検証する。`,
      "結果は `loop/PROGRESS.md` に記録する。",
    ],
  },
  zh: {
    loopCommandDescription: "执行一次循环：挑一条规格，实现、验证、记录",
    statusCommandDescription: "汇总当前进度",
    statusCommandBody:
      "阅读 `loop/PROGRESS.md` 与 `specs/INDEX.md`，用表格汇总已完成／进行中／待办的规格数量，以及下一步要做的一件事。不要修改代码。",
    evaluatorAgentDescription: "将实现结果与规格的 Acceptance Criteria 独立比对判定。实现后立即使用。",
    evaluatorRole: "你是 Evaluator。你 **不写代码**，只做判定。",
    cursorRulesDescription: "项目基本规则",
    cursorLoopDescription: "循环执行流程",
    cursorRules: (test) => [
      "本仓库以规格驱动开发。事实来源是 `specs/`。",
      "动手前先读 `loop/GOAL.md`、`loop/PROGRESS.md` 与对应的规格文件。",
      `一次只实现一条规格，完成后用 \`${test}\` 验证。`,
      "结果记录到 `loop/PROGRESS.md`。",
    ],
  },
  fr: {
    loopCommandDescription: "Lancer une itération : choisir une spec, implémenter, vérifier, consigner",
    statusCommandDescription: "Résumer l'avancement",
    statusCommandBody:
      "Lis `loop/PROGRESS.md` et `specs/INDEX.md`, puis résume dans un tableau le nombre de specs terminées / en cours / en attente, ainsi que la prochaine tâche unique. Ne modifie aucun code.",
    evaluatorAgentDescription:
      "Juge une implémentation de façon indépendante face aux Acceptance Criteria de la spec. À utiliser juste après l'implémentation.",
    evaluatorRole: "Tu es l'Evaluator. Tu **n'écris pas de code.** Tu juges, c'est tout.",
    cursorRulesDescription: "Règles de base du projet",
    cursorLoopDescription: "Procédure de boucle",
    cursorRules: (test) => [
      "Ce dépôt se développe spec d'abord. La source de vérité est `specs/`.",
      "Avant de travailler, lis `loop/GOAL.md`, `loop/PROGRESS.md` et le fichier de spec concerné.",
      `Implémente une seule spec à la fois et vérifie avec \`${test}\` une fois terminé.`,
      "Consigne le résultat dans `loop/PROGRESS.md`.",
    ],
  },
  ru: {
    loopCommandDescription: "Одна итерация цикла: выбрать спецификацию, реализовать, проверить, записать",
    statusCommandDescription: "Сводка текущего прогресса",
    statusCommandBody:
      "Прочитай `loop/PROGRESS.md` и `specs/INDEX.md` и сведи в таблицу количество завершённых / в работе / ожидающих спецификаций и одну следующую задачу. Код не изменяй.",
    evaluatorAgentDescription:
      "Независимо сверяет результат реализации с Acceptance Criteria спецификации. Используется сразу после реализации.",
    evaluatorRole: "Ты — Evaluator. Ты **не пишешь код.** Только выносишь вердикт.",
    cursorRulesDescription: "Базовые правила проекта",
    cursorLoopDescription: "Процедура цикла",
    cursorRules: (test) => [
      "Репозиторий разрабатывается от спецификаций. Источник истины — `specs/`.",
      "Перед работой прочитай `loop/GOAL.md`, `loop/PROGRESS.md` и нужный файл спецификации.",
      `Реализуй по одной спецификации за раз и проверяй командой \`${test}\`.`,
      "Результат записывай в `loop/PROGRESS.md`.",
    ],
  },
};

export function agentExtraStrings(language: AnalysisLanguage): AgentExtraStrings {
  return AGENT_EXTRAS[language] ?? AGENT_EXTRAS.en;
}

/**
 * Text for the deterministic spec pack used when the LLM call fails. Normally the model
 * writes these in the chosen language; without this table a fallback kit would come out
 * half-translated.
 */
export interface FallbackStrings {
  featureWorks: (feature: string) => string;
  hasPassingTest: string;
  fullSuitePasses: string;
  noRegression: string;
  allTestsPass: string;
  loopRules: string[];
  appSource: string;
  tests: string;
  firstTask: (specId: string) => string;
  coreFeature: (keyword: string) => string;
}

const FALLBACKS: Record<AnalysisLanguage, FallbackStrings> = {
  en: {
    featureWorks: (f) => `${f} actually works.`,
    hasPassingTest: "An automated test covering this feature exists and passes.",
    fullSuitePasses: "The whole test suite passes.",
    noRegression: "No regression is introduced in existing behaviour.",
    allTestsPass: "All automated tests pass.",
    loopRules: [
      "Handle exactly one spec per iteration.",
      "Never end an iteration with failing tests.",
      "Do not add features that are not in a spec.",
      "Always record progress in loop/PROGRESS.md. Do not rely on conversation memory.",
    ],
    appSource: "Application source",
    tests: "Automated tests",
    firstTask: (id) => `Implement ${id}`,
    coreFeature: (k) => `Core functionality for ${k}`,
  },
  ko: {
    featureWorks: (f) => `${f} 이(가) 실제로 동작한다.`,
    hasPassingTest: "해당 기능을 검증하는 자동 테스트가 존재하고 통과한다.",
    fullSuitePasses: "전체 테스트 스위트가 통과한다.",
    noRegression: "기존 기능에 회귀(regression)를 일으키지 않는다.",
    allTestsPass: "모든 자동 테스트가 통과한다.",
    loopRules: [
      "한 번의 반복에서는 스펙 하나만 처리한다.",
      "테스트가 실패한 상태로 반복을 끝내지 않는다.",
      "스펙에 없는 기능을 임의로 추가하지 않는다.",
      "진행 상황은 반드시 loop/PROGRESS.md에 기록한다. 대화 기억에 의존하지 않는다.",
    ],
    appSource: "애플리케이션 소스",
    tests: "자동 테스트",
    firstTask: (id) => `${id} 구현`,
    coreFeature: (k) => `${k} 관련 핵심 기능`,
  },
  ja: {
    featureWorks: (f) => `${f} が実際に動作する。`,
    hasPassingTest: "この機能を検証する自動テストが存在し、通過する。",
    fullSuitePasses: "テストスイート全体が通過する。",
    noRegression: "既存機能にリグレッションを起こさない。",
    allTestsPass: "すべての自動テストが通過する。",
    loopRules: [
      "1回の反復ではスペックを1件だけ処理する。",
      "テストが失敗したまま反復を終えない。",
      "スペックにない機能を勝手に追加しない。",
      "進捗は必ず loop/PROGRESS.md に記録する。会話の記憶に頼らない。",
    ],
    appSource: "アプリケーションのソース",
    tests: "自動テスト",
    firstTask: (id) => `${id} を実装`,
    coreFeature: (k) => `${k} の中核機能`,
  },
  zh: {
    featureWorks: (f) => `${f} 确实可用。`,
    hasPassingTest: "存在覆盖该功能的自动化测试且通过。",
    fullSuitePasses: "整个测试套件通过。",
    noRegression: "不对既有功能造成回归。",
    allTestsPass: "所有自动化测试通过。",
    loopRules: [
      "每次迭代只处理一条规格。",
      "不要在测试失败的状态下结束迭代。",
      "不擅自添加规格之外的功能。",
      "进度必须记录到 loop/PROGRESS.md，不要依赖对话记忆。",
    ],
    appSource: "应用源代码",
    tests: "自动化测试",
    firstTask: (id) => `实现 ${id}`,
    coreFeature: (k) => `${k} 的核心功能`,
  },
  fr: {
    featureWorks: (f) => `${f} fonctionne réellement.`,
    hasPassingTest: "Un test automatisé couvrant cette fonctionnalité existe et passe.",
    fullSuitePasses: "L'ensemble de la suite de tests passe.",
    noRegression: "Aucune régression n'est introduite sur l'existant.",
    allTestsPass: "Tous les tests automatisés passent.",
    loopRules: [
      "Traiter exactement une spec par itération.",
      "Ne jamais terminer une itération avec des tests en échec.",
      "Ne pas ajouter de fonctionnalités absentes des specs.",
      "Toujours consigner l'avancement dans loop/PROGRESS.md, sans compter sur la mémoire de conversation.",
    ],
    appSource: "Sources de l'application",
    tests: "Tests automatisés",
    firstTask: (id) => `Implémenter ${id}`,
    coreFeature: (k) => `Fonctionnalité centrale de ${k}`,
  },
  ru: {
    featureWorks: (f) => `${f} действительно работает.`,
    hasPassingTest: "Существует автотест на эту возможность, и он проходит.",
    fullSuitePasses: "Весь набор тестов проходит.",
    noRegression: "Регрессий в существующем поведении нет.",
    allTestsPass: "Все автотесты проходят.",
    loopRules: [
      "За одну итерацию обрабатывается ровно одна спецификация.",
      "Не завершайте итерацию с падающими тестами.",
      "Не добавляйте возможности, которых нет в спецификациях.",
      "Прогресс всегда пишите в loop/PROGRESS.md, не полагайтесь на память диалога.",
    ],
    appSource: "Исходный код приложения",
    tests: "Автотесты",
    firstTask: (id) => `Реализовать ${id}`,
    coreFeature: (k) => `Ключевая функциональность ${k}`,
  },
};

export function fallbackStrings(language: AnalysisLanguage): FallbackStrings {
  return FALLBACKS[language] ?? FALLBACKS.en;
}
