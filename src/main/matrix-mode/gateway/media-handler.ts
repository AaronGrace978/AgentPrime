/**
 * Matrix Mode Media Handler
 * Handles images, audio, video, and document attachments
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { MediaAttachment } from './types';

// Generate unique ID
function generateId(): string {
  return `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface MediaFile {
  id: string;
  type: MediaAttachment['type'];
  path: string;
  mimeType: string;
  filename: string;
  size: number;
  hash: string;
  createdAt: number;
  metadata?: Record<string, any>;
}

export interface MediaUploadResult {
  success: boolean;
  file?: MediaFile;
  error?: string;
}

export interface MediaDownloadResult {
  success: boolean;
  data?: Buffer;
  file?: MediaFile;
  error?: string;
}

export class MediaHandler {
  private mediaDir: string;
  private maxFileSize: number = 100 * 1024 * 1024; // 100MB
  private allowedMimeTypes: Map<string, string[]> = new Map([
    ['image', ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']],
    ['audio', ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac', 'audio/opus']],
    ['video', ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']],
    ['document', ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/json']],
    ['sticker', ['image/webp', 'image/gif', 'image/png']]
  ]);
  private fileCache: Map<string, MediaFile> = new Map();

  constructor(mediaDir?: string) {
    const userDataPath = app?.getPath?.('userData') || process.cwd();
    this.mediaDir = mediaDir || path.join(userDataPath, 'matrix-media');
    this.ensureMediaDir();
  }

  /**
   * Ensure media directory exists
   */
  private ensureMediaDir(): void {
    if (!fs.existsSync(this.mediaDir)) {
      fs.mkdirSync(this.mediaDir, { recursive: true });
    }
    
    // Create subdirectories for different types
    for (const type of ['image', 'audio', 'video', 'document', 'sticker']) {
      const typeDir = path.join(this.mediaDir, type);
      if (!fs.existsSync(typeDir)) {
        fs.mkdirSync(typeDir, { recursive: true });
      }
    }
  }

  /**
   * Get file type from mime type
   */
  private getTypeFromMime(mimeType: string): MediaAttachment['type'] | null {
    for (const [type, mimes] of this.allowedMimeTypes) {
      if (mimes.includes(mimeType)) {
        return type as MediaAttachment['type'];
      }
    }
    return null;
  }

  /**
   * Calculate file hash
   */
  private calculateHash(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Save media from buffer
   */
  async saveFromBuffer(
    data: Buffer,
    mimeType: string,
    filename?: string,
    metadata?: Record<string, any>
  ): Promise<MediaUploadResult> {
    // Check file size
    if (data.length > this.maxFileSize) {
      return { success: false, error: 'File too large' };
    }

    // Determine file type
    const type = this.getTypeFromMime(mimeType);
    if (!type) {
      return { success: false, error: 'Unsupported file type' };
    }

    // Generate ID and hash
    const id = generateId();
    const hash = this.calculateHash(data);

    // Check for duplicate by hash
    for (const cached of this.fileCache.values()) {
      if (cached.hash === hash) {
        return { success: true, file: cached };
      }
    }

    // Generate filename
    const ext = this.getExtension(mimeType);
    const finalFilename = filename || `${id}${ext}`;
    const filePath = path.join(this.mediaDir, type, finalFilename);

    try {
      // Write file
      fs.writeFileSync(filePath, data);

      const file: MediaFile = {
        id,
        type,
        path: filePath,
        mimeType,
        filename: finalFilename,
        size: data.length,
        hash,
        createdAt: Date.now(),
        metadata
      };

      // Cache file info
      this.fileCache.set(id, file);

      return { success: true, file };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Save media from URL
   */
  async saveFromUrl(
    url: string,
    mimeType?: string,
    filename?: string
  ): Promise<MediaUploadResult> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const contentType = mimeType || response.headers.get('content-type') || 'application/octet-stream';
      const buffer = Buffer.from(await response.arrayBuffer());

      return this.saveFromBuffer(buffer, contentType, filename, { sourceUrl: url });
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Save media from file path
   */
  async saveFromPath(filePath: string): Promise<MediaUploadResult> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const data = fs.readFileSync(filePath);
      const mimeType = this.getMimeFromPath(filePath);
      const filename = path.basename(filePath);

      return this.saveFromBuffer(data, mimeType, filename, { sourcePath: filePath });
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get media file by ID
   */
  getFile(id: string): MediaFile | undefined {
    return this.fileCache.get(id);
  }

  /**
   * Read media file
   */
  async readFile(id: string): Promise<MediaDownloadResult> {
    const file = this.fileCache.get(id);
    if (!file) {
      return { success: false, error: 'File not found' };
    }

    try {
      const data = fs.readFileSync(file.path);
      return { success: true, data, file };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete media file
   */
  deleteFile(id: string): boolean {
    const file = this.fileCache.get(id);
    if (!file) {
      return false;
    }

    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      this.fileCache.delete(id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create MediaAttachment from MediaFile
   */
  toAttachment(file: MediaFile, caption?: string): MediaAttachment {
    return {
      type: file.type,
      path: file.path,
      mimeType: file.mimeType,
      filename: file.filename,
      size: file.size,
      caption
    };
  }

  /**
   * Process incoming attachment
   */
  async processIncoming(attachment: MediaAttachment): Promise<MediaFile | null> {
    if (attachment.data) {
      // Has raw data
      const result = await this.saveFromBuffer(
        attachment.data,
        attachment.mimeType,
        attachment.filename
      );
      return result.file || null;
    } else if (attachment.url) {
      // Has URL
      const result = await this.saveFromUrl(
        attachment.url,
        attachment.mimeType,
        attachment.filename
      );
      return result.file || null;
    } else if (attachment.path && fs.existsSync(attachment.path)) {
      // Has local path - create reference
      const id = generateId();
      const hash = this.calculateHash(fs.readFileSync(attachment.path));
      
      const file: MediaFile = {
        id,
        type: attachment.type,
        path: attachment.path,
        mimeType: attachment.mimeType,
        filename: attachment.filename || path.basename(attachment.path),
        size: attachment.size || 0,
        hash,
        createdAt: Date.now()
      };

      this.fileCache.set(id, file);
      return file;
    }

    return null;
  }

  /**
   * Get extension from mime type
   */
  private getExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'audio/wav': '.wav',
      'audio/webm': '.weba',
      'audio/aac': '.aac',
      'audio/opus': '.opus',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'text/plain': '.txt',
      'application/json': '.json'
    };

    return mimeToExt[mimeType] || '.bin';
  }

  /**
   * Get mime type from path
   */
  private getMimeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const extToMime: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.json': 'application/json'
    };

    return extToMime[ext] || 'application/octet-stream';
  }

  /**
   * Clean up old files
   */
  cleanup(maxAgeDays: number = 30): number {
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    for (const [id, file] of this.fileCache) {
      if (file.createdAt < cutoff) {
        if (this.deleteFile(id)) {
          deleted++;
        }
      }
    }

    return deleted;
  }

  /**
   * Get cache stats
   */
  getStats(): {
    fileCount: number;
    totalSize: number;
    byType: Record<string, number>;
  } {
    let totalSize = 0;
    const byType: Record<string, number> = {};

    for (const file of this.fileCache.values()) {
      totalSize += file.size;
      byType[file.type] = (byType[file.type] || 0) + 1;
    }

    return {
      fileCount: this.fileCache.size,
      totalSize,
      byType
    };
  }

  /**
   * Set max file size
   */
  setMaxFileSize(bytes: number): void {
    this.maxFileSize = bytes;
  }

  /**
   * Get media directory
   */
  getMediaDir(): string {
    return this.mediaDir;
  }
}

// Singleton instance
let mediaHandlerInstance: MediaHandler | null = null;

export function getMediaHandler(): MediaHandler {
  if (!mediaHandlerInstance) {
    mediaHandlerInstance = new MediaHandler();
  }
  return mediaHandlerInstance;
}

export default MediaHandler;
