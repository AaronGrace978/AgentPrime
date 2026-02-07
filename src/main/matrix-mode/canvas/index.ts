/**
 * Matrix Mode Canvas System
 * Visual workspace for AI-generated UI (A2UI)
 */

import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';

// Types
export interface CanvasConfig {
  width: number;
  height: number;
  backgroundColor: string;
  theme: 'matrix' | 'dark' | 'light';
}

export interface A2UIComponent {
  type: 'text' | 'button' | 'input' | 'image' | 'card' | 'list' | 'chart' | 'container';
  id: string;
  props: Record<string, any>;
  children?: A2UIComponent[];
  styles?: Record<string, string>;
}

export interface CanvasState {
  visible: boolean;
  url?: string;
  components: A2UIComponent[];
  lastUpdate: number;
}

const DEFAULT_CONFIG: CanvasConfig = {
  width: 800,
  height: 600,
  backgroundColor: '#0a0a0a',
  theme: 'matrix'
};

// Matrix-themed CSS
const MATRIX_STYLES = `
  :root {
    --matrix-green: #00ff41;
    --matrix-green-dim: #00cc33;
    --matrix-black: #0a0a0a;
    --matrix-gray: #1a1a1a;
  }
  
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  body {
    background: var(--matrix-black);
    color: var(--matrix-green);
    font-family: 'Consolas', 'Monaco', monospace;
    padding: 20px;
    min-height: 100vh;
  }
  
  .a2ui-text {
    color: var(--matrix-green);
    text-shadow: 0 0 5px var(--matrix-green);
  }
  
  .a2ui-button {
    background: transparent;
    border: 1px solid var(--matrix-green);
    color: var(--matrix-green);
    padding: 10px 20px;
    cursor: pointer;
    font-family: inherit;
    text-shadow: 0 0 5px var(--matrix-green);
    transition: all 0.2s;
  }
  
  .a2ui-button:hover {
    background: var(--matrix-green);
    color: var(--matrix-black);
  }
  
  .a2ui-input {
    background: var(--matrix-gray);
    border: 1px solid var(--matrix-green-dim);
    color: var(--matrix-green);
    padding: 10px;
    font-family: inherit;
    width: 100%;
  }
  
  .a2ui-input:focus {
    outline: none;
    border-color: var(--matrix-green);
    box-shadow: 0 0 10px var(--matrix-green);
  }
  
  .a2ui-card {
    background: var(--matrix-gray);
    border: 1px solid var(--matrix-green-dim);
    padding: 20px;
    margin: 10px 0;
  }
  
  .a2ui-list {
    list-style: none;
  }
  
  .a2ui-list li {
    padding: 10px;
    border-bottom: 1px solid var(--matrix-green-dim);
  }
  
  .a2ui-list li:last-child {
    border-bottom: none;
  }
  
  .a2ui-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .a2ui-container.row {
    flex-direction: row;
  }
  
  h1, h2, h3 {
    color: var(--matrix-green);
    text-shadow: 0 0 10px var(--matrix-green);
  }
`;

/**
 * A2UI Renderer - Converts AI component definitions to HTML
 */
export class A2UIRenderer {
  private config: CanvasConfig;

