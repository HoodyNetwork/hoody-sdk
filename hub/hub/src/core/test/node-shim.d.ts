// The two node calls the alias test makes to read the sidecar source (the hub has no @types/node).
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare const process: { env: Record<string, string | undefined> };
