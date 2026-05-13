import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { getCSSLanguageService, getLESSLanguageService, getSCSSLanguageService } from 'vscode-css-languageservice';
import { getLanguageService as getJSONLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument as parseYamlDocument } from 'yaml';
import * as ts from 'typescript';

const execFileAsync = promisify(execFile);

export interface LanguageDiagnosticsRequest {
  filePath: string;
  content: string;
  language?: string;
  workspacePath?: string;
}

export interface LanguageDiagnostic {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning';
  ruleId: string;
  source: 'typescript' | 'python' | 'json' | 'css' | 'html' | 'yaml' | 'markdown' | 'agentprime';
}

export interface LanguageDiagnosticsResult {
  success: boolean;
  diagnostics: LanguageDiagnostic[];
  language: string;
  error?: string;
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const PYTHON_EXTENSIONS = new Set(['.py', '.pyw']);
const JSON_EXTENSIONS = new Set(['.json', '.jsonc']);
const CSS_EXTENSIONS = new Set(['.css', '.scss', '.less']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);

function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/').toLowerCase();
}

function resolveWorkspaceFile(workspacePath: string, filePath: string): string {
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(workspacePath, filePath);
  const relative = path.relative(workspacePath, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('File is outside the active workspace');
  }

  return resolved;
}

function getLanguageKind(filePath: string, language?: string): string {
  const normalizedLanguage = (language || '').toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  if (TS_EXTENSIONS.has(ext) || ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(normalizedLanguage)) {
    return 'typescript';
  }
  if (PYTHON_EXTENSIONS.has(ext) || normalizedLanguage === 'python') {
    return 'python';
  }
  if (JSON_EXTENSIONS.has(ext) || normalizedLanguage === 'json' || normalizedLanguage === 'jsonc') {
    return 'json';
  }
  if (CSS_EXTENSIONS.has(ext) || ['css', 'scss', 'less'].includes(normalizedLanguage)) {
    return ext === '.scss' ? 'scss' : ext === '.less' ? 'less' : normalizedLanguage || 'css';
  }
  if (HTML_EXTENSIONS.has(ext) || normalizedLanguage === 'html') {
    return 'html';
  }
  if (YAML_EXTENSIONS.has(ext) || normalizedLanguage === 'yaml') {
    return 'yaml';
  }
  if (MARKDOWN_EXTENSIONS.has(ext) || normalizedLanguage === 'markdown') {
    return 'markdown';
  }

  return normalizedLanguage || 'plaintext';
}

function getFallbackCompilerOptions(): ts.CompilerOptions {
  return {
    allowJs: true,
    checkJs: false,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    skipLibCheck: true,
    strict: false,
    target: ts.ScriptTarget.ES2022,
  };
}

function loadProjectConfig(workspacePath: string): ts.ParsedCommandLine {
  const configPath = ts.findConfigFile(workspacePath, ts.sys.fileExists, 'tsconfig.json');

  if (!configPath) {
    return {
      options: getFallbackCompilerOptions(),
      fileNames: [],
      errors: [],
    };
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    return {
      options: getFallbackCompilerOptions(),
      fileNames: [],
      errors: [configFile.error],
    };
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    { noEmit: true },
    configPath
  );

  return parsed;
}

function tsDiagnosticToEditorIssue(diagnostic: ts.Diagnostic): LanguageDiagnostic | null {
  if (!diagnostic.file || diagnostic.start === undefined) {
    return null;
  }

  const start = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  const end = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start + Math.max(diagnostic.length || 1, 1)
  );

  return {
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
    ruleId: `TS${diagnostic.code}`,
    source: 'typescript',
  };
}

