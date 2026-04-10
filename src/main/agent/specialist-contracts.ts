export type SpecialistId =
  | 'executive_router'
  | 'task_master'
  | 'template_scaffold_specialist'
  | 'javascript_specialist'
  | 'styling_ux_specialist'
  | 'python_specialist'
  | 'tauri_specialist'
  | 'pipeline_specialist'
  | 'testing_specialist'
  | 'security_specialist'
  | 'performance_specialist'
  | 'data_contract_specialist'
  | 'integration_verifier'
  | 'repair_specialist';

export type SpecialistDiscipline =
  | 'orchestration'
  | 'planning'
  | 'scaffolding'
  | 'frontend_application'
  | 'styling_and_ux'
  | 'backend_services'
  | 'desktop_runtime'
  | 'build_and_release'
  | 'test_engineering'
  | 'security_review'
  | 'performance_optimization'
  | 'data_contracts'
  | 'verification'
  | 'repair';

export type SpecialistPhase =
  | 'route'
  | 'plan'
  | 'scaffold'
  | 'implement'
  | 'verify'
  | 'repair';

export type BlackboardArtifactType =
  | 'user_intent'
  | 'execution_plan'
  | 'scaffold_result'
  | 'file_patch_set'
  | 'command_result'
  | 'verification_report'
  | 'repair_plan'
  | 'final_summary';

export interface SpecialistDefinition {
  id: SpecialistId;
  discipline: SpecialistDiscipline;
  phase: SpecialistPhase;
  title: string;
  purpose: string;
  reflectionFocus: readonly string[];
  writableGlobs: readonly string[];
  readableGlobs: readonly string[];
  allowedToolNames: readonly string[];
  allowedCommandPrefixes: readonly string[];
  forbiddenActions: readonly string[];
  consumes: readonly BlackboardArtifactType[];
  produces: readonly BlackboardArtifactType[];
  escalatesTo: readonly SpecialistId[];
  mustReportTo: readonly SpecialistId[];
}

export interface SpecialistStepAssignment {
  id: string;
  specialist: SpecialistId;
  goal: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'failed';
  claimedFiles: string[];
  acceptanceCriteria: string[];
  dependsOn: string[];
}

export interface VerificationFinding {
  severity: 'info' | 'warning' | 'error' | 'critical';
  summary: string;
  files: string[];
  suggestedOwner: SpecialistId;
}

export interface SpecialistArtifact {
  id: string;
  type: BlackboardArtifactType;
  author: SpecialistId;
  createdAt: number;
  summary: string;
  payload: Record<string, unknown>;
}

export interface SpecialistBlackboard {
  taskId: string;
  userGoal: string;
  mode: 'talk' | 'create' | 'edit' | 'verify' | 'repair';
  currentOwner: SpecialistId;
  status: 'planning' | 'executing' | 'awaiting_review' | 'verifying' | 'repairing' | 'completed' | 'failed';
  workspacePath: string;
  activeStepId?: string;
  claimedFiles: Record<SpecialistId, string[]>;
  steps: SpecialistStepAssignment[];
  artifacts: SpecialistArtifact[];
  findings: VerificationFinding[];
  approvalsRequired: Array<{
    kind: 'apply_changes' | 'run_install' | 'run_build' | 'run_browser_test';
    requestedBy: SpecialistId;
    granted: boolean;
  }>;
}

export type LegacySpecialistRole =
  | 'tool_orchestrator'
  | 'javascript_specialist'
  | 'python_specialist'
  | 'tauri_specialist'
  | 'pipeline_specialist'
  | 'integration_analyst';

export const LEGACY_SPECIALIST_ROLE_MAP: Record<LegacySpecialistRole, SpecialistId> = {
  tool_orchestrator: 'task_master',
  javascript_specialist: 'javascript_specialist',
  python_specialist: 'python_specialist',
  tauri_specialist: 'tauri_specialist',
  pipeline_specialist: 'pipeline_specialist',
  integration_analyst: 'integration_verifier',
};

