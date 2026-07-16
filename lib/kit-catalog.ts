/**
 * Canonical Hoody Kit slug catalog used by SDK helpers.
 *
 * This catalog is static metadata describing supported service slugs, URL
 * segment patterns, and short human-readable descriptions.
 */

export type KitCatalogKind = 'named' | 'special' | 'dynamic';

export interface KitCatalogEntry {
  /** Service slug accepted by getKitUrl() / open commands (for example: "terminal"). */
  slug: string;
  /** Category of slug semantics. */
  kind: KitCatalogKind;
  /** Short description intended for help/docs output. */
  description: string;
  /** Subdomain segment pattern used in container URLs. */
  serviceSegmentPattern: string;
  /** Full URL sample format for this service slug. */
  urlTemplateSample: string;
  /** Whether this slug supports indexed instances (N suffix). */
  supportsIndex: boolean;
  /** Default instance index when supportsIndex=true. */
  defaultIndex?: number;
  /** Minimum supported instance index when supportsIndex=true. */
  minIndex?: number;
  /** Maximum supported instance index when supportsIndex=true. */
  maxIndex?: number;
  /** Minimum supported port when kind="dynamic". */
  minPort?: number;
  /** Maximum supported port when kind="dynamic". */
  maxPort?: number;
  /** SDK namespace name, when applicable. */
  sdkNamespace?: string;
  /** Optional aliases commonly used in CLI/docs. */
  aliases?: string[];
}

