export interface StartupPreflightIssue {
  code: string;
  severity: 'warn' | 'info';
  message: string;
  action?: string;
}

export interface StartupPreflightReport {
  issues: StartupPreflightIssue[];
  warningCount: number;
  infoCount: number;
  generatedAt: string;
}

export type SystemDoctorCategory = 'runtime' | 'ai' | 'brain' | 'config';
export type SystemDoctorStatus = 'pass' | 'warn' | 'fail';

export interface SystemDoctorCheck {
  category: SystemDoctorCategory;
  name: string;
  status: SystemDoctorStatus;
  message: string;
  details?: string;
  action?: string;
}

export interface SystemDoctorReport {
  checks: SystemDoctorCheck[];
  passCount: number;
  warnCount: number;
  failCount: number;
  generatedAt: string;
}

export interface SystemStatusSummary {
  ai: {
    provider: string;
    model: string;
    connected: boolean;
    reason?: string;
  };
  brain: {
    enabled: boolean;
    connected: boolean;
    modeLabel: 'desktop-only' | 'brain-enabled';
  };
  startup: StartupPreflightReport;
  timestamp: string;
}
