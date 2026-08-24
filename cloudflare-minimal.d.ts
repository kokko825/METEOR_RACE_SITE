/** Minimal Cloudflare bindings used by this project during local type-checking. */
interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta: { changes: number; [key: string]: unknown };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface SendEmail {
  send(message: {
    from: string;
    to?: string;
    subject: string;
    text: string;
    replyTo?: string;
  }): Promise<unknown>;
}

declare module "cloudflare:workers" {
  export const env: Env;
}
