/**
 * Natural Language Command Parser
 * Parses conversational commands into structured intents for file operations
 */

export type OperationType = 'move' | 'copy' | 'delete' | 'rename' | 'create' | 'open' | 'organize';

export interface ParsedCommand {
  operation: OperationType;
  source?: string;
  destination?: string;
  newName?: string; // For rename operations
  options?: {
    recursive?: boolean;
    useRecycleBin?: boolean;
    overwrite?: boolean;
    pattern?: string; // For bulk operations like "all .jpg files"
    organizeBy?: 'type' | 'extension';
  };
  confidence: number; // 0-1, how confident we are in the parse
  rawCommand: string;
}

export class CommandParser {
  private operationKeywords: Record<OperationType, string[]> = {
    move: ['move', 'mv', 'transfer', 'put', 'send', 'shift'],
    copy: ['copy', 'cp', 'duplicate', 'clone', 'backup'],
    delete: ['delete', 'remove', 'trash', 'rm', 'del', 'erase', 'drop'],
    rename: ['rename', 'ren', 'call', 'change name', 'name', 'rechristen'],
    create: ['create', 'make', 'new', 'mkdir', 'add folder'],
    open: ['open', 'show', 'reveal', 'display', 'launch', 'run'],
    organize: ['organize', 'sort', 'tidy', 'tidy up', 'cleanup', 'clean up', 'declutter', 'arrange']
  };

  private destinationKeywords = ['to', 'in', 'into', 'on', 'onto', 'at'];
  private sourceKeywords = ['from', 'in', 'inside'];
  private contextKeywords = ['this', 'that', 'current', 'here', 'there'];

  /**
   * Parse a natural language command into structured intent
   */
  parse(command: string, context?: { currentFile?: string; currentFolder?: string }): ParsedCommand | null {
    const normalized = this.normalizeCommand(command);
    
    // Try to identify operation type
    const operation = this.detectOperation(normalized);
    if (!operation) {
      return null; // Not a file operation command
    }

    // Extract source and destination based on operation type
    let source: string | undefined;
    let destination: string | undefined;
    let newName: string | undefined;
    const options: ParsedCommand['options'] = {};

    switch (operation) {
      case 'move':
      case 'copy':
        ({ source, destination } = this.extractMoveCopyParams(normalized, context));
        break;
      case 'delete':
        source = this.extractSource(normalized, context);
        // Check if destination is recycle bin
        if (normalized.includes('recycle bin') || normalized.includes('trash')) {
          destination = 'recycle bin';
          options.useRecycleBin = true;
        }
        break;
      case 'rename':
        ({ source, newName } = this.extractRenameParams(normalized, context));
        break;
      case 'create':
        destination = this.extractDestination(normalized, context);
        break;
      case 'open':
        source = this.extractSource(normalized, context);
        break;
      case 'organize':
        source = this.extractOrganizeSource(normalized, context);
        options.organizeBy = normalized.includes('extension') ? 'extension' : 'type';
        break;
    }

    // Extract options
    this.extractOptions(normalized, options);

    // Calculate confidence
    const confidence = this.calculateConfidence(normalized, operation, source, destination);

    return {
      operation,
      source,
      destination,
      newName,
      options,
      confidence,
      rawCommand: command
    };
  }

