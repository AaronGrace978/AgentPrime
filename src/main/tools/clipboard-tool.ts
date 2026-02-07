/**
 * Clipboard Tool - Read from and write to system clipboard
 */

import { BaseTool, ToolParameter } from './base-tool';
import { clipboard, nativeImage } from 'electron';

/**
 * Clipboard Read Tool
 */
export class ClipboardReadTool extends BaseTool {
  constructor() {
    super(
      'clipboard_read',
      'Read the current contents of the system clipboard (text or image).',
      {
        format: {
          type: 'string',
          required: false,
          description: 'Format to read: "text", "html", "rtf", "image", or "all" (default: "text")'
        }
      }
    );
  }

  async execute(args: { format?: string }): Promise<{
    success: boolean;
    text?: string;
    html?: string;
    rtf?: string;
    hasImage: boolean;
    imagePath?: string;
    formats: string[];
  }> {
    const { format = 'text' } = args;
    console.log(`[Clipboard] Reading clipboard (format: ${format})`);

    const result: any = {
      success: true,
      hasImage: false,
      formats: clipboard.availableFormats()
    };

    try {
      switch (format) {
        case 'text':
          result.text = clipboard.readText();
          break;

        case 'html':
          result.html = clipboard.readHTML();
          result.text = clipboard.readText();
          break;

        case 'rtf':
          result.rtf = clipboard.readRTF();
          result.text = clipboard.readText();
          break;

        case 'image':
          const image = clipboard.readImage();
          if (!image.isEmpty()) {
            result.hasImage = true;
            // Save to temp file
            const fs = require('fs');
            const path = require('path');
            const tempPath = path.join(
              process.env.TEMP || '/tmp',
              `clipboard-${Date.now()}.png`
            );
            fs.writeFileSync(tempPath, image.toPNG());
            result.imagePath = tempPath;
            console.log(`[Clipboard] Image saved to: ${tempPath}`);
          }
          break;

        case 'all':
          result.text = clipboard.readText();
          result.html = clipboard.readHTML();
          result.rtf = clipboard.readRTF();
          const img = clipboard.readImage();
          result.hasImage = !img.isEmpty();
          break;

        default:
          result.text = clipboard.readText();
      }

      console.log(`[Clipboard] Read ${result.text?.length || 0} characters`);

    } catch (error: any) {
      result.success = false;
      result.error = error.message;
      console.error('[Clipboard] Read error:', error.message);
    }

    return result;
  }
}

/**
 * Clipboard Write Tool
 */
export class ClipboardWriteTool extends BaseTool {
  constructor() {
    super(
      'clipboard_write',
      'Write content to the system clipboard.',
      {
        text: {
          type: 'string',
          required: false,
          description: 'Text to write to clipboard'
        },
        html: {
          type: 'string',
          required: false,
          description: 'HTML to write to clipboard'
        },
        imagePath: {
          type: 'string',
          required: false,
          description: 'Path to image file to copy to clipboard'
        }
      }
    );
  }

  async execute(args: { 
    text?: string; 
    html?: string; 
    imagePath?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { text, html, imagePath } = args;

    if (!text && !html && !imagePath) {
      return { success: false, message: 'Must provide text, html, or imagePath' };
    }

    try {
      if (imagePath) {
        const fs = require('fs');
        if (!fs.existsSync(imagePath)) {
          return { success: false, message: `Image not found: ${imagePath}` };
        }
        const image = nativeImage.createFromPath(imagePath);
        if (image.isEmpty()) {
          return { success: false, message: 'Failed to load image' };
        }
        clipboard.writeImage(image);
        console.log(`[Clipboard] Wrote image from: ${imagePath}`);
        return { success: true, message: 'Image copied to clipboard' };
      }

      if (html && text) {
        // Write both HTML and text (for rich paste support)
        clipboard.write({
          text: text,
          html: html
        });
        console.log(`[Clipboard] Wrote HTML and text (${text.length} chars)`);
        return { success: true, message: `Copied ${text.length} characters (HTML + text)` };
      }

      if (text) {
        clipboard.writeText(text);
        console.log(`[Clipboard] Wrote text: ${text.length} characters`);
        return { success: true, message: `Copied ${text.length} characters to clipboard` };
      }

      if (html) {
        clipboard.writeHTML(html);
        console.log(`[Clipboard] Wrote HTML: ${html.length} characters`);
        return { success: true, message: `Copied HTML (${html.length} characters) to clipboard` };
      }

      return { success: false, message: 'Nothing to write' };

    } catch (error: any) {
      console.error('[Clipboard] Write error:', error.message);
      return { success: false, message: error.message };
    }
  }
}

/**
 * Clipboard Clear Tool
 */
export class ClipboardClearTool extends BaseTool {
  constructor() {
    super(
      'clipboard_clear',
      'Clear the system clipboard.',
      {}
    );
  }

  async execute(): Promise<{ success: boolean }> {
    try {
      clipboard.clear();
      console.log('[Clipboard] Cleared');
      return { success: true };
    } catch (error: any) {
      console.error('[Clipboard] Clear error:', error.message);
      return { success: false };
    }
  }
}

/**
 * Clipboard History Tool - Track clipboard history during session
 */
export class ClipboardHistoryTool extends BaseTool {
  private static history: { timestamp: Date; text: string; source?: string }[] = [];
  private static maxHistory = 50;
  private static watcher: any = null;

  constructor() {
    super(
      'clipboard_history',
      'Get or manage clipboard history from this session.',
      {
        action: {
          type: 'string',
          required: false,
          description: 'Action: "get" (default), "clear", "start_watching", "stop_watching"'
        },
        limit: {
          type: 'number',
          required: false,
          description: 'Number of history items to return (default: 10)'
        }
      }
    );
  }

  async execute(args: { action?: string; limit?: number }): Promise<any> {
    const { action = 'get', limit = 10 } = args;

    switch (action) {
      case 'get':
        return {
          success: true,
          history: ClipboardHistoryTool.history.slice(-limit).reverse(),
          total: ClipboardHistoryTool.history.length
        };

      case 'clear':
        ClipboardHistoryTool.history = [];
        return { success: true, message: 'Clipboard history cleared' };

      case 'start_watching':
        if (!ClipboardHistoryTool.watcher) {
          let lastText = clipboard.readText();
          ClipboardHistoryTool.watcher = setInterval(() => {
            const currentText = clipboard.readText();
            if (currentText && currentText !== lastText) {
              ClipboardHistoryTool.history.push({
                timestamp: new Date(),
                text: currentText.substring(0, 1000) // Limit stored length
              });
              if (ClipboardHistoryTool.history.length > ClipboardHistoryTool.maxHistory) {
                ClipboardHistoryTool.history.shift();
              }
              lastText = currentText;
            }
          }, 1000);
          console.log('[Clipboard] Started watching clipboard');
          return { success: true, message: 'Now watching clipboard changes' };
        }
        return { success: true, message: 'Already watching clipboard' };

      case 'stop_watching':
        if (ClipboardHistoryTool.watcher) {
          clearInterval(ClipboardHistoryTool.watcher);
          ClipboardHistoryTool.watcher = null;
          console.log('[Clipboard] Stopped watching clipboard');
          return { success: true, message: 'Stopped watching clipboard' };
        }
        return { success: true, message: 'Not currently watching clipboard' };

      default:
        return { success: false, message: `Unknown action: ${action}` };
    }
  }
}