export function getTypeScriptDiagnostics(
  request: LanguageDiagnosticsRequest,
  defaultWorkspacePath: string | null
): LanguageDiagnosticsResult {
  const workspacePath = request.workspacePath || defaultWorkspacePath;
  if (!workspacePath) {
    return { success: false, diagnostics: [], language: 'typescript', error: 'No workspace' };
  }

  const fullPath = resolveWorkspaceFile(workspacePath, request.filePath);
  const ext = path.extname(fullPath).toLowerCase();
  if (!TS_EXTENSIONS.has(ext)) {
    return { success: true, diagnostics: [], language: 'typescript' };
  }

  try {
    const parsed = loadProjectConfig(workspacePath);
    const options: ts.CompilerOptions = {
      ...getFallbackCompilerOptions(),
      ...parsed.options,
      allowJs: parsed.options.allowJs ?? true,
      noEmit: true,
    };
    const normalizedActivePath = normalizeFilePath(fullPath);
    const rootNames = parsed.fileNames.some((fileName) => normalizeFilePath(fileName) === normalizedActivePath)
      ? parsed.fileNames
      : [...parsed.fileNames, fullPath];

    const host = ts.createCompilerHost(options, true);
    const originalFileExists = host.fileExists.bind(host);
    const originalReadFile = host.readFile.bind(host);
    const originalGetSourceFile = host.getSourceFile.bind(host);

    host.fileExists = (fileName: string): boolean => {
      return normalizeFilePath(fileName) === normalizedActivePath || originalFileExists(fileName);
    };

    host.readFile = (fileName: string): string | undefined => {
      return normalizeFilePath(fileName) === normalizedActivePath
        ? request.content
        : originalReadFile(fileName);
    };

    host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
      if (normalizeFilePath(fileName) === normalizedActivePath) {
        return ts.createSourceFile(fileName, request.content, languageVersion, true);
      }
      return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    };

    const program = ts.createProgram(rootNames, options, host);
    const sourceFile = program.getSourceFile(fullPath);
    if (!sourceFile) {
      return { success: true, diagnostics: [], language: 'typescript' };
    }

    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ];

    return {
      success: true,
      diagnostics: diagnostics
        .map(tsDiagnosticToEditorIssue)
        .filter((diagnostic): diagnostic is LanguageDiagnostic => diagnostic !== null),
      language: 'typescript',
    };
  } catch (error: any) {
    return {
      success: false,
      diagnostics: [],
      language: 'typescript',
      error: error?.message || 'Failed to collect TypeScript diagnostics',
    };
  }
}

function lspSeverityToEditorSeverity(severity?: number): 'error' | 'warning' {
  return severity === 1 ? 'error' : 'warning';
}

function lspDiagnosticToEditorIssue(
  diagnostic: any,
  source: LanguageDiagnostic['source'],
  fallbackCode: string
): LanguageDiagnostic {
  return {
    line: diagnostic.range.start.line + 1,
    column: diagnostic.range.start.character + 1,
    endLine: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
    message: diagnostic.message,
    severity: lspSeverityToEditorSeverity(diagnostic.severity),
    ruleId: String(diagnostic.code || fallbackCode),
    source,
  };
}

async function getJsonDiagnostics(
  request: LanguageDiagnosticsRequest,
  languageKind: string
): Promise<LanguageDiagnosticsResult> {
  const document = TextDocument.create(`inmemory://model/${path.basename(request.filePath)}`, languageKind, 0, request.content);
  const service = getJSONLanguageService({});
  const jsonDocument = service.parseJSONDocument(document);
  const diagnostics = await service.doValidation(document, jsonDocument, {
    comments: languageKind === 'jsonc' ? 'ignore' : 'error',
    trailingCommas: 'warning',
  });

  return {
    success: true,
    diagnostics: diagnostics.map((diagnostic) => lspDiagnosticToEditorIssue(diagnostic, 'json', 'JSON')),
    language: languageKind,
  };
}

function getCssDiagnostics(request: LanguageDiagnosticsRequest, languageKind: string): LanguageDiagnosticsResult {
  const document = TextDocument.create(`inmemory://model/${path.basename(request.filePath)}`, languageKind, 0, request.content);
  const service = languageKind === 'scss'
    ? getSCSSLanguageService()
    : languageKind === 'less'
      ? getLESSLanguageService()
      : getCSSLanguageService();
  const stylesheet = service.parseStylesheet(document);
  const diagnostics = service.doValidation(document, stylesheet);

  return {
    success: true,
    diagnostics: diagnostics.map((diagnostic) => lspDiagnosticToEditorIssue(diagnostic, 'css', 'CSS')),
    language: languageKind,
  };
}

