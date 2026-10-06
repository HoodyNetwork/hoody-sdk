/**
 * Canonical Hoody Kit slug catalog used by SDK helpers.
 *
 * This catalog is static metadata describing supported service slugs, URL
 * segment patterns, and short human-readable descriptions.
 */
const KIT_CATALOG = [
    {
        slug: 'terminal',
        kind: 'named',
        description: 'Web terminal sessions and command execution.',
        serviceSegmentPattern: 'terminal-{index}',
        urlTemplateSample: 'https://{projectId}-{containerId}-terminal-{index}.{server}.containers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        // The index is the session id, which the terminal accepts from 1 to 65535.
        maxIndex: 65535,
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
        // Each editor instance listens on its own port, so the index stops where that port would pass 65535.
        maxIndex: 58535,
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
        // The index is the display number; desktops use high display numbers, so a 9999 cap would refuse
        // real ones. The bound is where the display's port would pass 65535; the edge refuses above it.
        maxIndex: 61535,
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
        // The desktop runs on a terminal session and a display whose numbers and port must stay within
        // 65535; with the default configuration that allows desktops 1-59935. A host configured for a
        // narrower range refuses the index above its bound (it never clamps to another desktop).
        maxIndex: 59935,
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
        // The index is a display number, with the same bound as display.
        maxIndex: 61535,
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
        // Missing entirely until 2026-08-12. `hoody run` shipped, `getKitUrl('run')`
        // built the right URL (it resolves through the namespace list, not this
        // catalog), and the slug table documented `run-1` — but `hoody kits list`
        // never showed it, because that command is the one consumer that reads the
        // catalog. The kit was renamed `app` -> `run` on 2026-07-31; no `app` alias
        // is carried, the old name is gone.
        slug: 'run',
        kind: 'named',
        description: 'Hoody Run — resolve an app to the exact shell command that launches it, across package sources.',
        serviceSegmentPattern: 'run-{index}',
        urlTemplateSample: 'https://{projectId}-{containerId}-run-{index}.{server}.containers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        maxIndex: 9999,
        sdkNamespace: 'run',
    },
    {
        slug: 'logs',
        kind: 'named',
        description: 'Proxy request/response logs for your container: query, statistics, and live stream.',
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
        // The agent runs on a terminal session kept below the ephemeral session range; with the default
        // configuration that allows agents 1-19999, and the edge refuses above it.
        maxIndex: 19999,
        sdkNamespace: 'agent',
        aliases: [],
    },
    {
        slug: 'bot',
        kind: 'named',
        description: 'Chat-channel bot: registrations, manifest and health.',
        serviceSegmentPattern: 'bot-{index}',
        urlTemplateSample: 'https://{projectId}-{containerId}-bot-{index}.{server}.containers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        maxIndex: 9999,
        sdkNamespace: 'bot',
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
        slug: 'egress',
        kind: 'special',
        // `supportsIndex: false` describes the DEFAULT URL shape, not what the edge
        // accepts. Measured 2026-08-11: `egress`, `egress-1`,
        // `egress-2` and `egress-7` all answer 200 from one process and all proxy
        // CONNECT to the same exit IP, so the index selects a permission scope on
        // one process rather than an instance. Keep the sample unsuffixed: the SDK,
        // the CLI and the docs all use the unsuffixed form.
        description: 'Container egress proxy endpoint. The default URL carries no index; the edge normalizes a missing index to 1, and an explicit egress-<n> selects a permission scope on the same single process.',
        serviceSegmentPattern: 'egress',
        urlTemplateSample: 'https://{projectId}-{containerId}-egress.{server}.containers.hoody.com',
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
/**
 * Return a clone of the kit catalog so callers can safely mutate their local copy.
 */
export function listKits(options) {
    const includeDynamic = options?.includeDynamic ?? true;
    const includeSpecial = options?.includeSpecial ?? true;
    return KIT_CATALOG
        .filter((entry) => {
        if (!includeDynamic && entry.kind === 'dynamic')
            return false;
        if (!includeSpecial && entry.kind === 'special')
            return false;
        return true;
    })
        .map((entry) => {
        const clone = { ...entry };
        if (entry.aliases) {
            clone.aliases = [...entry.aliases];
        }
        return clone;
    });
}
