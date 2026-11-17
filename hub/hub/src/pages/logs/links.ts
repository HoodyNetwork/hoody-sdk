// Public hrefs of the logs page: the only file other pages may import from this folder.
const q = (o: Record<string, string | undefined>) => {
  const s = Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
  return s ? `/logs?${s}` : '/logs';
};

export interface LogsLinkOptions {
  computer?: string;
  source?: 'everything' | 'visits' | 'bots' | 'changes' | 'scripts' | 'programs' | 'account' | 'helper' | 'decisions';
  severity?: 'problems' | 'failed';
  window?: '15m' | '1h' | '24h' | '7d';
  program?: string;
  port?: number;
  script?: string;
  exec?: string;
  search?: string;
}

/** Any Logs address: the keys Logs reads (src, sev, win, q, program, port, script, exec, computer). A script or run alone opens the Scripts source. */
export function logsLinkFor(o: LogsLinkOptions): string {
  const source = o.source ?? (o.script || o.exec ? 'scripts' : o.program ? 'programs' : undefined);
  return q({
    computer: o.computer, src: source === 'everything' ? undefined : source, sev: o.severity, win: o.window === '1h' ? undefined : o.window,
    q: o.search, program: o.program, port: o.port === undefined ? undefined : String(o.port), script: o.script, exec: o.exec,
  });
}

export const links = {
  list: '/logs',
  /** One computer's program: its output (Computers links here with the computer's handle). */
  program: (computer: string, program: string, port?: number) => q({ computer, program, port: port === undefined ? undefined : String(port) }),
  /** What a computer's visitors and Bots did lately. */
  computer: (computer: string) => q({ computer }),
  /** Failures only. */
  failed: '/logs?sev=failed',
  /** Runs of one script (Scripts links here). */
  script: (script: string) => q({ src: 'scripts', script }),
} as const;
