/**
 * AgentPrime - Plugin API Types
 * Extensible architecture for third-party integrations
 */

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords: string[];
  engines: {
    agentprime: string;
  };
  main: string;
  activationEvents?: string[];
  contributes?: PluginContributions;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface PluginContributions {
  commands?: CommandContribution[];
  menus?: MenuContribution[];
  keybindings?: KeybindingContribution[];
  configuration?: ConfigurationContribution[];
  languages?: LanguageContribution[];
  themes?: ThemeContribution[];
  views?: ViewContribution[];
  editors?: EditorContribution[];
  aiProviders?: AIProviderContribution[];
}

export interface CommandContribution {
  command: string;
  title: string;
  category?: string;
  icon?: string;
  when?: string;
}

export interface MenuContribution {
  id: string;
  label?: string;
  command?: string;
  submenu?: string;
  group?: string;
  when?: string;
  icon?: string;
}

export interface KeybindingContribution {
  command: string;
  key: string;
  mac?: string;
  linux?: string;
  win?: string;
  when?: string;
}

export interface ConfigurationContribution {
  title: string;
  properties: Record<string, ConfigurationProperty>;
}

export interface ConfigurationProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: any;
  description?: string;
  enum?: string[];
  enumDescriptions?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  pattern?: string;
}

export interface LanguageContribution {
  id: string;
  aliases: string[];
  extensions: string[];
  filenames?: string[];
  firstLine?: string;
  configuration?: string;
}

export interface ThemeContribution {
  label: string;
  uiTheme: 'vs' | 'vs-dark' | 'hc-black';
  path: string;
}

export interface ViewContribution {
  id: string;
  name: string;
  type?: 'tree' | 'webview';
  icon?: string;
  contextualTitle?: string;
  when?: string;
}

export interface EditorContribution {
  viewType: string;
  displayName: string;
  selector?: {
    filenamePattern?: string;
  }[];
}

export interface AIProviderContribution {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  configSchema: any;
}

export interface PluginContext {
  subscriptions: Disposable[];
  workspace: WorkspaceApi;
  commands: CommandsApi;
  window: WindowApi;
  extensions: ExtensionsApi;
  ai: AIApi;
  storage: StorageApi;
}

export interface Disposable {
  dispose(): void;
}

export interface WorkspaceApi {
  rootPath: string | undefined;
  name: string | undefined;
  findFiles(include: string, exclude?: string): Promise<string[]>;
  openTextDocument(uri: string): Promise<TextDocument>;
  onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>;
}

export interface TextDocument {
  uri: string;
  fileName: string;
  isDirty: boolean;
  languageId: string;
  getText(): string;
  lineCount: number;
  save(): Promise<boolean>;
}

export interface WorkspaceFoldersChangeEvent {
  added: WorkspaceFolder[];
  removed: WorkspaceFolder[];
}

export interface WorkspaceFolder {
  uri: string;
  name: string;
  index: number;
}

export interface CommandsApi {
  registerCommand(command: string, handler: (...args: any[]) => any): Disposable;
  executeCommand<T>(command: string, ...args: any[]): Promise<T>;
}

export interface WindowApi {
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
  showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
  createOutputChannel(name: string): OutputChannel;
  createStatusBarItem(alignment?: 'left' | 'right', priority?: number): StatusBarItem;
}

export interface OutputChannel {
  name: string;
  append(value: string): void;
  appendLine(value: string): void;
  clear(): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface StatusBarItem {
  text: string;
  tooltip?: string;
  command?: string;
  color?: string;
  backgroundColor?: string;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface ExtensionsApi {
  getExtension(extensionId: string): Extension<any> | undefined;
  getExtensionContext(extensionId: string): PluginContext | undefined;
}

export interface Extension<T> {
  id: string;
  extensionPath: string;
  isActive: boolean;
  packageJSON: any;
  exports: T;
  activate(): Promise<T>;
}

export interface AIApi {
  registerProvider(provider: AIProvider): Disposable;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  complete(prompt: string, options?: CompletionOptions): Promise<CompletionResponse>;
}

export interface AIProvider {
  id: string;
  name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  complete(prompt: string, options?: CompletionOptions): Promise<CompletionResponse>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  usage?: TokenUsage;
  finishReason?: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

export interface CompletionResponse {
  text: string;
  usage?: TokenUsage;
  finishReason?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StorageApi {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface Event<T> {
  (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
}

export interface PluginHost {
  activatePlugin(pluginId: string): Promise<void>;
  deactivatePlugin(pluginId: string): Promise<void>;
  reloadPlugin(pluginId: string): Promise<void>;
  getPluginContext(pluginId: string): PluginContext | undefined;
}

export interface PluginSandbox {
  executeCode(code: string, context: PluginContext): Promise<any>;
  validateCode(code: string): Promise<ValidationResult>;
  isolatePlugin(pluginId: string, manifest: PluginManifest): Promise<IsolatedPlugin>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface IsolatedPlugin {
  id: string;
  context: PluginContext;
  execute(method: string, ...args: any[]): Promise<any>;
  dispose(): Promise<void>;
}
