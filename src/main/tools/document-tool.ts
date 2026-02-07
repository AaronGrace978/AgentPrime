/**
 * Document Parser Tool - Read and extract content from PDFs, DOCX, and other documents
 */

import { BaseTool, ToolParameter } from './base-tool';
import * as fs from 'fs';
import * as path from 'path';

// Dynamic imports for optional dependencies
let pdfParse: any = null;
let mammoth: any = null;

/**
 * Load PDF parser (lazy)
 */
async function loadPdfParser(): Promise<boolean> {
  if (pdfParse) return true;
  try {
    pdfParse = require('pdf-parse');
    return true;
  } catch {
    console.warn('[Document] pdf-parse not installed. Run: npm install pdf-parse');
    return false;
  }
}

/**
 * Load DOCX parser (lazy)
 */
async function loadDocxParser(): Promise<boolean> {
  if (mammoth) return true;
  try {
    mammoth = require('mammoth');
    return true;
  } catch {
    console.warn('[Document] mammoth not installed. Run: npm install mammoth');
    return false;
  }
}

interface DocumentContent {
  success: boolean;
  filePath: string;
  fileName: string;
  fileType: string;
  content: string;
  metadata?: {
    pages?: number;
    author?: string;
    title?: string;
    createdDate?: string;
    wordCount?: number;
  };
  error?: string;
}

/**
 * Document Reader Tool
 */
export class DocumentReaderTool extends BaseTool {
  constructor() {
    super(
      'read_document',
      'Read and extract text content from documents (PDF, DOCX, TXT, MD, etc.)',
      {
        filePath: {
          type: 'string',
          required: true,
          description: 'Path to the document file'
        },
        maxLength: {
          type: 'number',
          required: false,
          description: 'Maximum characters to return (default: 50000)'
        }
      }
    );
  }

  async execute(args: { filePath: string; maxLength?: number }): Promise<DocumentContent> {
    const { filePath, maxLength = 50000 } = args;
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    console.log(`[Document] Reading: ${fileName}`);

    const result: DocumentContent = {
      success: false,
      filePath,
      fileName,
      fileType: ext,
      content: ''
    };

    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      switch (ext) {
        case '.pdf':
          return await this.readPdf(filePath, maxLength);
        
        case '.docx':
          return await this.readDocx(filePath, maxLength);
        
        case '.doc':
          // .doc format requires more complex handling
          result.error = 'Legacy .doc format not supported. Please convert to .docx';
          return result;
        
        case '.txt':
        case '.md':
        case '.markdown':
        case '.json':
        case '.xml':
        case '.csv':
        case '.html':
        case '.htm':
          return await this.readPlainText(filePath, maxLength);
        
        case '.rtf':
          return await this.readRtf(filePath, maxLength);
        
        default:
          // Try to read as plain text
          return await this.readPlainText(filePath, maxLength);
      }

    } catch (error: any) {
      result.error = error.message;
      console.error('[Document] Error:', error.message);
      return result;
    }
  }

  private async readPdf(filePath: string, maxLength: number): Promise<DocumentContent> {
    const result: DocumentContent = {
      success: false,
      filePath,
      fileName: path.basename(filePath),
      fileType: '.pdf',
      content: ''
    };

    if (!await loadPdfParser()) {
      result.error = 'PDF parsing requires pdf-parse package. Run: npm install pdf-parse';
      return result;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);

      result.success = true;
      result.content = data.text.substring(0, maxLength);
      result.metadata = {
        pages: data.numpages,
        title: data.info?.Title,
        author: data.info?.Author,
        createdDate: data.info?.CreationDate,
        wordCount: data.text.split(/\s+/).length
      };

      if (data.text.length > maxLength) {
        result.content += `\n\n[Content truncated. Total: ${data.text.length} characters]`;
      }

      console.log(`[Document] PDF parsed: ${result.metadata.pages} pages, ${result.metadata.wordCount} words`);

    } catch (error: any) {
      result.error = `PDF parsing failed: ${error.message}`;
    }

    return result;
  }

  private async readDocx(filePath: string, maxLength: number): Promise<DocumentContent> {
    const result: DocumentContent = {
      success: false,
      filePath,
      fileName: path.basename(filePath),
      fileType: '.docx',
      content: ''
    };

    if (!await loadDocxParser()) {
      result.error = 'DOCX parsing requires mammoth package. Run: npm install mammoth';
      return result;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      const data = await mammoth.extractRawText({ buffer });

      result.success = true;
      result.content = data.value.substring(0, maxLength);
      result.metadata = {
        wordCount: data.value.split(/\s+/).length
      };

      if (data.value.length > maxLength) {
        result.content += `\n\n[Content truncated. Total: ${data.value.length} characters]`;
      }

      console.log(`[Document] DOCX parsed: ${result.metadata.wordCount} words`);

    } catch (error: any) {
      result.error = `DOCX parsing failed: ${error.message}`;
    }

    return result;
  }

  private async readPlainText(filePath: string, maxLength: number): Promise<DocumentContent> {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      fileType: path.extname(filePath),
      content: content.substring(0, maxLength) + (content.length > maxLength ? '\n\n[Content truncated]' : ''),
      metadata: {
        wordCount: content.split(/\s+/).length
      }
    };
  }

  private async readRtf(filePath: string, maxLength: number): Promise<DocumentContent> {
    // Basic RTF stripping (removes RTF control words)
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Strip RTF formatting
    let plainText = content
      .replace(/\\[a-z]+\d* ?/gi, '') // Remove control words
      .replace(/[{}]/g, '') // Remove braces
      .replace(/\\\\/g, '\\') // Unescape backslashes
      .replace(/\\'/g, "'") // Unescape quotes
      .trim();

    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      fileType: '.rtf',
      content: plainText.substring(0, maxLength),
      metadata: {
        wordCount: plainText.split(/\s+/).length
      }
    };
  }
}