  /**
   * Normalize command for parsing
   */
  private normalizeCommand(command: string): string {
    return command
      .toLowerCase()
      .trim()
      .replace(/[.,!?;:]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Detect operation type from command
   */
  private detectOperation(command: string): OperationType | null {
    let bestMatch: { operation: OperationType; index: number } | null = null;

    for (const [operation, keywords] of Object.entries(this.operationKeywords)) {
      for (const keyword of keywords) {
        // Check if keyword appears early in command (higher priority)
        const index = this.getKeywordIndex(command, keyword);
        if (index !== -1 && index < 20) { // Within first 20 chars
          const op = operation as OperationType;
          if (op === 'organize' && !this.looksLikeFolderOrganizeIntent(command)) {
            continue;
          }

          if (!bestMatch || index < bestMatch.index) {
            bestMatch = { operation: op, index };
          }
        }
      }
    }

    return bestMatch?.operation || null;
  }

  private getKeywordIndex(command: string, keyword: string): number {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    const match = command.match(regex);
    return match && typeof match.index === 'number' ? match.index : -1;
  }

  private looksLikeFolderOrganizeIntent(command: string): boolean {
    if (/\b(folder|directory|downloads?|desktop|documents?|pictures?|music|videos?|files?)\b/i.test(command)) {
      return true;
    }
    if (/\bthis folder\b|\bcurrent folder\b|\bhere\b/i.test(command)) {
      return true;
    }
    if (/[a-z]:[\\/]/i.test(command)) {
      return true;
    }
    if (/["'][^"']+["']/.test(command)) {
      return true;
    }
    return command.includes('/') || command.includes('\\');
  }

  /**
   * Extract source and destination for move/copy operations
   */
  private extractMoveCopyParams(
    command: string,
    context?: { currentFile?: string; currentFolder?: string }
  ): { source?: string; destination?: string } {
    let source: string | undefined;
    let destination: string | undefined;

    // Find destination keyword
    let destIndex = -1;
    let destKeyword = '';
    for (const keyword of this.destinationKeywords) {
      const index = command.indexOf(` ${keyword} `);
      if (index !== -1 && (destIndex === -1 || index < destIndex)) {
        destIndex = index;
        destKeyword = keyword;
      }
    }

    if (destIndex !== -1) {
      // Source is before destination keyword
      const sourcePart = command.substring(0, destIndex).trim();
      source = this.extractPathFromPart(sourcePart, context);

      // Destination is after destination keyword
      const destPart = command.substring(destIndex + destKeyword.length).trim();
      destination = this.extractPathFromPart(destPart, context);
    } else {
      // No explicit destination keyword, try to infer
      // Look for common patterns like "X to Y" or "X Y"
      const parts = command.split(/\s+/);
      const opIndex = parts.findIndex(p => 
        this.operationKeywords.move.includes(p) || 
        this.operationKeywords.copy.includes(p)
      );

      if (opIndex !== -1 && opIndex < parts.length - 1) {
        // Source might be after operation keyword
        const afterOp = parts.slice(opIndex + 1).join(' ');
        source = this.extractPathFromPart(afterOp, context);
      }
    }

    return { source, destination };
  }

  /**
   * Extract source path from command part
   */
  private extractSource(
    command: string,
    context?: { currentFile?: string; currentFolder?: string }
  ): string | undefined {
    // Remove operation keyword
    let cleaned = command;
    for (const keywords of Object.values(this.operationKeywords)) {
      for (const keyword of keywords) {
        cleaned = cleaned.replace(new RegExp(`\\b${keyword}\\b`, 'i'), '').trim();
      }
    }

    // Remove destination keywords and everything after
    for (const keyword of this.destinationKeywords) {
      const index = cleaned.indexOf(` ${keyword} `);
      if (index !== -1) {
        cleaned = cleaned.substring(0, index).trim();
      }
    }

    return this.extractPathFromPart(cleaned, context);
  }

  /**
   * Extract destination path from command part
   */
  private extractDestination(
    command: string,
    context?: { currentFile?: string; currentFolder?: string }
  ): string | undefined {
    // Find destination keyword
    for (const keyword of this.destinationKeywords) {
      const index = command.indexOf(` ${keyword} `);
      if (index !== -1) {
        const afterKeyword = command.substring(index + keyword.length).trim();
        return this.extractPathFromPart(afterKeyword, context);
      }
    }
    return undefined;
  }

  /**
   * Extract rename parameters
   */
  private extractRenameParams(
    command: string,
    context?: { currentFile?: string; currentFolder?: string }
  ): { source?: string; newName?: string } {
    let source: string | undefined;
    let newName: string | undefined;

    // Pattern: "rename X to Y" or "rename X Y"
    const toIndex = command.indexOf(' to ');
    if (toIndex !== -1) {
      const beforeTo = command.substring(0, toIndex).trim();
      source = this.extractPathFromPart(beforeTo, context);
      const afterTo = command.substring(toIndex + 4).trim();
      newName = this.extractPathFromPart(afterTo, context);
    } else {
      // Try to find source and new name without "to"
      const parts = command.split(/\s+/);
      const renameIndex = parts.findIndex(p => 
        this.operationKeywords.rename.includes(p)
      );

      if (renameIndex !== -1 && parts.length > renameIndex + 2) {
        // Assume format: "rename source newname"
        source = parts[renameIndex + 1];
        newName = parts.slice(renameIndex + 2).join(' ');
      }
    }

    return { source, newName };
  }

  /**
   * Extract path from a command part, handling context references
   */
  private extractPathFromPart(
    part: string,
    context?: { currentFile?: string; currentFolder?: string }
  ): string | undefined {
    if (!part) return undefined;

    // Handle context references
    if (part.includes('this file') && context?.currentFile) {
      return context.currentFile;
    }
    if (part.includes('current folder') && context?.currentFolder) {
      return context.currentFolder;
    }
    if (part.includes('this folder') && context?.currentFolder) {
      return context.currentFolder;
    }

    // Handle direct references to known system folders.
    const systemFolderMatch = part.match(/\b(desktop|documents|pictures|music|videos|downloads|download)\b/i);
    if (systemFolderMatch) {
      const normalizedFolder = systemFolderMatch[1].toLowerCase();
      return normalizedFolder === 'download' ? 'downloads' : normalizedFolder;
    }

    // Remove common filler words
    const cleaned = part
      .replace(/\b(can you|could you|would you|please|pls|for me|just|kindly)\b/gi, '')
      .replace(/\b(the|a|an|my|folder|file|directory|dir|files)\b/gi, '')
      .trim();

    if (!cleaned) return undefined;

    // Check if it's a quoted path
    const quotedMatch = cleaned.match(/["']([^"']+)["']/);
    if (quotedMatch) {
      return quotedMatch[1];
    }

    // Return cleaned path
    return cleaned || undefined;
  }

  /**
   * Extract source folder for organize/sort intents.
   */
  private extractOrganizeSource(
    command: string,
    context?: { currentFile?: string; currentFolder?: string }
  ): string | undefined {
    if ((command.includes('this folder') || command.includes('current folder') || command.includes('here')) && context?.currentFolder) {
      return context.currentFolder;
    }

    const explicitLocation = command.match(/\b(?:in|inside|from)\s+(.+)$/i);
    if (explicitLocation?.[1]) {
      const extracted = this.extractPathFromPart(explicitLocation[1], context);
      if (extracted) return extracted;
    }

    const systemFolderMatch = command.match(/\b(desktop|documents|pictures|music|videos|downloads|download)\b/i);
    if (systemFolderMatch) {
      const normalizedFolder = systemFolderMatch[1].toLowerCase();
      return normalizedFolder === 'download' ? 'downloads' : normalizedFolder;
    }

    const stripped = command
      .replace(/\b(can you|could you|would you|please|pls|for me|just|kindly)\b/gi, '')
      .replace(/\b(organize|sort|tidy|tidy up|cleanup|clean up|declutter|arrange)\b/gi, '')
      .replace(/\b(the|a|an|my|folder|directory|files)\b/gi, '')
      .trim();
    const inferred = this.extractPathFromPart(stripped, context);
    if (inferred) return inferred;

    // Fallback: organize current focused folder when user points at one.
    return context?.currentFolder;
  }

  /**
   * Extract options from command
   */
  private extractOptions(command: string, options?: ParsedCommand['options']): void {
    if (!options) return;

    // Check for recursive operations
    if (command.includes('recursive') || command.includes('all') || command.includes('everything')) {
      options.recursive = true;
    }

    // Check for file patterns
    const patternMatch = command.match(/(?:all|every)\s+(\.[a-z0-9]+)\s+files?/i);
    if (patternMatch) {
      options.pattern = patternMatch[1];
      options.recursive = true;
    }

    // Check for recycle bin
    if (command.includes('recycle bin') || command.includes('trash')) {
      options.useRecycleBin = true;
    }

    // Check for overwrite
    if (command.includes('overwrite') || command.includes('replace')) {
      options.overwrite = true;
    }
  }

  /**
   * Calculate confidence score for the parse
   */
  private calculateConfidence(
    command: string,
    operation: OperationType,
    source?: string,
    destination?: string
  ): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence if we have clear operation keyword
    const hasOpKeyword = this.operationKeywords[operation].some(k => 
      command.includes(k)
    );
    if (hasOpKeyword) confidence += 0.2;

    // Higher confidence if we have source
    if (source) confidence += 0.15;

    // Higher confidence if operation requires destination and we have it
    if (['move', 'copy', 'create'].includes(operation) && destination) {
      confidence += 0.15;
    }

    if (operation === 'organize' && source) {
      confidence += 0.2;
    }

    // Lower confidence if operation requires destination but we don't have it
    if (['move', 'copy'].includes(operation) && !destination) {
      confidence -= 0.2;
    }

    if (operation === 'organize' && !source) {
      confidence -= 0.25;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Check if a command looks like a file operation command
   */
  isFileOperationCommand(command: string): boolean {
    const normalized = this.normalizeCommand(command);
    return this.detectOperation(normalized) !== null;
  }
}