  constructor(config: Partial<CanvasConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Render a component tree to HTML
   */
  renderToHTML(components: A2UIComponent[]): string {
    const content = components.map(c => this.renderComponent(c)).join('\n');
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${MATRIX_STYLES}</style>
      </head>
      <body>
        ${content}
        <script>
          // Send interactions back to main process
          document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-a2ui-id]');
            if (target) {
              window.postMessage({
                type: 'a2ui-interaction',
                action: 'click',
                id: target.dataset.a2uiId
              }, '*');
            }
          });
          
          document.addEventListener('input', (e) => {
            if (e.target.dataset?.a2uiId) {
              window.postMessage({
                type: 'a2ui-interaction',
                action: 'input',
                id: e.target.dataset.a2uiId,
                value: e.target.value
              }, '*');
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Render a single component
   */
  private renderComponent(component: A2UIComponent): string {
    const { type, id, props, children, styles } = component;
    const styleStr = styles ? Object.entries(styles).map(([k, v]) => `${k}:${v}`).join(';') : '';
    const childrenHTML = children ? children.map(c => this.renderComponent(c)).join('\n') : '';

    switch (type) {
      case 'text':
        const tag = props.variant === 'h1' ? 'h1' : 
                   props.variant === 'h2' ? 'h2' :
                   props.variant === 'h3' ? 'h3' : 'p';
        return `<${tag} class="a2ui-text" data-a2ui-id="${id}" style="${styleStr}">${props.text || ''}</${tag}>`;

      case 'button':
        return `<button class="a2ui-button" data-a2ui-id="${id}" style="${styleStr}">${props.label || 'Button'}</button>`;

      case 'input':
        return `<input class="a2ui-input" data-a2ui-id="${id}" type="${props.type || 'text'}" placeholder="${props.placeholder || ''}" value="${props.value || ''}" style="${styleStr}" />`;

      case 'image':
        return `<img class="a2ui-image" data-a2ui-id="${id}" src="${props.src || ''}" alt="${props.alt || ''}" style="${styleStr}" />`;

      case 'card':
        return `<div class="a2ui-card" data-a2ui-id="${id}" style="${styleStr}">
          ${props.title ? `<h3>${props.title}</h3>` : ''}
          ${props.content ? `<p>${props.content}</p>` : ''}
          ${childrenHTML}
        </div>`;

      case 'list':
        const items = (props.items || []).map((item: string, i: number) => `<li>${item}</li>`).join('');
        return `<ul class="a2ui-list" data-a2ui-id="${id}" style="${styleStr}">${items}${childrenHTML}</ul>`;

      case 'container':
        return `<div class="a2ui-container ${props.direction === 'row' ? 'row' : ''}" data-a2ui-id="${id}" style="${styleStr}">${childrenHTML}</div>`;

      default:
        return `<div data-a2ui-id="${id}" style="${styleStr}">${childrenHTML}</div>`;
    }
  }
}

/**
 * Canvas Manager - Manages the canvas window
 */
export class CanvasManager extends EventEmitter {
  private config: CanvasConfig;
  private window: BrowserWindow | null = null;
  private renderer: A2UIRenderer;
  private state: CanvasState = {
    visible: false,
    components: [],
    lastUpdate: 0
  };

  constructor(config: Partial<CanvasConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.renderer = new A2UIRenderer(config);
  }

  /**
   * Create and show canvas window
   */
  async show(): Promise<void> {
    if (this.window) {
      this.window.show();
      this.window.focus();
      this.state.visible = true;
      return;
    }

    this.window = new BrowserWindow({
      width: this.config.width,
      height: this.config.height,
      backgroundColor: this.config.backgroundColor,
      title: 'Matrix Canvas',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // Handle interactions
    this.window.webContents.on('ipc-message', (event, channel, data) => {
      if (data.type === 'a2ui-interaction') {
        this.emit('interaction', data);
      }
    });

    this.window.on('closed', () => {
      this.window = null;
      this.state.visible = false;
      this.emit('closed');
    });

    // Load empty canvas
    await this.render([]);
    this.state.visible = true;
  }

  /**
   * Hide canvas window
   */
  hide(): void {
    if (this.window) {
      this.window.hide();
      this.state.visible = false;
    }
  }

  /**
   * Close canvas window
   */
  close(): void {
    if (this.window) {
      this.window.close();
      this.window = null;
      this.state.visible = false;
    }
  }

  /**
   * Navigate to URL
   */
  async navigate(url: string): Promise<void> {
    if (!this.window) {
      await this.show();
    }
    await this.window!.loadURL(url);
    this.state.url = url;
  }

  /**
   * Render A2UI components
   */
  async render(components: A2UIComponent[]): Promise<void> {
    if (!this.window) {
      await this.show();
    }

    const html = this.renderer.renderToHTML(components);
    await this.window!.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    
    this.state.components = components;
    this.state.lastUpdate = Date.now();
    this.state.url = undefined;
  }

  /**
   * Push new components (append)
   */
  async push(components: A2UIComponent[]): Promise<void> {
    const allComponents = [...this.state.components, ...components];
    await this.render(allComponents);
  }

  /**
   * Clear canvas
   */
  async clear(): Promise<void> {
    await this.render([]);
  }

  /**
   * Take screenshot
   */
  async screenshot(): Promise<Buffer | null> {
    if (!this.window) return null;
    
    const image = await this.window.webContents.capturePage();
    return image.toPNG();
  }

  /**
   * Execute JavaScript in canvas
   */
  async evaluate(script: string): Promise<any> {
    if (!this.window) return null;
    return this.window.webContents.executeJavaScript(script);
  }

  /**
   * Get canvas state
   */
  getState(): CanvasState {
    return { ...this.state };
  }

  /**
   * Check if canvas is visible
   */
  isVisible(): boolean {
    return this.state.visible;
  }
}

// Singleton
let canvasManagerInstance: CanvasManager | null = null;

export function getCanvasManager(config?: Partial<CanvasConfig>): CanvasManager {
  if (!canvasManagerInstance) {
    canvasManagerInstance = new CanvasManager(config);
  }
  return canvasManagerInstance;
}

export default CanvasManager;
