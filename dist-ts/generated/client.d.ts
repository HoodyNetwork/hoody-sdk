/**
 * Unified Hoody Client
 *
 * Wraps all services and namespaces into a single client with shared configuration.
 */
import { HttpClient, IHttpClientConfig } from './http-client.js';
import { ApiError } from './errors.js';
import type { ApiUtilitiesGetIpInfoResponse, ApiAuthenticationLoginResponse } from './types.js';
import { type ProxyAuth, type ProxyAuthPolicy } from '../lib/proxy-auth.js';
import * as api from './api/index.js';
import * as browser from './browser/index.js';
import * as code from './code/index.js';
import * as curl from './curl/index.js';
import * as daemon from './daemon/index.js';
import * as display from './display/index.js';
import * as exec from './exec/index.js';
import * as files from './files/index.js';
import * as notifications from './notifications/index.js';
import * as sqlite from './sqlite/index.js';
import * as terminal from './terminal/index.js';
import * as watch from './watch/index.js';
import * as cron from './cron/index.js';
import * as pipe from './pipe/index.js';
import * as notes from './notes/index.js';
import * as tunnel from './tunnel/index.js';
import * as app from './app/index.js';
import * as proxyLogs from './proxyLogs/index.js';
import * as agent from './agent/index.js';
export interface HoodyClientConfig extends IHttpClientConfig {
    urlTemplates?: Record<string, Record<string, string | number>>;
    credentials?: {
        username: string;
        password: string;
    };
    autoRefresh?: boolean;
    realmId?: string;
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    onKitAuthExpired?: (namespace: string, error: ApiError) => Promise<ProxyAuth | undefined>;
}
/**
 * Minimal shape required by getKitUrl / getKitUrls / withContainer. The full
 * container response from the API has dozens of optional fields; these three
 * methods only need id + project_id + server_name to build the URL. Extra
 * fields are permitted (index signature).
 *
 * Both `server` and `server_name` are accepted: the API response exposes
 * server_name, while some hand-constructed objects use the shorter `server`.
 * Supporting both means consumers can pass the raw API response OR a
 * hand-constructed object without remapping. _resolveContainerServer below
 * normalises to a single value.
 */