const KIT_CATALOG: ReadonlyArray<KitCatalogEntry> = [
  {
    slug: 'terminal',
    kind: 'named',
    description: 'Web terminal sessions and command execution.',
    serviceSegmentPattern: 'terminal-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-terminal-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'terminal',
  },
  {
    slug: 'browser',
    kind: 'named',
    description: 'Browser automation and tab/session APIs.',
    serviceSegmentPattern: 'browser-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-browser-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'browser',
  },
  {
    slug: 'code',
    kind: 'named',
    description: 'VS Code server and IDE-related endpoints.',
    serviceSegmentPattern: 'code-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-code-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'code',
  },
  {
    slug: 'curl',
    kind: 'named',
    description: 'HTTP jobs, schedules, sessions, and storage helpers.',
    serviceSegmentPattern: 'curl-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-curl-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'curl',
  },
  {
    slug: 'cron',
    kind: 'named',
    description: 'Cron scheduling and managed entry APIs.',
    serviceSegmentPattern: 'cron-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-cron-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'cron',
  },
  {
    slug: 'daemon',
    kind: 'named',
    description: 'Program management and daemon control/status APIs.',
    serviceSegmentPattern: 'daemon-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-daemon-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'daemon',
  },
  {
    slug: 'display',
    kind: 'named',
    description: 'Display sessions, screenshots, thumbnails, and metadata.',
    serviceSegmentPattern: 'display-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-display-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'display',
  },
  {
    slug: 'desktop',
    kind: 'named',
    description: 'Full XFCE/MATE desktop environment — alias that routes to the terminal kit and 302s to display once X is ready. Override DE per-request via ?desktop_env=mate.',
    serviceSegmentPattern: 'desktop-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-desktop-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    // Underlying terminal_id is u16; with the proxy's default offset 1600 the
    // public max is 63935. Custom offsets shift this — the proxy clamps.
    maxIndex: 63935,
  },
  {
    slug: 'exec',
    kind: 'named',
    description: 'Script execution, templates, SDK, logs, and route helpers.',
    serviceSegmentPattern: 'exec-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-exec-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'exec',
  },
  {
    slug: 'files',
    kind: 'named',
    description: 'File operations, archives, mounts, WebDAV, and remote backends.',
    serviceSegmentPattern: 'files-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-files-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'files',
  },
  {
    slug: 'notifications',
    kind: 'named',
    description: 'Notification history, emit endpoints, and icon serving.',
    serviceSegmentPattern: 'n-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-n-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'notifications',
    aliases: ['n'],
  },
  {
    slug: 'sqlite',
    kind: 'named',
    description: 'SQLite database, query history, and key-value APIs.',
    serviceSegmentPattern: 'sqlite-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-sqlite-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'sqlite',
    aliases: ['kv', 'db'],
  },
  {
    slug: 'watch',
    kind: 'named',
    description: 'Watchers, event streams, and watch system APIs.',
    serviceSegmentPattern: 'watch-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-watch-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'watch',
  },
  {
    slug: 'pipe',
    kind: 'named',
    description: 'Streaming data transfer over HTTP — ephemeral pipes between senders and receivers.',
    serviceSegmentPattern: 'pipe-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-pipe-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'pipe',
  },
  {
    slug: 'notes',
    kind: 'named',
    description: 'Hoody Notes — local-first collaborative notebooks (CRDTs, nodes, documents, comments, databases).',
    serviceSegmentPattern: 'notes-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-notes-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'notes',
    aliases: ['note'],
  },
  {
    slug: 'logs',
    kind: 'named',
    description: 'Proxy logs routing, query, config, and maintenance APIs.',
    serviceSegmentPattern: 'logs-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-logs-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'proxyLogs',
    aliases: ['proxy-logs'],
  },
  {
    slug: 'tunnel',
    kind: 'named',
    description: 'Reverse tunnels — expose HTTP/WS/TCP services online via container relay.',
    serviceSegmentPattern: 'tunnel-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-tunnel-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'tunnel',
    aliases: ['tun'],
  },
  {
    slug: 'agent',
    kind: 'named',
    description: 'AI agent — sessions/prompt, models, providers, skills, memory, todos, workflows, hooks, github, tools, logs (HTTP gateway).',
    serviceSegmentPattern: 'agent-{index}',
    urlTemplateSample: 'https://{projectId}-{containerId}-agent-{index}.{server}.containers.hoody.com',
    supportsIndex: true,
    defaultIndex: 1,
    minIndex: 1,
    maxIndex: 9999,
    sdkNamespace: 'agent',
    aliases: [],
  },
  {
    slug: 'ssh',
    kind: 'special',
    description: 'SSH bridge endpoint (no instance index).',
    serviceSegmentPattern: 'ssh',
    urlTemplateSample: 'https://{projectId}-{containerId}-ssh.{server}.containers.hoody.com',
    supportsIndex: false,
  },
  {
    slug: 'proxy',
    kind: 'special',
    description: 'Container egress proxy endpoint (no instance index).',
    serviceSegmentPattern: 'proxy',
    urlTemplateSample: 'https://{projectId}-{containerId}-proxy.{server}.containers.hoody.com',
    supportsIndex: false,
  },
  {
    slug: 'http',
    kind: 'dynamic',
    description: 'Dynamic HTTP service mapped by port.',
    serviceSegmentPattern: 'http-{port}',
    urlTemplateSample: 'https://{projectId}-{containerId}-http-{port}.{server}.containers.hoody.com',
    supportsIndex: false,
    minPort: 1,
    maxPort: 65535,
  },
  {
    slug: 'https',
    kind: 'dynamic',
    description: 'Dynamic HTTPS service mapped by port.',
    serviceSegmentPattern: 'https-{port}',
    urlTemplateSample: 'https://{projectId}-{containerId}-https-{port}.{server}.containers.hoody.com',
    supportsIndex: false,
    minPort: 1,
    maxPort: 65535,
  },
  {
    slug: 'http-<port>',
    kind: 'dynamic',
    description: 'Explicit dynamic HTTP slug form.',
    serviceSegmentPattern: 'http-{port}',
    urlTemplateSample: 'https://{projectId}-{containerId}-http-{port}.{server}.containers.hoody.com',
    supportsIndex: false,
    minPort: 1,
    maxPort: 65535,
    aliases: ['http'],
  },
  {
    slug: 'https-<port>',
    kind: 'dynamic',
    description: 'Explicit dynamic HTTPS slug form.',
    serviceSegmentPattern: 'https-{port}',
    urlTemplateSample: 'https://{projectId}-{containerId}-https-{port}.{server}.containers.hoody.com',
    supportsIndex: false,
    minPort: 1,
    maxPort: 65535,
    aliases: ['https'],
  },
];

export interface KitCatalogOptions {
  includeDynamic?: boolean;
  includeSpecial?: boolean;
}

/**
 * Return a clone of the kit catalog so callers can safely mutate their local copy.
 */
export function getKitCatalogEntries(options?: KitCatalogOptions): KitCatalogEntry[] {
  const includeDynamic = options?.includeDynamic ?? true;
  const includeSpecial = options?.includeSpecial ?? true;

  return KIT_CATALOG
    .filter((entry) => {
      if (!includeDynamic && entry.kind === 'dynamic') return false;
      if (!includeSpecial && entry.kind === 'special') return false;
      return true;
    })
    .map((entry) => {
      const clone: KitCatalogEntry = { ...entry };
      if (entry.aliases) {
        clone.aliases = [...entry.aliases];
      }
      return clone;
    });
}
