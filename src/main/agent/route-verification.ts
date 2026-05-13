import type { IdeContextSnapshot } from '../../types/agent-ide-context';
import type { AgentRoutePlan } from '../../types/agent-routing';

export interface RouteVerificationResult {
  success: boolean;
  diagnosticCount: number;
  error?: string;
}

function normalizePathForComparison(filePath?: string): string | null {
  if (!filePath) {
    return null;
  }

  return filePath.replace(/\\/g, '/');
}

function pathMatchesModifiedFile(diagnosticPath: string, modifiedPath: string): boolean {
  if (diagnosticPath === modifiedPath) {
    return true;
  }

  return diagnosticPath.endsWith(`/${modifiedPath}`) || modifiedPath.endsWith(`/${diagnosticPath}`);
}

export function validateRouteModifiedFiles(
  routePlan: AgentRoutePlan | undefined,
  ideContext: IdeContextSnapshot | undefined,
  filesModified: string[]
): RouteVerificationResult {
  const verificationPlan = routePlan?.verificationPlan;
  if (verificationPlan?.skipProjectVerification || verificationPlan?.strategy === 'inspect-only') {
    return { success: true, diagnosticCount: 0 };
  }

  const diagnostics = ideContext?.diagnostics || [];
  const errorDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errorDiagnostics.length === 0) {
    return { success: true, diagnosticCount: 0 };
  }

  if (filesModified.length === 0) {
    return { success: true, diagnosticCount: errorDiagnostics.length };
  }

  const modifiedPaths = filesModified
    .map(normalizePathForComparison)
    .filter((filePath): filePath is string => Boolean(filePath));

  const blockingDiagnostics = errorDiagnostics.filter((diagnostic) => {
    const filePath = normalizePathForComparison(diagnostic.filePath);
    return filePath ? modifiedPaths.some((modifiedPath) => pathMatchesModifiedFile(filePath, modifiedPath)) : true;
  });

  if (blockingDiagnostics.length === 0) {
    return { success: true, diagnosticCount: errorDiagnostics.length };
  }

  const first = blockingDiagnostics[0];
  return {
    success: false,
    diagnosticCount: blockingDiagnostics.length,
    error: `${blockingDiagnostics.length} error diagnostic(s) remain after agent changes. First: ${first.filePath || 'workspace'}:${first.line}:${first.column} ${first.message}`,
  };
}
