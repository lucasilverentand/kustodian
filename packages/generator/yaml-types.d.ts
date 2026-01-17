// Type declarations for yaml package
declare module 'yaml' {
  export interface Document {
    toJSON(): unknown;
  }

  export interface ParseOptions {
    [key: string]: unknown;
  }

  export interface StringifyOptions {
    [key: string]: unknown;
  }

  export function parse(str: string, options?: ParseOptions): unknown;
  export function parseAllDocuments(str: string, options?: ParseOptions): Document[];
  export function stringify(value: unknown, options?: StringifyOptions): string;
}
