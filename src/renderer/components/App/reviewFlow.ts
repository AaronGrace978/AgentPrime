import type { AgentReviewChange as ReviewFileChange, AgentReviewVerificationState as ReviewVerificationState } from '../../../types/agent-review';

export type { ReviewVerificationState };

export function countAcceptedChanges(changes: ReviewFileChange[]): number {
  return changes.filter((change) => change.status === 'accepted').length;
}

export function hasPendingReviewChanges(changes: ReviewFileChange[]): boolean {
  return changes.some((change) => change.status === 'pending');
}

export function shouldAutoVerifyReviewChanges(
  changes: ReviewFileChange[],
  verification: ReviewVerificationState,
  applied: boolean
): boolean {
  return (
    applied &&
    changes.length > 0 &&
    !hasPendingReviewChanges(changes) &&
    countAcceptedChanges(changes) > 0 &&
    verification.status === 'idle'
  );
}

export function buildRepairPrompt(
  taskDescription: string,
  verification: ReviewVerificationState,
  acceptedFiles: string[] = [],
  rejectedFiles: string[] = []
): string {
  const issueLines = verification.findings && verification.findings.length > 0
    ? verification.findings.map((finding) => {
        const fileSuffix = finding.files.length > 0 ? ` [files: ${finding.files.join(', ')}]` : '';
        return `- [${finding.stage}] ${finding.summary}${fileSuffix}`;
      }).join('\n')
    : verification.issues.length > 0
      ? verification.issues.map((issue) => `- ${issue}`).join('\n')
    : '- Verification failed without a detailed issue list.';

  const commandHints = [
    verification.installCommand ? `Install command: ${verification.installCommand}` : null,
    verification.buildCommand ? `Build command: ${verification.buildCommand}` : null,
    verification.startCommand ? `Run command: ${verification.startCommand}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    'Repair the accepted project changes so verification passes.',
    '',
    `Original task: ${taskDescription || 'Agent-created project changes'}`,
    verification.projectTypeLabel ? `Detected project: ${verification.projectTypeLabel}` : null,
    verification.readinessSummary ? `Readiness rule: ${verification.readinessSummary}` : null,
    acceptedFiles.length > 0 ? `Accepted files:\n${acceptedFiles.map((filePath) => `- ${filePath}`).join('\n')}` : null,
    rejectedFiles.length > 0 ? `Rejected files (do not modify):\n${rejectedFiles.map((filePath) => `- ${filePath}`).join('\n')}` : null,
    commandHints || null,
    '',
    'Verification failures:',
    issueLines,
    '',
    'Focus only on the accepted files and the concrete failures above. Do not add new features.',
  ]
    .filter(Boolean)
    .join('\n');
}
