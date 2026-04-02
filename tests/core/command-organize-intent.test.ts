import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CommandParser, ParsedCommand } from '../../src/main/core/command-parser';
import { OperationPlanner } from '../../src/main/core/operation-planner';
import { PathResolver } from '../../src/main/core/path-resolver';

describe('organize intent parsing', () => {
  const parser = new CommandParser();

  it('parses natural organize requests for system folders', () => {
    const parsed = parser.parse('can you organize my downloads folder please');

    expect(parsed).not.toBeNull();
    expect(parsed?.operation).toBe('organize');
    expect(parsed?.source).toBe('downloads');
    expect(parsed?.options?.organizeBy).toBe('type');
  });

  it('does not classify generic architecture questions as file operations', () => {
    const isFileCommand = parser.isFileOperationCommand(
      'How should I organize my project architecture?'
    );

    expect(isFileCommand).toBe(false);
  });
});

describe('organize plan generation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-organize-'));
    fs.writeFileSync(path.join(tempDir, 'spec.pdf'), 'doc');
    fs.writeFileSync(path.join(tempDir, 'photo.jpg'), 'img');
    fs.writeFileSync(path.join(tempDir, 'backup.zip'), 'zip');
    fs.writeFileSync(path.join(tempDir, 'notes.tmp'), 'tmp');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates move steps by file type categories', () => {
    const planner = new OperationPlanner(new PathResolver());
    const command: ParsedCommand = {
      operation: 'organize',
      source: tempDir,
      options: { organizeBy: 'type' },
      confidence: 1,
      rawCommand: `organize ${tempDir}`
    };

    const plan = planner.plan(command);
    expect(plan).not.toBeNull();
    expect(plan?.totalFiles).toBe(3);

    const destinations = (plan?.steps || []).map((step) => step.destination || '');
    expect(destinations.some((dest) => dest.includes(`${path.sep}Documents${path.sep}`))).toBe(true);
    expect(destinations.some((dest) => dest.includes(`${path.sep}Images${path.sep}`))).toBe(true);
    expect(destinations.some((dest) => dest.includes(`${path.sep}Archives${path.sep}`))).toBe(true);
    expect(destinations.some((dest) => dest.includes(`${path.sep}notes.tmp`))).toBe(false);
  });
});
