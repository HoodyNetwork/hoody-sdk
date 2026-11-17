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
        urlTemplateSample: 'https://{projectId}-{computerId}-terminal-{index}.{server}.computers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        // The index is the session id. The proxy refuses terminal-N above 9999 and inside the agent
        // band 4501-5000 (every id stays inside 1-9999).
        maxIndex: 9999,
        sdkNamespace: 'terminal',
    },
    {
        slug: 'browser',
        kind: 'named',
        description: 'Browser automation and tab/session APIs.',
        serviceSegmentPattern: 'browser-{index}',
        urlTemplateSample: 'https://{projectId}-{computerId}-browser-{index}.{server}.computers.hoody.com',
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
        urlTemplateSample: 'https://{projectId}-{computerId}-code-{index}.{server}.computers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        // Every program index stops at 9999 at the proxy, before the editor's
        // own port bound.
        maxIndex: 9999,
        sdkNamespace: 'code',
    },
    {
        slug: 'curl',
        kind: 'named',
        description: 'HTTP jobs, schedules, sessions, and storage helpers.',
        serviceSegmentPattern: 'curl-{index}',
        urlTemplateSample: 'https://{projectId}-{computerId}-curl-{index}.{server}.computers.hoody.com',
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
        urlTemplateSample: 'https://{projectId}-{computerId}-cron-{index}.{server}.computers.hoody.com',
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
        urlTemplateSample: 'https://{projectId}-{computerId}-daemon-{index}.{server}.computers.hoody.com',
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
        urlTemplateSample: 'https://{projectId}-{computerId}-display-{index}.{server}.computers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        // The index is the display number. Desktops use 1601-4500 and agents 4501-5000, so every real
        // display is inside 1-9999, and the edge refuses above it.
        maxIndex: 9999,
        sdkNamespace: 'display',
    },
    {
        slug: 'desktop',
        kind: 'named',
        description: 'Full XFCE/MATE desktop environment — alias that routes to the terminal kit and 302s to display once X is ready. Override DE per-request via ?desktop_env=mate.',
        serviceSegmentPattern: 'desktop-{index}',
        urlTemplateSample: 'https://{projectId}-{computerId}-desktop-{index}.{server}.computers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        // The desktop runs on terminal session and display 1600 + N, which stops before the agent band
        // (4501); with the default configuration that allows desktops 1-2900. The
        // edge refuses the index above its bound (it never clamps to another desktop).
        maxIndex: 2900,
    },
    {
        slug: 'exec',
        kind: 'named',
        description: 'Script execution, templates, SDK, logs, and route helpers.',
        serviceSegmentPattern: 'exec-{index}',
        urlTemplateSample: 'https://{projectId}-{computerId}-exec-{index}.{server}.computers.hoody.com',
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
        urlTemplateSample: 'https://{projectId}-{computerId}-files-{index}.{server}.computers.hoody.com',
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
        urlTemplateSample: 'https://{projectId}-{computerId}-n-{index}.{server}.computers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        // The index is a display number, with the same bound as display.
        maxIndex: 9999,
        sdkNamespace: 'notifications',
        aliases: ['n'],
    },
    {
        slug: 'sqlite',
        kind: 'named',
        description: 'SQLite database, query history, and key-value APIs.',
        serviceSegmentPattern: 'sqlite-{index}',
        urlTemplateSample: 'https://{projectId}-{computerId}-sqlite-{index}.{server}.computers.hoody.com',
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
        urlTemplateSample: 'https://{projectId}-{computerId}-watch-{index}.{server}.computers.hoody.com',
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
        urlTemplateSample: 'https://{projectId}-{computerId}-pipe-{index}.{server}.computers.hoody.com',
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
        urlTemplateSample: 'https://{projectId}-{computerId}-notes-{index}.{server}.computers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        maxIndex: 9999,
        sdkNamespace: 'notes',
        aliases: ['note'],
    },
    {
        // `getKitUrl('run')` resolves through the namespace list, not this catalog;
        // `hoody kits list` is the one consumer that reads the catalog, so the kit
        // must be listed here to show there. No `app` alias is carried.
        slug: 'run',
        kind: 'named',
        description: 'Hoody Run — resolve an app to the exact shell command that launches it, across package sources.',
        serviceSegmentPattern: 'run-{index}',
        urlTemplateSample: 'https://{projectId}-{computerId}-run-{index}.{server}.computers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        maxIndex: 9999,
        sdkNamespace: 'run',
    },
    {
        slug: 'logs',
        kind: 'named',
        description: 'Proxy request/response logs for your computer: query, statistics, and live stream.',
        serviceSegmentPattern: 'logs-{index}',
        urlTemplateSample: 'https://{projectId}-{computerId}-logs-{index}.{server}.computers.hoody.com',
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
        description: 'Reverse tunnels — expose HTTP/WS/TCP services online via computer relay.',
        serviceSegmentPattern: 'tunnel-{index}',
        urlTemplateSample: 'https://{projectId}-{computerId}-tunnel-{index}.{server}.computers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        maxIndex: 9999,
        sdkNamespace: 'tunnel',
        aliases: ['tun'],
    },
    {
        slug: 'vm',
        kind: 'named',
        description: 'Virtual machines: create, start and stop VMs, snapshots, install media, imports, console and live events.',
        serviceSegmentPattern: 'vm-{index}',
        urlTemplateSample: 'https://{projectId}-{computerId}-vm-{index}.{server}.computers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        // One VM service runs per computer: the edge sends every vm-<index> to its one port.
        maxIndex: 9999,
        sdkNamespace: 'vm',
    },
    {
        slug: 'agent',
        kind: 'named',
        description: 'AI agent — sessions/prompt, models, providers, skills, memory, todos, workflows, hooks, github, tools, logs (HTTP gateway).',
        serviceSegmentPattern: 'agent-{index}',
        urlTemplateSample: 'https://{projectId}-{computerId}-agent-{index}.{server}.computers.hoody.com',
        supportsIndex: true,
        defaultIndex: 1,
        minIndex: 1,
        // The agent runs on terminal session 4500 + N, in the agent band 4501-5000 below the ephemeral
        // sessions; with the default configuration that allows agents 1-500, and the edge refuses above it.
        maxIndex: 500,
        sdkNamespace: 'agent',
        aliases: [],
    },
    {
        slug: 'ssh',
        kind: 'special',
        description: 'SSH bridge endpoint (no instance index).',
        serviceSegmentPattern: 'ssh',
        urlTemplateSample: 'https://{projectId}-{computerId}-ssh.{server}.computers.hoody.com',
        supportsIndex: false,
    },
    {
        slug: 'egress',
        kind: 'special',
        // `supportsIndex: false` describes the DEFAULT URL shape, not what the edge
        // accepts. Measured: `egress`, `egress-1`,
        // `egress-2` and `egress-7` all answer 200 from one process and all proxy
        // CONNECT to the same exit IP, so the index selects a permission scope on
        // one process rather than an instance. Keep the sample unsuffixed: the SDK,
        // the CLI and the docs all use the unsuffixed form.
        description: 'Computer egress proxy endpoint. The default URL carries no index; the edge normalizes a missing index to 1, and an explicit egress-<n> selects a permission scope on the same single process.',
        serviceSegmentPattern: 'egress',
        urlTemplateSample: 'https://{projectId}-{computerId}-egress.{server}.computers.hoody.com',
        supportsIndex: false,
    },
    {
        slug: 'http',
        kind: 'dynamic',
        description: 'Dynamic HTTP service mapped by port.',
        serviceSegmentPattern: 'http-{port}',
        urlTemplateSample: 'https://{projectId}-{computerId}-http-{port}.{server}.computers.hoody.com',
        supportsIndex: false,
        minPort: 1,
        maxPort: 65535,
    },
    {
        slug: 'https',
        kind: 'dynamic',
        description: 'Dynamic HTTPS service mapped by port.',
        serviceSegmentPattern: 'https-{port}',
        urlTemplateSample: 'https://{projectId}-{computerId}-https-{port}.{server}.computers.hoody.com',
        supportsIndex: false,
        minPort: 1,
        maxPort: 65535,
    },
    {
        slug: 'http-<port>',
        kind: 'dynamic',
        description: 'Explicit dynamic HTTP slug form.',
        serviceSegmentPattern: 'http-{port}',
        urlTemplateSample: 'https://{projectId}-{computerId}-http-{port}.{server}.computers.hoody.com',
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
        urlTemplateSample: 'https://{projectId}-{computerId}-https-{port}.{server}.computers.hoody.com',
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