function getHtmlDiagnostics(request: LanguageDiagnosticsRequest): LanguageDiagnosticsResult {
  const diagnostics = getBasicHtmlStructuralDiagnostics(request.content);

  return {
    success: true,
    diagnostics,
    language: 'html',
  };
}

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function getBasicHtmlStructuralDiagnostics(content: string): LanguageDiagnostic[] {
  const lineCounter = new TextDocumentLineCounter(content);
  const tagPattern = /<\/?([A-Za-z][\w:-]*)(?:\s[^<>]*)?>/g;
  const stack: Array<{ tag: string; offset: number }> = [];
  const diagnostics: LanguageDiagnostic[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(content)) !== null) {
    const rawTag = match[0];
    const tagName = match[1].toLowerCase();

    if (rawTag.startsWith('<!') || rawTag.startsWith('<?')) {
      continue;
    }

    const isClosing = rawTag.startsWith('</');
    const isSelfClosing = rawTag.endsWith('/>') || VOID_HTML_TAGS.has(tagName);

    if (!isClosing && !isSelfClosing) {
      stack.push({ tag: tagName, offset: match.index });
      continue;
    }

    if (isClosing) {
      const top = stack.pop();
      if (!top || top.tag !== tagName) {
        const position = lineCounter.positionAt(match.index);
        diagnostics.push({
          line: position.line,
          column: position.column,
          endLine: position.line,
          endColumn: position.column + rawTag.length,
          message: top
            ? `Expected closing tag </${top.tag}> before </${tagName}>.`
            : `Closing tag </${tagName}> has no matching opening tag.`,
          severity: 'error',
          ruleId: 'HTMLTagMismatch',
          source: 'html',
        });
      }
    }
  }

  for (const unclosed of stack.slice(-20)) {
    const position = lineCounter.positionAt(unclosed.offset);
    diagnostics.push({
      line: position.line,
      column: position.column,
      endLine: position.line,
      endColumn: position.column + unclosed.tag.length + 1,
      message: `Opening tag <${unclosed.tag}> is missing a closing tag.`,
      severity: 'warning',
      ruleId: 'HTMLUnclosedTag',
      source: 'html',
    });
  }

  return diagnostics;
}

function yamlErrorToDiagnostic(error: any, content: string): LanguageDiagnostic {
  const lineCounter = new TextDocumentLineCounter(content);
  const pos = typeof error.pos?.[0] === 'number' ? error.pos[0] : 0;
  const location = lineCounter.positionAt(pos);

  return {
    line: location.line,
    column: location.column,
    endLine: location.line,
    endColumn: location.column + 1,
    message: error.message || 'Invalid YAML',
    severity: error.name === 'YAMLWarning' ? 'warning' : 'error',
    ruleId: error.code || 'YAML',
    source: 'yaml',
  };
}

class TextDocumentLineCounter {
  private readonly lineStarts: number[] = [0];

  constructor(content: string) {
    for (let index = 0; index < content.length; index++) {
      if (content[index] === '\n') {
        this.lineStarts.push(index + 1);
      }
    }
  }

  positionAt(offset: number): { line: number; column: number } {
    let low = 0;
    let high = this.lineStarts.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.lineStarts[mid] <= offset) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const lineIndex = Math.max(0, high);
    return {
      line: lineIndex + 1,
      column: offset - this.lineStarts[lineIndex] + 1,
    };
  }
}

function getYamlDiagnostics(request: LanguageDiagnosticsRequest, languageKind: 'yaml' | 'markdown'): LanguageDiagnosticsResult {
  const source = languageKind === 'markdown' ? 'markdown' : 'yaml';
  const yamlContent = languageKind === 'markdown'
    ? extractMarkdownFrontmatter(request.content)
    : { content: request.content, startLineOffset: 0 };

  if (!yamlContent) {
    return { success: true, diagnostics: [], language: languageKind };
  }

  const document = parseYamlDocument(yamlContent.content);
  const diagnostics = [...document.errors, ...document.warnings].map((error) => {
    const issue = yamlErrorToDiagnostic(error, yamlContent.content);
    issue.line += yamlContent.startLineOffset;
    issue.endLine = (issue.endLine || issue.line) + yamlContent.startLineOffset;
    issue.source = source;
    return issue;
  });

  return {
    success: true,
    diagnostics,
    language: languageKind,
  };
}

function extractMarkdownFrontmatter(content: string): { content: string; startLineOffset: number } | null {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return null;
  }

  const lineEnding = content.startsWith('---\r\n') ? '\r\n' : '\n';
  const endMarker = `${lineEnding}---${lineEnding}`;
  const endIndex = content.indexOf(endMarker, 3);
  if (endIndex === -1) {
    return null;
  }

  const start = content.indexOf(lineEnding) + lineEnding.length;
  return {
    content: content.slice(start, endIndex),
    startLineOffset: 1,
  };
}

