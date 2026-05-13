import type { AgentRiskAssessment, AgentRiskLevel, AgentToolRiskInput } from '../../types/agent-routing';

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function riskLevelFromScore(score: number): AgentRiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

export function scoreToolRisk(tool: AgentToolRiskInput): AgentRiskAssessment {
  const name = tool.name;
  const args = tool.arguments || {};
  const command = typeof args.command === 'string' ? args.command.toLowerCase() : '';
  const reasons: string[] = [];
  let score = 5;

  if (name === 'delete_path') {
    score += 70;
    reasons.push('delete_path can remove files or folders');
    if (args.confirm === 'DELETE_WORKSPACE') {
      score += 20;
      reasons.push('Workspace root deletion requested');
    }
  }
  if (name === 'run_command') {
    score += 15;
    reasons.push('Shell command execution requested');
    if (/\b(rm\s+-rf|rmdir|del\s+\/s|format|git\s+reset\s+--hard|push\s+.*--force)\b/i.test(command)) {
      score += 55;
      reasons.push('Command contains destructive operation');
    }
    if (/\b(curl|wget|npm\s+i|npm\s+install|pip\s+install|docker|deploy|vercel|netlify)\b/i.test(command)) {
      score += 25;
      reasons.push('Command can change environment or contact network');
    }
  }
  if (name === 'write_file' || name === 'patch_file' || name === 'str_replace') {
    score += 20;
    reasons.push('Tool modifies source files');
  }
  if (name === 'scaffold_project') {
    score += 25;
    reasons.push('Tool creates project structure');
  }

  const finalScore = clampScore(score);
  const level = riskLevelFromScore(finalScore);
  return {
    level,
    score: finalScore,
    reasons: reasons.length ? reasons : ['Low-risk read or search tool'],
    destructive: name === 'delete_path' || /rm\s+-rf|rmdir|del\s+\/s|format/i.test(command),
    requiresConfirmation: level === 'critical' || name === 'delete_path',
  };
}
