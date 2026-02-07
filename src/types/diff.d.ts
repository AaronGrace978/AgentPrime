declare module 'diff' {
  export function createPatch(
    fileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: unknown
  ): string;

  export function applyPatch(source: string, patch: string, options?: unknown): string | false;
}


