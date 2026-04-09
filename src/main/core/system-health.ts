import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Settings } from '../../types';
import type {
  StartupPreflightReport,
  SystemDoctorCheck,
  SystemDoctorReport,
  SystemDoctorStatus,
} from '../../types/system-health';

const isWindows = process.platform === 'win32';

function commandExists(command: string): boolean {
  try {
    execSync(isWindows ? `where ${command}` : `which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getVersion(command: string, args: string[] = ['--version']): string | null {
  try {
    const output = execSync(`${command} ${args.join(' ')}`, { encoding: 'utf-8', timeout: 5000 });
    return output.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

function buildCheck(
  category: SystemDoctorCheck['category'],
  name: string,
  status: SystemDoctorStatus,
  message: string,
  details?: string,
  action?: string
): SystemDoctorCheck {
  return { category, name, status, message, details, action };
}

export function collectSystemDoctorReport(options: {
  settings: Settings;
  appRoot: string;
  startupPreflightReport: StartupPreflightReport | null;
  aiConnected: boolean;
  brainEnabled: boolean;
  brainConnected: boolean;
}): SystemDoctorReport {
  const { settings, appRoot, startupPreflightReport, aiConnected, brainEnabled, brainConnected } = options;
  const checks: SystemDoctorCheck[] = [];

  const nodeVersion = process.version;
  const nodeMajor = Number.parseInt(nodeVersion.slice(1).split('.')[0] || '0', 10);
  checks.push(buildCheck(
    'runtime',
    'Node.js',
    nodeMajor >= 20 ? 'pass' : nodeMajor >= 18 ? 'warn' : 'fail',
    nodeMajor >= 20 ? `${nodeVersion} (recommended)` : nodeMajor >= 18 ? `${nodeVersion} (supported)` : `${nodeVersion} (upgrade required)`,
    undefined,
    nodeMajor >= 18 ? undefined : 'Install Node.js 18+ (20 LTS recommended).'
  ));

  const npmVersion = getVersion('npm');
  checks.push(buildCheck(
    'runtime',
    'npm',
    npmVersion ? 'pass' : 'fail',
    npmVersion || 'Not found',
    undefined,
    npmVersion ? undefined : 'Install npm to build and run the desktop workspace.'
  ));

  const gitVersion = getVersion('git');
  checks.push(buildCheck(
    'runtime',
    'Git',
    gitVersion ? 'pass' : 'warn',
    gitVersion || 'Not found',
    undefined,
    gitVersion ? undefined : 'Install Git for repository workflows and staged review fixes.'
  ));

  checks.push(buildCheck(
    'ai',
    'Active provider',
    aiConnected ? 'pass' : 'warn',
    `${settings.activeProvider} / ${settings.activeModel}`,
    aiConnected ? 'Provider connectivity check passed.' : 'Provider connectivity check failed or the provider is not configured.',
    aiConnected ? undefined : 'Open Settings to configure keys, endpoints, or switch providers.'
  ));

  checks.push(buildCheck(
    'brain',
    'Python Brain mode',
    brainEnabled ? (brainConnected ? 'pass' : 'warn') : 'pass',
    brainEnabled ? (brainConnected ? 'Enabled and connected' : 'Enabled but offline') : 'Desktop-only mode (Brain optional)',
    brainEnabled
      ? 'Advanced memory/orchestration paths are enabled for this session.'
      : 'Core IDE workflows run without the optional Python backend.',
    brainEnabled && !brainConnected ? 'Start the backend manually or disable Brain-dependent workflows.' : undefined
  ));

  const pythonVersion = getVersion('python', ['--version']) || getVersion('python3', ['--version']);
  checks.push(buildCheck(
    'brain',
    'Python',
    pythonVersion ? 'pass' : brainEnabled ? 'warn' : 'pass',
    pythonVersion || (brainEnabled ? 'Not found' : 'Optional'),
    pythonVersion ? undefined : 'Python is only required when the optional Brain backend is enabled.',
    pythonVersion || !brainEnabled ? undefined : 'Install Python 3.10+ to enable the Brain backend.'
  ));

  const pipVersion = getVersion('pip', ['--version']) || getVersion('pip3', ['--version']);
  checks.push(buildCheck(
    'brain',
    'pip',
    pipVersion ? 'pass' : brainEnabled ? 'warn' : 'pass',
    pipVersion ? pipVersion.split(' from ')[0] : (brainEnabled ? 'Not found' : 'Optional'),
    undefined,
    pipVersion || !brainEnabled ? undefined : 'Install pip to manage Brain backend dependencies.'
  ));

  const backendRequirementsPath = path.join(appRoot, 'backend', 'requirements.txt');
  checks.push(buildCheck(
    'brain',
    'Backend requirements',
    fs.existsSync(backendRequirementsPath) ? 'pass' : brainEnabled ? 'warn' : 'pass',
    fs.existsSync(backendRequirementsPath) ? 'Found backend/requirements.txt' : (brainEnabled ? 'backend/requirements.txt missing' : 'Optional'),
    fs.existsSync(backendRequirementsPath) ? backendRequirementsPath : undefined,
    fs.existsSync(backendRequirementsPath) || !brainEnabled ? undefined : 'Restore backend dependencies or disable the Brain backend.'
  ));

  if (startupPreflightReport) {
    checks.push(buildCheck(
      'config',
      'Startup diagnostics',
      startupPreflightReport.warningCount > 0 ? 'warn' : 'pass',
      startupPreflightReport.warningCount > 0
        ? `${startupPreflightReport.warningCount} warning(s), ${startupPreflightReport.infoCount} info message(s)`
        : startupPreflightReport.infoCount > 0
          ? `${startupPreflightReport.infoCount} info message(s)`
          : 'No startup warnings',
      startupPreflightReport.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n') || undefined,
      startupPreflightReport.warningCount > 0 ? 'Review the startup diagnostics in the system panel and settings.' : undefined
    ));
  }

  checks.push(buildCheck(
    'runtime',
    'System',
    'pass',
    `${os.type()} ${os.release()} (${os.arch()})`,
    `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB RAM, ${os.cpus().length} CPU cores`
  ));

  const passCount = checks.filter((check) => check.status === 'pass').length;
  const warnCount = checks.filter((check) => check.status === 'warn').length;
  const failCount = checks.filter((check) => check.status === 'fail').length;

  return {
    checks,
    passCount,
    warnCount,
    failCount,
    generatedAt: new Date().toISOString(),
  };
}