export interface ContainerLike {
    id: string;
    project_id?: string;
    [key: string]: unknown;
}
export declare class HoodyClient {
    readonly http: HttpClient;
    private readonly urlTemplates?;
    private readonly realmId?;
    private kitAuth?;
    private onKitAuthExpired?;
    private credentials?;
    private refreshToken?;
    private autoRefresh;
    readonly api: {
        authTokens: api.AuthTokensService;
        vault: api.UserVaultService;
        authentication: api.AuthenticationService;
        tfa: api.TwoFactorAuthenticationService;
        users: api.UsersService;
        projects: api.ProjectsService;
        containers: api.ContainersService;
        images: api.ContainerImagesService;
        firewall: api.ContainerFirewallService;
        env: api.ContainerEnvironmentService;
        notifications: api.NotificationsService;
        proxyPermissionsProject: api.ProxyPermissionsProjectService;
        proxyPermissionsContainer: api.ProxyPermissionsContainerService;
        proxyHooks: api.ProxyHooksService;
        proxyDiscovery: api.ProxyDiscoveryService;
        proxyAliases: api.ProxyAliasesService;
        storageShares: api.StorageSharesService;
        utilities: api.UtilitiesService;
        events: api.EventsService;
        activity: api.ActivityLogsService;
        ai: api.AiService;
        meta: api.MetaService;
        realms: api.RealmsService;
        wallet: api.WalletService;
        poolInvitations: api.PoolInvitationsService;
        pools: api.PoolsService;
        poolMembers: api.PoolMembersService;
        serverRental: api.ServerRentalService;
        rentals: api.RentalsService;
        serverCommands: api.ServerCommandsService;
        waitlist: api.WaitlistService;
    };
    readonly browser: {
        instances: browser.InstanceManagementService;
        interaction: browser.BrowserInteractionService;
        introspection: browser.IntrospectionControlService;
        health: browser.ServerHealthMetricsService;
        page: browser.PageContentService;
        cookies: browser.BrowserStateService;
        debugging: browser.DebuggingService;
        history: browser.BrowsingHistoryService;
    };
    readonly code: {
        vscode: code.VscodeService;
        auth: code.AuthService;
        static: code.StaticService;
        extensions: code.ExtensionsService;
        health: code.HealthService;
        proxy: code.ProxyService;
    };
    readonly curl: curl.CurlService & {
        events: curl.EventsService;
        health: curl.HealthService;
        jobs: curl.JobsService;
        schedules: curl.SchedulesService;
        sessions: curl.SessionsService;
        storage: curl.StorageService;
        ops: curl.OpsService;
    };
    readonly daemon: {
        health: daemon.HealthService;
        programs: daemon.ProgramsService;
        control: daemon.ControlService;
        status: daemon.StatusService;
        quickStart: daemon.QuickStartService;
    };
    readonly display: display.DisplayService & {
        health: display.HealthService;
        screenshots: display.ScreenshotsService;
        thumbnails: display.ThumbnailsService;
        input: display.InputService;
    };
    readonly exec: {
        system: exec.SystemService;
        execution: exec.ScriptExecutionService;
        validate: exec.ValidateService;
        templates: exec.TemplatesService;
        scripts: exec.ScriptsService;
        logs: exec.LogsService;
        cache: exec.CacheService;
        state: exec.SharedStateService;
        route: exec.RouteService;
        monitor: exec.MonitorService;
        health: exec.HealthService;
        dependencies: exec.DependenciesService;
        package: exec.PackageService;
        openapi: exec.UserOpenapiService;
        sdk: exec.SdkService;
        ids: exec.ListService;
        magic: exec.MagicCommentsService;
        schedules: exec.SchedulesService;
    };
    readonly files: files.FilesService & {
        downloads: files.DownloadsService;
        archives: files.ArchivesService;
        backends: files.BackendsService;
        health: files.HealthService;
        journal: files.JournalService;
        mounts: files.MountsService;
        system: files.SystemService;
        images: files.ImageProcessingService;
        webdav: files.WebdavService;
        directories: files.DirectoriesService;
        authentication: files.AuthenticationService;
        ftp: files.RemoteFtpService;
        git: files.RemoteGitService;
        s3: files.RemoteS3Service;
        ssh: files.RemoteSshService;
    };
    readonly notifications: notifications.NotificationsService & {
        health: notifications.HealthService;
        icons: notifications.IconsService;
        notify: notifications.NotifyService;
    };
    readonly sqlite: {
        database: sqlite.DatabaseService;
        health: sqlite.HealthService;
        history: sqlite.HistoryService;
        kvStore: sqlite.KvStoreService;
        sql: sqlite.SqlService;
        docs: sqlite.DocumentationService;
        query: sqlite.QueryService;
    };
    readonly terminal: terminal.TerminalService & {
        health: terminal.HealthService;
        execution: terminal.TerminalExecutionService;
        sessions: terminal.TerminalSessionsService;
        web: terminal.WebInterfaceService;
        docs: terminal.ApiDocumentationService;
        system: terminal.SystemMonitoringService;
        terminalAutomation: terminal.TerminalAutomationService;
        terminalDragAndDrop: terminal.TerminalDragAndDropService;
    };
    readonly watch: {
        health: watch.HealthService;
        system: watch.SystemService;
        watchers: watch.WatchersService;
        streams: watch.StreamsService;
    };
    readonly cron: {
        crontab: cron.CrontabService;
        health: cron.HealthService;
        system: cron.SystemService;
        entries: cron.EntriesService;
    };
    readonly pipe: pipe.PipeService & {
        ui: pipe.UiService;
        info: pipe.InfoService;
        health: pipe.HealthService;
    };
    readonly notes: {
        health: notes.HealthService;
        identity: notes.IdentityService;
        sockets: notes.SocketsService;
        avatars: notes.AvatarsService;
        notebooks: notes.NotebooksService;
        files: notes.FilesService;
        nodes: notes.NodesService;
        documents: notes.DocumentsService;
        collaborators: notes.CollaboratorsService;
        reactions: notes.ReactionsService;
        interactions: notes.InteractionsService;
        comments: notes.CommentsService;
        versions: notes.VersionsService;
        databases: notes.DatabasesService;
        users: notes.UsersService;
        mutations: notes.MutationsService;
    };
    readonly tunnel: tunnel.TunnelService & {
        health: tunnel.HealthService;
    };
    readonly app: {
        health: app.HealthService;
        docs: app.ApiDocumentationService;
        execution: app.AppExecutionService;
        jobs: app.JobsService;
        sources: app.SourcesService;
        configuration: app.ConfigurationService;
        profiles: app.ProfilesService;
        recipes: app.RecipesService;
    };
    readonly proxyLogs: {
        logs: proxyLogs.LogsService;
    };
    readonly agent: agent.AgentService & {
        settings: agent.SettingsService;
        agents: agent.AgentsService;
        discovery: agent.DiscoveryService;
        system: agent.SystemService;
        github: agent.GithubService;
        headless: agent.HeadlessService;
        hoody: agent.HoodyService;
        hooks: agent.HooksService;
        jobs: agent.JobsService;
        logs: agent.LogsService;
        memory: agent.MemoryService;
        models: agent.ModelsService;
        sessions: agent.SessionsService;
        loops: agent.LoopsService;
        tasks: agent.TasksService;
        tools: agent.ToolsService;
        workflows: agent.WorkflowsService;
        skills: agent.SkillsService;
        statistics: agent.StatisticsService;
        todos: agent.TodosService;
    };
    constructor(config: HoodyClientConfig);
    /**
     * Set authentication token
     */
    setToken(token: string): void;
    /**
     * Get the current auth token, performing a lazy login first when the client
     * was constructed with credentials but has not authenticated yet. Returns
     * undefined if no token is available and no credentials are on file.
     *
     * Documented in the README (tunnel helpers pass `await hoody.getAuthToken()`)
     * and used by the agent streaming helper (lib/agent-client.ts) to mint the
     * `X-Hoody-Token` half of a container-claim kit handshake.
     */
    getAuthToken(): Promise<string | undefined>;
    /**
     * Login with credentials.
     *
     * Returns the typed response shape (ApiAuthenticationLoginResponse) instead
     * of `any` so consumers keep .data autocomplete and tokens narrowing. The
     * typed import comes from generated/types.ts; the @ts-ignore lines are kept
     * because the `api.authentication` namespace is dynamic (its existence
     * depends on the OpenAPI spec at generation time).
     */
    login(credentials: {
        username: string;
        password: string;
    }): Promise<ApiAuthenticationLoginResponse>;
    /**
     * Extract and persist auth tokens from login/refresh responses.
     */
    private updateTokensFromAuthResponse;
    /**
     * Internal auth refresh flow for 401 responses.
     * Returns a fresh token when recovery succeeds.
     */
    private handleAuthRefresh;
    /**
     * Handle realm-related 403 errors by enriching with allowed realms
     */
    private handleRealmError;
    /**
     * Static factory for authentication
     */
    static authenticate(baseURL: string, credentials: {
        username: string;
        password: string;
    }): Promise<HoodyClient>;
    /**
     * Create a new client instance scoped to a specific container
     *
     * Automatically fetches container details if ID is provided,
     * and configures URL templates for all hoody-kit services.
     *
     * @param containerOrId - Container object or ID
     * @param options - Container scoping options
     */
    withContainer(containerOrId: string | ContainerLike, options?: {
        kitAuth?: ProxyAuth | ProxyAuthPolicy;
        onKitAuthExpired?: (namespace: string, error: ApiError) => Promise<ProxyAuth | undefined>;
    }): Promise<HoodyClient>;
    /**
     * Create a new client instance scoped to a specific realm
     *
     * Realm-scoped clients route API requests through a realm-prefixed host
     * derived from the configured base URL (domain-agnostic).
     * Auth token introspection (/auth/tokens/me) still works on the base domain
     * for bootstrap discovery.
     *
     * @param realmId - Realm ID to scope to, or "all"/"default" to clear realm scoping
     */
    withRealm(realmId?: string): HoodyClient;
    /**
     * Get the current realm ID (if scoped)
     */
    getRealmId(): string | undefined;
    /**
     * Generate a URL for a specific kit service.
     *
     * When `local: true` is passed in options, returns the local Kit URL
     * (`https://localhost.{containersDomain}/{serviceSegment}`) instead of the
     * full external URL. The local URL only works from inside the container's
     * own network — the Host auto-identifies the caller. Use this for cron
     * jobs, CLI scripts, or any in-container automation targeting the
     * container's own services. For cross-container calls, use the default
     * (full external URL).
     */
    getKitUrl(kit: string, container: ContainerLike | null, serviceIndexOrOptions?: number | {
        serviceIndex?: number;
        protocol?: 'http' | 'https';
        port?: number;
        local?: boolean;
    }): string;
    /**
     * Build a URL-template pattern for a specific kit namespace
     * using a baseURL-derived containers domain (domain-agnostic).
     */
    private getKitUrlTemplatePattern;
    /**
     * Derive containers domain from configured baseURL.
     *
     * Examples:
     * - api.hoody.com -> containers.hoody.com
     * - api.hoody.com -> containers.hoody.com
     * - {realm}.api.hoody.com -> containers.hoody.com
     */
    private resolveContainersDomain;
    /**
     * Map SDK namespace to kit subdomain segment.
     */
    private resolveKitNamespaceSegment;
    /**
     * Build the subdomain service segment used in Kit URLs.
     *
     * Examples:
     * - terminal + index 2 => terminal-2
     * - http + port 8080 => http-8080
     * - https-8443 => https-8443
     * - ssh => ssh
     */
    private resolveKitServiceSegment;
    /**
     * Generate URLs for all standard kits
     */
    getKitUrls(container: ContainerLike | null, serviceIndexOrOptions?: number | {
        serviceIndex?: number;
        protocol?: 'http' | 'https';
        port?: number;
        local?: boolean;
    }): Record<string, string>;
    /**
     * Get the Hoody IP check base URL (https://ip.hoody.com).
     *
     * Useful for verifying the exit IP of a container proxy.
     * Example: `curl -x ${client.getKitUrl('proxy', container)} ${client.getIpUrl()}`
     */
    getIpUrl(): string;
    /**
     * Check the caller's external IP by querying ip.hoody.com.
     *
     * Returns the same typed response as GET /api/v1/ip (ApiUtilitiesGetIpInfoResponse).
     * No authentication required. Useful for verifying container proxy exit IPs.
     *
     * @example
     * const { data } = await client.checkIp();
     * console.log(data.ip);           // "203.0.113.42"
     * console.log(data.ip_info?.country); // "SG"
     */
    checkIp(options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<ApiUtilitiesGetIpInfoResponse>;
    /**
     * Derive IP-check domain from configured baseURL.
     *
     * Examples:
     * - api.hoody.com -> ip.hoody.com
     * - api.hoody.com -> ip.hoody.com
     * - {realm}.api.hoody.com -> ip.hoody.com
     */
    private resolveIpDomain;
}