export const SPECIALIST_MATRIX: Record<SpecialistId, SpecialistDefinition> = {
  executive_router: {
    id: 'executive_router',
    discipline: 'orchestration',
    phase: 'route',
    title: 'Executive Router',
    purpose: 'Classify the request, choose the workflow mode, and hand off to the task master.',
    reflectionFocus: [
      'Did I route to the correct workflow mode?',
      'Am I missing a domain that should be involved?',
    ],
    writableGlobs: [],
    readableGlobs: ['**/*'],
    allowedToolNames: ['read_file', 'search_codebase', 'find_symbols'],
    allowedCommandPrefixes: [],
    forbiddenActions: ['write files', 'run commands', 'approve its own plan'],
    consumes: ['user_intent'],
    produces: ['execution_plan'],
    escalatesTo: ['task_master'],
    mustReportTo: [],
  },
  task_master: {
    id: 'task_master',
    discipline: 'planning',
    phase: 'plan',
    title: 'Task Master',
    purpose: 'Break work into bounded steps, assign file ownership, and define acceptance criteria.',
    reflectionFocus: [
      'Did I assign the right discipline experts?',
      'Are file claims and acceptance criteria explicit enough to prevent drift?',
    ],
    writableGlobs: [],
    readableGlobs: ['**/*'],
    allowedToolNames: ['read_file', 'search_codebase', 'find_symbols'],
    allowedCommandPrefixes: [],
    forbiddenActions: ['write files', 'run build/install commands', 'apply code directly'],
    consumes: ['user_intent', 'execution_plan', 'verification_report'],
    produces: ['execution_plan', 'repair_plan', 'final_summary'],
    escalatesTo: [
      'template_scaffold_specialist',
      'javascript_specialist',
      'styling_ux_specialist',
      'python_specialist',
      'tauri_specialist',
      'pipeline_specialist',
      'testing_specialist',
      'integration_verifier',
      'repair_specialist',
    ],
    mustReportTo: ['executive_router'],
  },
  template_scaffold_specialist: {
    id: 'template_scaffold_specialist',
    discipline: 'scaffolding',
    phase: 'scaffold',
    title: 'Template Scaffold Specialist',
    purpose: 'Materialize deterministic project baselines and manifest files only.',
    reflectionFocus: [
      'Did I preserve the intended project shape?',
      'Did I avoid inventing features outside the scaffold contract?',
    ],
    writableGlobs: [
      'package.json',
      '.env',
      '.env.local',
      'README.md',
      'index.html',
      'src/**',
      'app/**',
      'pages/**',
      'lib/**',
      'components/**',
      'public/**',
      'backend/**',
      'prisma/**',
      'src-tauri/**',
      'next.config.*',
      'vite.config.*',
      'tsconfig*.json',
      'tailwind.config.*',
      'postcss.config.*',
      '*.config.js',
      '*.config.ts',
      '*.config.mjs',
    ],
    readableGlobs: ['templates/**', 'src/main/legacy/template-engine.ts', 'src/main/agent/scaffold-resolver.ts'],
    allowedToolNames: ['read_file', 'write_file', 'run_command'],
    allowedCommandPrefixes: [],
    forbiddenActions: ['patch unrelated existing files', 'run browser tests', 'invent architecture outside chosen scaffold'],
    consumes: ['execution_plan'],
    produces: ['scaffold_result', 'file_patch_set'],
    escalatesTo: ['pipeline_specialist', 'integration_verifier', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  javascript_specialist: {
    id: 'javascript_specialist',
    discipline: 'frontend_application',
    phase: 'implement',
    title: 'JavaScript Specialist',
    purpose: 'Own frontend application behavior, TS/JS implementation, renderer logic, and app wiring within assigned files.',
    reflectionFocus: [
      'Did I solve the frontend/app behavior actually requested?',
      'Did I accidentally cross into styling, backend, or pipeline concerns?',
    ],
    writableGlobs: [
      'index.html',
      'src/**/*.js',
      'src/**/*.jsx',
      'src/**/*.ts',
      'src/**/*.tsx',
      'src/**/*.css',
      'app/**',
      'pages/**',
      'lib/**',
      'components/**',
      'prisma/**',
      'tests/**/*.ts',
      'tests/**/*.tsx',
      'README.md',
    ],
    readableGlobs: ['src/**', 'app/**', 'lib/**', 'pages/**', 'components/**', 'prisma/**', 'tests/**', 'package.json', 'tsconfig*.json', 'vite.config.*', 'next.config.*', 'index.html', 'README.md'],
    allowedToolNames: ['read_file', 'write_file', 'patch_file', 'search_codebase', 'find_symbols'],
    allowedCommandPrefixes: [],
    forbiddenActions: ['edit Python files', 'change CI or packaging policy', 'run install/build commands directly'],
    consumes: ['execution_plan', 'scaffold_result', 'repair_plan'],
    produces: ['file_patch_set'],
    escalatesTo: ['pipeline_specialist', 'integration_verifier', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  styling_ux_specialist: {
    id: 'styling_ux_specialist',
    discipline: 'styling_and_ux',
    phase: 'implement',
    title: 'Styling / UX Specialist',
    purpose: 'Own visual polish, CSS, layout, interaction feedback, and user-facing presentation details inside assigned files.',
    reflectionFocus: [
      'Did I improve clarity, hierarchy, and interaction affordances instead of just adding decoration?',
      'Did I stay inside styling and UX concerns without rewriting unrelated application logic?',
    ],
    writableGlobs: ['index.html', 'src/**/*.css', 'src/**/*.scss', 'src/**/*.html', 'src/**/*.tsx', 'src/**/*.jsx', 'app/**/*.css', 'app/**/*.tsx', 'components/**/*.css', 'components/**/*.tsx', 'public/**'],
    readableGlobs: ['src/**', 'app/**', 'components/**', 'public/**', 'tests/**', 'index.html'],
    allowedToolNames: ['read_file', 'write_file', 'patch_file', 'search_codebase', 'find_symbols'],
    allowedCommandPrefixes: [],
    forbiddenActions: ['edit backend service files', 'change dependency or packaging policy', 'rewrite core business logic'],
    consumes: ['execution_plan', 'scaffold_result', 'repair_plan'],
    produces: ['file_patch_set'],
    escalatesTo: ['javascript_specialist', 'integration_verifier', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  python_specialist: {
    id: 'python_specialist',
    discipline: 'backend_services',
    phase: 'implement',
    title: 'Python Specialist',
    purpose: 'Own backend and Python support code inside assigned Python file scopes.',
    reflectionFocus: [
      'Did I keep the fix/service logic inside backend responsibilities?',
      'Did I preserve contracts with the frontend and pipeline layers?',
    ],
    writableGlobs: ['backend/**/*.py', 'scripts/**/*.py', 'tests/**/*.py'],
    readableGlobs: ['backend/**', 'scripts/**', 'tests/**', 'requirements*.txt', 'pyproject.toml'],
    allowedToolNames: ['read_file', 'write_file', 'patch_file', 'search_codebase', 'run_command'],
    allowedCommandPrefixes: [],
    forbiddenActions: ['edit renderer/frontend files', 'change JS build configs', 'run install/build commands directly'],
    consumes: ['execution_plan', 'repair_plan'],
    produces: ['file_patch_set'],
    escalatesTo: ['pipeline_specialist', 'integration_verifier', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  tauri_specialist: {
    id: 'tauri_specialist',
    discipline: 'desktop_runtime',
    phase: 'implement',
    title: 'Tauri Specialist',
    purpose: 'Own Tauri and Rust desktop integration files only.',
    reflectionFocus: [
      'Did I keep the change constrained to desktop runtime concerns?',
      'Did I avoid rewriting unrelated application logic?',
    ],
    writableGlobs: ['src-tauri/**', 'src/**/*.ts', 'src/**/*.tsx'],
    readableGlobs: ['src-tauri/**', 'src/**', 'package.json'],
    allowedToolNames: ['read_file', 'write_file', 'patch_file', 'search_codebase', 'run_command'],
    allowedCommandPrefixes: [],
    forbiddenActions: ['edit Python backend files', 'change unrelated web-only scaffolds', 'run install/build commands directly'],
    consumes: ['execution_plan', 'repair_plan'],
    produces: ['file_patch_set'],
    escalatesTo: ['pipeline_specialist', 'integration_verifier', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  pipeline_specialist: {
    id: 'pipeline_specialist',
    discipline: 'build_and_release',
    phase: 'implement',
    title: 'Pipeline Specialist',
    purpose: 'Own build scripts, dependency manifests, package metadata, and project automation.',
    reflectionFocus: [
      'Did I improve the build/run path without taking over product logic?',
      'Are the commands and configs cross-platform and verifiable?',
    ],
    writableGlobs: [
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      '.env',
      '.env.local',
      '.env.example',
      'prisma/**',
      'requirements*.txt',
      'pyproject.toml',
      'vite.config.*',
      'next.config.*',
      'tsconfig*.json',
      'tailwind.config.*',
      'postcss.config.*',
      '*.config.js',
      '*.config.ts',
      '*.config.mjs',
      '.github/workflows/**',
      '*.bat',
      'Makefile',
      'Dockerfile',
      'Dockerfile.*',
      'README.md',
    ],
    readableGlobs: ['package.json', 'backend/**', 'src/**', 'tests/**', '.github/**'],
    allowedToolNames: ['read_file', 'write_file', 'patch_file', 'search_codebase', 'run_command'],
    allowedCommandPrefixes: ['npm run', 'npm test', 'npm install', 'python -m pytest', 'py -3 -m pytest'],
    forbiddenActions: ['rewrite product code to fix logic bugs', 'claim ownership of feature files without handoff'],
    consumes: ['execution_plan', 'scaffold_result', 'repair_plan'],
    produces: ['file_patch_set', 'command_result'],
    escalatesTo: ['integration_verifier', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  testing_specialist: {
    id: 'testing_specialist',
    discipline: 'test_engineering',
    phase: 'verify',
    title: 'Testing Specialist',
    purpose: 'Own automated test coverage, browser checks, fixtures, and test harness updates inside bounded test files.',
    reflectionFocus: [
      'Did I add the smallest useful test evidence for the requested behavior?',
      'Did I avoid test-only churn that restates the implementation without reducing risk?',
    ],
    writableGlobs: ['tests/**', 'playwright.config.*', 'package.json', 'scripts/**/*.ts'],
    readableGlobs: ['src/**', 'tests/**', 'playwright.config.*', 'package.json', 'scripts/**'],
    allowedToolNames: ['read_file', 'write_file', 'patch_file', 'search_codebase', 'find_symbols', 'run_command'],
    allowedCommandPrefixes: ['npm test', 'npm run test', 'npm run test:e2e', 'playwright test', 'npx playwright test'],
    forbiddenActions: ['ship production feature code outside test scaffolding', 'modify backend service logic unless part of a dedicated repair plan'],
    consumes: ['execution_plan', 'verification_report', 'repair_plan'],
    produces: ['file_patch_set', 'command_result', 'verification_report'],
    escalatesTo: ['integration_verifier', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  security_specialist: {
    id: 'security_specialist',
    discipline: 'security_review',
    phase: 'verify',
    title: 'Security Specialist',
    purpose: 'Own auth, secrets handling, unsafe input paths, and security-sensitive hardening within assigned files.',
    reflectionFocus: [
      'Did I reduce a concrete security risk instead of adding generic hardening?',
      'Did I avoid weakening existing trust boundaries, validation, or secret handling?',
    ],
    writableGlobs: ['src/**', 'app/**', 'backend/**', 'lib/**', 'components/**', 'tests/**', 'package.json', '*.config.*', '.github/workflows/**'],
    readableGlobs: ['**/*'],
    allowedToolNames: ['read_file', 'write_file', 'patch_file', 'search_codebase', 'find_symbols'],
    allowedCommandPrefixes: [],
    forbiddenActions: ['disable security controls for convenience', 'broaden feature scope while fixing a risk'],
    consumes: ['execution_plan', 'verification_report', 'repair_plan'],
    produces: ['file_patch_set', 'verification_report'],
    escalatesTo: ['integration_verifier', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  performance_specialist: {
    id: 'performance_specialist',
    discipline: 'performance_optimization',
    phase: 'implement',
    title: 'Performance Specialist',
    purpose: 'Own runtime hotspots, render/update pressure, bundle weight, and performance-sensitive workflow changes.',
    reflectionFocus: [
      'Did I improve a measurable bottleneck or latency path instead of rewriting broadly?',
      'Did I preserve correctness while reducing unnecessary work?',
    ],
    writableGlobs: ['src/**', 'app/**', 'components/**', 'backend/**', 'public/**', 'tests/**', 'package.json', '*.config.*'],
    readableGlobs: ['**/*'],
    allowedToolNames: ['read_file', 'write_file', 'patch_file', 'search_codebase', 'find_symbols'],
    allowedCommandPrefixes: [],
    forbiddenActions: ['micro-optimize unrelated code', 'trade away correctness or accessibility for speed'],
    consumes: ['execution_plan', 'verification_report', 'repair_plan'],
    produces: ['file_patch_set'],
    escalatesTo: ['testing_specialist', 'integration_verifier', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  data_contract_specialist: {
    id: 'data_contract_specialist',
    discipline: 'data_contracts',
    phase: 'implement',
    title: 'Data Contract Specialist',
    purpose: 'Own schemas, DTOs, API contracts, validation layers, and cross-boundary data shape consistency.',
    reflectionFocus: [
      'Did I keep request/response or schema changes consistent across every touched boundary?',
      'Did I add or preserve validation where the contract enters the system?',
    ],
    writableGlobs: ['src/**', 'app/**', 'lib/**', 'backend/**', 'prisma/**', 'tests/**', 'package.json'],
    readableGlobs: ['**/*'],
    allowedToolNames: ['read_file', 'write_file', 'patch_file', 'search_codebase', 'find_symbols'],
    allowedCommandPrefixes: [],
    forbiddenActions: ['change unrelated UI styling', 'hide contract mismatches by removing validation'],
    consumes: ['execution_plan', 'verification_report', 'repair_plan'],
    produces: ['file_patch_set'],
    escalatesTo: ['testing_specialist', 'integration_verifier', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  integration_verifier: {
    id: 'integration_verifier',
    discipline: 'verification',
    phase: 'verify',
    title: 'Integration Verifier',
    purpose: 'Review diffs, run bounded verification commands, and emit pass/fail findings.',
    reflectionFocus: [
      'What concrete evidence shows pass or fail?',
      'Am I reporting issues without drifting into repair work?',
    ],
    writableGlobs: [],
    readableGlobs: ['**/*'],
    allowedToolNames: ['read_file', 'search_codebase', 'find_symbols', 'run_command'],
    allowedCommandPrefixes: ['npm test', 'npm run', 'python -m pytest', 'py -3 -m pytest'],
    forbiddenActions: ['write files', 'change plans silently', 'repair issues directly'],
    consumes: ['execution_plan', 'scaffold_result', 'file_patch_set', 'command_result'],
    produces: ['verification_report', 'command_result'],
    escalatesTo: ['task_master', 'repair_specialist'],
    mustReportTo: ['task_master'],
  },
  repair_specialist: {
    id: 'repair_specialist',
    discipline: 'repair',
    phase: 'repair',
    title: 'Repair Specialist',
    purpose: 'Apply the smallest viable fix for verifier findings inside explicitly assigned files.',
    reflectionFocus: [
      'What is the narrowest fix that resolves the verifier finding?',
      'Am I introducing new scope while trying to repair?',
    ],
    writableGlobs: [
      'index.html',
      'src/**',
      'app/**',
      'pages/**',
      'lib/**',
      'components/**',
      'prisma/**',
      'backend/**',
      'tests/**',
      'public/**',
      'package.json',
      'package-lock.json',
      '.env',
      '.env.local',
      'vite.config.*',
      'next.config.*',
      'tsconfig*.json',
      'tailwind.config.*',
      'postcss.config.*',
      '*.config.js',
      '*.config.ts',
      '*.config.mjs',
      'README.md',
    ],
    readableGlobs: ['**/*'],
    allowedToolNames: ['read_file', 'write_file', 'patch_file', 'search_codebase', 'find_symbols', 'run_command'],
    allowedCommandPrefixes: ['npm install', 'npm run', 'npx', 'node'],
    forbiddenActions: ['re-scaffold the project', 'expand scope beyond verifier findings', 'author new features during repair'],
    consumes: ['verification_report', 'repair_plan'],
    produces: ['file_patch_set', 'final_summary'],
    escalatesTo: ['integration_verifier', 'task_master'],
    mustReportTo: ['task_master'],
  },
};

export const SPECIALIST_EXECUTION_ORDER: SpecialistId[] = [
  'executive_router',
  'task_master',
  'template_scaffold_specialist',
  'javascript_specialist',
  'styling_ux_specialist',
  'python_specialist',
  'tauri_specialist',
  'pipeline_specialist',
  'testing_specialist',
  'security_specialist',
  'performance_specialist',
  'data_contract_specialist',
  'integration_verifier',
  'repair_specialist',
];

export function getSpecialistDefinition(id: SpecialistId): SpecialistDefinition {
  return SPECIALIST_MATRIX[id];
}

export function isCommandAllowedForSpecialist(id: SpecialistId, command: string): boolean {
  const normalized = command.trim().toLowerCase();
  const allowedPrefixes = SPECIALIST_MATRIX[id].allowedCommandPrefixes;
  return allowedPrefixes.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}
