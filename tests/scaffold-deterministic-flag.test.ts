import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveDeterministicScaffoldOnlyFlag } from '../src/main/agent/scaffold-resolver';

describe('resolveDeterministicScaffoldOnlyFlag', () => {
  let workspacePath: string;

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-scaffold-flag-'));
  });

  afterEach(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('enables scaffold-only for static-site prompts in near-empty workspaces (production)', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        resolveDeterministicScaffoldOnlyFlag({
          message: 'Build a simple website for my project',
          workspacePath,
          allowScaffold: true,
          explicitFromContext: false,
        })
      ).toBe(true);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('disables when scaffold is blocked by policy', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        resolveDeterministicScaffoldOnlyFlag({
          message: 'Build a simple website',
          workspacePath,
          allowScaffold: false,
          explicitFromContext: false,
        })
      ).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('disables when workspace already has many meaningful files', () => {
    fs.writeFileSync(path.join(workspacePath, 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(workspacePath, 'b.ts'), 'export const b = 2;\n');
    fs.writeFileSync(path.join(workspacePath, 'c.ts'), 'export const c = 3;\n');

    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        resolveDeterministicScaffoldOnlyFlag({
          message: 'Build a simple website',
          workspacePath,
          allowScaffold: true,
          explicitFromContext: false,
        })
      ).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('disables implicit scaffold-only when template outputs already exist', () => {
    fs.writeFileSync(path.join(workspacePath, 'index.html'), '<h1>Existing site</h1>\n');
    fs.writeFileSync(path.join(workspacePath, 'styles.css'), 'body { color: red; }\n');

    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        resolveDeterministicScaffoldOnlyFlag({
          message: 'Update my simple website landing page',
          workspacePath,
          allowScaffold: true,
          explicitFromContext: false,
        })
      ).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('honors explicit deterministic_scaffold_only from context', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        resolveDeterministicScaffoldOnlyFlag({
          message: 'Anything',
          workspacePath,
          allowScaffold: true,
          explicitFromContext: true,
        })
      ).toBe(true);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