/**
 * Document Search Tool - Search for text within documents
 */
export class DocumentSearchTool extends BaseTool {
  constructor() {
    super(
      'search_documents',
      'Search for text across multiple documents in a folder.',
      {
        folderPath: {
          type: 'string',
          required: true,
          description: 'Path to folder containing documents'
        },
        query: {
          type: 'string',
          required: true,
          description: 'Text to search for'
        },
        fileTypes: {
          type: 'string',
          required: false,
          description: 'Comma-separated list of extensions (e.g., ".pdf,.docx,.txt"). Default: all supported'
        },
        caseSensitive: {
          type: 'boolean',
          required: false,
          description: 'Case-sensitive search (default: false)'
        }
      }
    );
  }

  async execute(args: {
    folderPath: string;
    query: string;
    fileTypes?: string;
    caseSensitive?: boolean;
  }): Promise<{
    success: boolean;
    results: { file: string; matches: { context: string; position: number }[] }[];
    totalMatches: number;
    filesSearched: number;
  }> {
    const { folderPath, query, fileTypes, caseSensitive = false } = args;
    
    console.log(`[Document] Searching for "${query}" in ${folderPath}`);

    const supportedExts = fileTypes 
      ? fileTypes.split(',').map(e => e.trim().toLowerCase())
      : ['.pdf', '.docx', '.txt', '.md', '.json', '.xml', '.html', '.csv', '.rtf'];

    const results: { file: string; matches: { context: string; position: number }[] }[] = [];
    let filesSearched = 0;
    let totalMatches = 0;

    const reader = new DocumentReaderTool();
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    try {
      const files = this.getDocumentFiles(folderPath, supportedExts);
      
      for (const filePath of files) {
        filesSearched++;
        
        try {
          const doc = await reader.execute({ filePath, maxLength: 100000 });
          if (!doc.success || !doc.content) continue;

          const content = caseSensitive ? doc.content : doc.content.toLowerCase();
          const matches: { context: string; position: number }[] = [];
          
          let pos = 0;
          while ((pos = content.indexOf(searchQuery, pos)) !== -1) {
            // Extract context around match
            const start = Math.max(0, pos - 50);
            const end = Math.min(doc.content.length, pos + query.length + 50);
            const context = '...' + doc.content.substring(start, end).replace(/\n/g, ' ') + '...';
            
            matches.push({ context, position: pos });
            totalMatches++;
            pos += query.length;
          }

          if (matches.length > 0) {
            results.push({
              file: path.relative(folderPath, filePath),
              matches: matches.slice(0, 5) // Limit matches per file
            });
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }

      console.log(`[Document] Found ${totalMatches} matches in ${results.length} files`);

    } catch (error: any) {
      console.error('[Document] Search error:', error.message);
    }

    return {
      success: true,
      results,
      totalMatches,
      filesSearched
    };
  }

  private getDocumentFiles(dir: string, extensions: string[]): string[] {
    const files: string[] = [];
    
    const processDir = (currentDir: string) => {
      try {
        const items = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(currentDir, item.name);
          if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          } else if (item.isDirectory() && !item.name.startsWith('.')) {
            processDir(fullPath);
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    };

    processDir(dir);
    return files;
  }
}

/**
 * Resume Parser Tool - Extract structured data from resumes
 */
export class ResumeParserTool extends BaseTool {
  constructor() {
    super(
      'parse_resume',
      'Parse a resume/CV document and extract structured information (name, email, phone, skills, experience, education).',
      {
        filePath: {
          type: 'string',
          required: true,
          description: 'Path to the resume file (PDF, DOCX, or TXT)'
        }
      }
    );
  }

  async execute(args: { filePath: string }): Promise<{
    success: boolean;
    rawText: string;
    extracted: {
      name?: string;
      email?: string;
      phone?: string;
      linkedin?: string;
      github?: string;
      skills: string[];
      experience: { title: string; company: string; duration: string }[];
      education: { degree: string; institution: string; year: string }[];
    };
    error?: string;
  }> {
    const { filePath } = args;
    console.log(`[Resume] Parsing: ${path.basename(filePath)}`);

    const result: {
      success: boolean;
      rawText: string;
      extracted: {
        name?: string;
        email?: string;
        phone?: string;
        linkedin?: string;
        github?: string;
        skills: string[];
        experience: { title: string; company: string; duration: string }[];
        education: { degree: string; institution: string; year: string }[];
      };
      error?: string;
    } = {
      success: false,
      rawText: '',
      extracted: {
        skills: [],
        experience: [],
        education: []
      },
      error: undefined
    };

    try {
      // Read the document
      const reader = new DocumentReaderTool();
      const doc = await reader.execute({ filePath });

      if (!doc.success) {
        result.error = doc.error || 'Failed to read document';
        return result;
      }

      result.rawText = doc.content;
      const text = doc.content;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);

      // Extract email
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        result.extracted.email = emailMatch[0];
      }

      // Extract phone
      const phoneMatch = text.match(/(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/);
      if (phoneMatch) {
        result.extracted.phone = phoneMatch[1];
      }

      // Extract LinkedIn
      const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
      if (linkedinMatch) {
        result.extracted.linkedin = 'https://' + linkedinMatch[0];
      }

      // Extract GitHub
      const githubMatch = text.match(/github\.com\/[\w-]+/i);
      if (githubMatch) {
        result.extracted.github = 'https://' + githubMatch[0];
      }

      // Try to find name (usually first non-empty line that's not contact info)
      for (const line of lines.slice(0, 5)) {
        if (line.length > 2 && line.length < 50 && 
            !line.includes('@') && 
            !line.match(/^\d/) &&
            !line.toLowerCase().includes('resume') &&
            !line.toLowerCase().includes('curriculum')) {
          result.extracted.name = line;
          break;
        }
      }

      // Extract skills (look for skills section)
      const skillsSection = text.match(/skills?\s*:?\s*([\s\S]*?)(?=\n\n|experience|education|projects|$)/i);
      if (skillsSection) {
        const skillText = skillsSection[1];
        // Common skill delimiters
        const skills = skillText
          .split(/[,;•|\n]/)
          .map(s => s.trim())
          .filter(s => s.length > 1 && s.length < 50)
          .slice(0, 30);
        result.extracted.skills = skills;
      }

      result.success = true;
      console.log(`[Resume] Extracted: ${result.extracted.name || 'Unknown'}, ${result.extracted.skills.length} skills`);

    } catch (error: any) {
      result.error = error.message;
      console.error('[Resume] Error:', error.message);
    }

    return result;
  }
}