async function getPythonDiagnostics(request: LanguageDiagnosticsRequest): Promise<LanguageDiagnosticsResult> {
  const tempPath = path.join(os.tmpdir(), `agentprime-python-${Date.now()}-${Math.random().toString(36).slice(2)}.py`);
  const script = [
    'import json, py_compile, sys',
    'path = sys.argv[1]',
    'try:',
    '    py_compile.compile(path, doraise=True)',
    '    print(json.dumps({"ok": True}))',
    'except py_compile.PyCompileError as error:',
    '    value = error.exc_value',
    '    print(json.dumps({',
    '        "ok": False,',
    '        "line": getattr(value, "lineno", 1) or 1,',
    '        "column": getattr(value, "offset", 1) or 1,',
    '        "endLine": getattr(value, "end_lineno", None),',
    '        "endColumn": getattr(value, "end_offset", None),',
    '        "message": str(value),',
    '        "code": value.__class__.__name__',
    '    }))',
    '    sys.exit(1)',
  ].join('\n');

  fs.writeFileSync(tempPath, request.content, 'utf8');

  try {
    await runPythonCompile('python', ['-c', script, tempPath]);
    return { success: true, diagnostics: [], language: 'python' };
  } catch (firstError: any) {
    try {
      await runPythonCompile('py', ['-3', '-c', script, tempPath]);
      return { success: true, diagnostics: [], language: 'python' };
    } catch (secondError: any) {
      const parsed = parsePythonCompileOutput(secondError?.stdout || firstError?.stdout || '');
      if (parsed) {
        return { success: true, diagnostics: [parsed], language: 'python' };
      }

      return {
        success: false,
        diagnostics: [],
        language: 'python',
        error: secondError?.message || firstError?.message || 'Python diagnostics unavailable',
      };
    }
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup only.
    }
  }
}

async function runPythonCompile(command: string, args: string[]): Promise<void> {
  await execFileAsync(command, args, {
    timeout: 10000,
    windowsHide: true,
  });
}

function parsePythonCompileOutput(stdout: string): LanguageDiagnostic | null {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  const lastLine = lines[lines.length - 1];
  if (!lastLine) {
    return null;
  }

  try {
    const parsed = JSON.parse(lastLine);
    if (parsed.ok) {
      return null;
    }

    return {
      line: parsed.line || 1,
      column: parsed.column || 1,
      endLine: parsed.endLine || parsed.line || 1,
      endColumn: parsed.endColumn || (parsed.column || 1) + 1,
      message: parsed.message || 'Python syntax error',
      severity: 'error',
      ruleId: parsed.code || 'PythonSyntax',
      source: 'python',
    };
  } catch {
    return null;
  }
}

export async function getLanguageDiagnostics(
  request: LanguageDiagnosticsRequest,
  defaultWorkspacePath: string | null
): Promise<LanguageDiagnosticsResult> {
  const workspacePath = request.workspacePath || defaultWorkspacePath;
  if (!workspacePath) {
    return { success: false, diagnostics: [], language: request.language || 'unknown', error: 'No workspace' };
  }

  const fullPath = resolveWorkspaceFile(workspacePath, request.filePath);
  const languageKind = getLanguageKind(fullPath, request.language);

  if (languageKind === 'typescript') {
    return getTypeScriptDiagnostics(request, defaultWorkspacePath);
  }
  if (languageKind === 'python') {
    return getPythonDiagnostics(request);
  }
  if (languageKind === 'json') {
    const ext = path.extname(fullPath).toLowerCase();
    return getJsonDiagnostics(request, ext === '.jsonc' ? 'jsonc' : 'json');
  }
  if (['css', 'scss', 'less'].includes(languageKind)) {
    return getCssDiagnostics(request, languageKind);
  }
  if (languageKind === 'html') {
    return getHtmlDiagnostics(request);
  }
  if (languageKind === 'yaml') {
    return getYamlDiagnostics(request, 'yaml');
  }
  if (languageKind === 'markdown') {
    return getYamlDiagnostics(request, 'markdown');
  }

  return { success: true, diagnostics: [], language: languageKind };
}
