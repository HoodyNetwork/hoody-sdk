/**
 * Unified Hoody Client
 *
 * Wraps all services and namespaces into a single client with shared configuration.
 */
import { HttpClient, type IHttpClientConfig } from './http-client.js';
import { ApiError } from './errors.js';
import type { ApiIpGetResponse, ApiAuthLoginResponse } from './types.js';
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
import * as egress from './egress/index.js';
import * as run from './run/index.js';
import * as proxyLogs from './proxyLogs/index.js';
import * as vm from './vm/index.js';
import * as agent from './agent/index.js';
/**
 * Credentials for `HoodyClient.login()`, `client.login()` and
 * `HoodyClientConfig.credentials`.
 *
 * The login endpoint identifies an account by EITHER a username OR an email
 * address: the spec declares both properties on ApiAuthLoginRequest under
 * `anyOf: [{required: [username]}, {required: [email]}]`, and the server
 * validates each against its own format — an email address sent as
 * `username` is rejected (422, pattern ^[a-zA-Z0-9_-]+$), and a username sent
 * as `email` is rejected the same way. So the spelling is load-bearing and
 * both must be expressible here. Passing `{ username, password }` keeps
 * working unchanged.
 *
 * `client` is optional: the source channel this sign-in reports to the
 * API, for analytics only. Left out, the SDK sends 'sdk'.
 */
export type HoodyCredentials = {
    username: string;
    email?: string;
    password: string;
    client?: string;
} | {
    email: string;
    username?: string;
    password: string;
    client?: string;
};
export interface HoodyClientConfig extends IHttpClientConfig {
    urlTemplates?: Record<string, Record<string, string | number>>;
    credentials?: HoodyCredentials;
    autoRefresh?: boolean;
    /**
     * Realm to scope account-API requests to: 24 hexadecimal characters, or
     * "all" / "default" / "*" for no realm. Anything else throws ValidationError.
     * On an account client (see target), a baseURL that already names a realm
     * ({realmId}.api.hoody.com) selects that realm when this is omitted. On a
     * client whose target is 'kit', a raw request on client.http bound for the
     * base host throws ValidationError, unless that host already carries the
     * realm ({realmId}.api.hoody.com); the generated services apply it to their URLs.
     */
    realmId?: string;
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    onKitAuthExpired?: (namespace: string, error: ApiError) => Promise<ProxyAuth | undefined>;
    /**
     * On a realm-scope 403, spend one extra request (GET /api/v1/auth/tokens/me)
     * to list the realms the token allows, and attach them to the error as
     * allowedRealms. Off by default: without it the error still carries
     * code 'REALM_SCOPE_ERROR' and a hint, and no request is made. The answer is
     * kept per access token, so repeated 403s cost one lookup.
     */
    realmErrorIntrospection?: boolean;
    /**
     * Called each time the SDK itself obtains a session from the account API:
     * login() (reason 'login'), and the automatic recovery of a 401, which
     * exchanges the refresh token ('refresh') or signs in again with the stored
     * credentials ('relogin'). It receives the access token now in use and the
     * refresh token that goes with it, so a long-running service can save the
     * pair and start its next run with adoptSession(). The API rotates the
     * refresh token on every refresh: the one saved before is spent.
     *
     * Concurrent 401s share one recovery, so it is called once per new pair,
     * before the failed requests are replayed. Clients derived with
     * withRealm() / withComputer() carry it. It is not called for tokens the
     * caller supplied (adoptSession(), setToken(), setSessionToken(),
     * onTokenExpired, refreshToken). It is not awaited, and whatever it throws
     * or rejects with is discarded: a failed save must not fail the request
     * that triggered the refresh, so handle errors inside it.
     */
    onSession?: (session: HoodySessionUpdate) => void | Promise<void>;
    /**
     * What baseURL points at.
     *  - 'account': the Hoody account API. Kit namespaces refuse to send there
     *    (call withComputer() first), and a realm label on the host
     *    ({realmId}.api.hoody.com) is read as the client's realm.
     *  - 'kit': a kit or daemon reached directly. The URL is used as given.
     * When omitted: 'account' if the client has credentials, has no baseURL, has
     * a relative baseURL ('/proxy', resolved against the page), or baseURL is a
     * Hoody API host (api.hoody.com, or a host under it); otherwise 'kit'. Clients derived with withRealm()/withComputer() keep it.
     */
    target?: 'account' | 'kit';
}
/** What HoodyClientConfig.onSession receives. */
export interface HoodySessionUpdate {
    /** The access token the session now uses. */
    token: string;
    /** The refresh token issued with it; undefined when the response carried none. */
    refreshToken: string | undefined;
    /** How the SDK obtained it: login(), a refresh-token exchange, or an automatic sign-in with the stored credentials. */
    reason: 'login' | 'refresh' | 'relogin';
}
/**
 * A login answer that is not a session yet: a two-factor challenge or an
 * intent-mode auth_intent_token. Accepted by adoptSession() so that the whole
 * api.auth.login() response can be passed without narrowing it
 * first, and refused there at runtime with the step that finishes the login.
 */
export type HoodySessionChallenge = {
    requires_2fa: true;
    temp_token: string;
} | {
    auth_intent_token: string;
};
/**
 * Access token and refresh token of a session, or a response envelope carrying
 * them in data. A challenge (see HoodySessionChallenge) type-checks and is
 * refused at runtime.
 */
export type HoodySessionTokens = {
    token?: string | null;
    refreshToken?: string | null;
} | HoodySessionChallenge | {
    statusCode?: number;
    message?: string;
    data?: {
        token?: string | null;
        refreshToken?: string | null;
    } | HoodySessionChallenge | null;
};
/**
 * Thrown by HoodyClient.login() when the account has two-factor
 * authentication on: the password was right, but no session exists until a
 * one-time code is verified. Call complete(code) to finish on the same client.
 * tempToken is valid for five minutes and is kept out of the error's
 * enumerable properties so that logging the error does not print it.
 */
export declare class TwoFactorRequiredError<C extends HoodyClient = HoodyClient> extends Error {
    readonly code = "TWO_FACTOR_REQUIRED";
    /** The second-factor method the server asked for (for example 'totp'). */
    readonly method: string | undefined;
    readonly tempToken: string;
    readonly client: C;
    constructor(client: C, tempToken: string, method: string | undefined);
    /** Verify the code, adopt the session it returns, and resolve to the authenticated client. */
    complete(code: string): Promise<C>;
}
/** An ApiError for a request its realm scope does not allow (403). */
export type RealmScopeApiError = ApiError & {
    readonly code: 'REALM_SCOPE_ERROR';
    /** The realms this token allows; present when realmErrorIntrospection is on (or a cached answer exists). */
    readonly allowedRealms?: string[];
    /** The realm the failing client was scoped to, if any. */
    readonly currentRealm?: string;
    /** What to do next, also appended to the message. */
    readonly hint: string;
};
/** True for the enriched realm-scope 403 the client raises. */
export declare function isRealmScopeError(error: unknown): error is RealmScopeApiError;
/**
 * Minimal shape required by getKitUrl / listKitUrls / withComputer. The full
 * computer response from the API has dozens of optional fields; these three
 * methods only need id + project_id + server_name to build the URL. Extra
 * fields are permitted (index signature).
 *
 * Both `server` and `server_name` are accepted: the API response exposes
 * server_name, while some hand-constructed objects use the shorter string
 * `server`. Supporting both means consumers can pass the raw API response OR a
 * hand-constructed object without remapping. _resolveComputerServer below
 * normalises to a single value. The routing host is the flat server_name (for a
 * computer on a subserver, the PARENT server the proxy serves). A computers.list
 * item's `server` is the server-details object: its `name` is the slice's own
 * display name, never a routing host, so it is not used.
 */
export interface ComputerLike {
    id?: string;
    project_id?: string;
    [key: string]: unknown;
}
export declare class HoodyClient {
    /**
     * The HTTP transport, for requests the generated services do not cover.
     * On a realm-scoped account client getBaseURL() returns the realm URL and
     * every request to the account host is moved to the realm host, so nothing
     * sent through it runs account-wide. getFetch() returns the fetch function
     * the client was given, unchanged: it is the raw transport, and a call made
     * with it directly runs no middleware and none of the SDK's realm or
     * credential policy; the URL and headers you give it are what is sent.
     */
    readonly http: HttpClient;
    private readonly urlTemplates?;
    private readonly realmId?;
    private kitAuth?;
    private onKitAuthExpired?;
    /** Mutable only through setToken(), which moves this client to a session of its own. */
    private session;
    /** The credentials this client was constructed with (derived clients have none of their own). */
    private readonly ownCredentials;
    /**
     * The transport itself. this.http is a view of it whose getBaseURL() is the
     * base URL the caller configured, realm included; this one holds the
     * account base URL the generated services build their URLs from.
     */
    private readonly transport;
    /**
     * The caller's own 401 hooks, never the session-bound wrappers installed on
     * the transport: derived clients inherit these, so a client that left the
     * session (setToken) does not keep recovering through its parent's session.
     */
    private readonly userOnTokenExpired;
    private readonly userRefreshToken;
    /** The caller's onSession hook; derived clients inherit it like the two above. */
    private readonly userOnSession;
    /**
     * The last recovery result handed to this client's transport, with the
     * generation it belongs to. The transport asks acceptRefreshedToken() right
     * before installing a token, and only this token, still current, passes.
     */
    private recoveryCommit;
    private autoRefresh;
    private readonly realmErrorIntrospection;
    /** What baseURL points at; see HoodyClientConfig.target. */
    private readonly target;
    /**
     * The caller's base URL (an account base with any realm label split off),
     * before an omitted base is resolved against the page (_effectiveBaseURL).
     * The kit domain is derived from it, and derived clients are built from it,
     * so the kit URLs of a same-origin browser client keep the default
     * computers domain they always had; only realm routing and credential
     * scope use the page.
     */
    private readonly callerBaseURL;
    /** Allowed realms per access token, filled only by the opt-in realm-error introspection. */
    private realmIntrospectionCache;
    readonly api: {
        abuseNotices: api.AbuseNoticesService;
        activity: api.ActivityService;
        ai: api.AiService;
        auth: api.AuthService & {
            device: api.AuthDeviceService;
            email: api.AuthEmailService;
            oauth: api.AuthOauthService;
            sessions: api.AuthSessionsService;
            tokens: api.AuthTokensService;
            twoFactor: api.AuthTwoFactorService;
        };
        botUrls: api.BotUrlsService & {
            keys: api.BotUrlsKeysService;
        };
        computers: api.ComputersService & {
            env: api.ComputersEnvService;
            proxy: api.ComputersProxyService;
        };
        events: api.EventsService;
        firewall: api.FirewallService & {
            egress: api.FirewallEgressService;
            ingress: api.FirewallIngressService;
        };
        images: api.ImagesService;
        inbox: api.InboxService;
        ip: api.IpService;
        meta: api.MetaService;
        network: api.NetworkService;
        pools: api.PoolsService & {
            invitations: api.PoolsInvitationsService;
            members: api.PoolsMembersService;
        };
        projects: api.ProjectsService & {
            permissions: api.ProjectsPermissionsService;
            proxy: api.ProjectsProxyService;
        };
        proxy: {
            aliases: api.ProxyAliasesService;
        };
        realms: api.RealmsService;
        referrals: api.ReferralsService & {
            codes: api.ReferralsCodesService;
        };
        servers: api.ServersService & {
            plans: api.ServersPlansService;
            subscriptions: api.ServersSubscriptionsService;
        };
        snapshots: api.SnapshotsService;
        storage: {
            incoming: api.StorageIncomingService;
            shares: api.StorageSharesService;
        };
        support: api.SupportService & {
            tickets: api.SupportTicketsService;
        };
        users: api.UsersService;
        vault: api.VaultService;
        wallet: api.WalletService & {
            credits: api.WalletCreditsService;
            invoices: api.WalletInvoicesService;
            payments: api.WalletPaymentsService;
        };
    };
    readonly browser: {
        cookies: browser.CookiesService;
        history: browser.HistoryService;
        instances: browser.InstancesService;
        kit: browser.KitService;
        logs: browser.LogsService;
        page: browser.PageService;
        tabs: browser.TabsService;
        viewport: browser.ViewportService;
    };
    readonly code: code.CodeService & {
        extensions: code.ExtensionsService;
        kit: code.KitService;
        ui: code.UiService;
    };
    readonly curl: curl.CurlService & {
        channel: curl.ChannelService;
        jobs: curl.JobsService;
        kit: curl.KitService;
        schedules: curl.SchedulesService;
        sessions: curl.SessionsService;
        storage: curl.StorageService;
    };
    readonly daemon: {
        ephemeralPrograms: daemon.EphemeralProgramsService;
        kit: daemon.KitService;
        programs: daemon.ProgramsService;
    };
    readonly display: display.DisplayService & {
        clipboard: display.ClipboardService;
        input: display.InputService;
        keyboard: display.KeyboardService;
        kit: display.KitService;
        mouse: display.MouseService;
        screenshots: display.ScreenshotsService;
        thumbnails: display.ThumbnailsService;
        windows: display.WindowsService;
    };
    readonly exec: exec.ExecService & {
        cache: exec.CacheService;
        env: exec.EnvService;
        kit: exec.KitService;
        logs: exec.LogsService;
        magicComments: exec.MagicCommentsService;
        modules: exec.ModulesService;
        namespaces: exec.NamespacesService;
        openapi: exec.OpenapiService;
        ops: exec.OpsService;
        packages: exec.PackagesService & {
            manifest: exec.PackagesManifestService;
        };
        routes: exec.RoutesService;
        schedules: exec.SchedulesService;
        scripts: exec.ScriptsService;
        sdkTypes: exec.SdkTypesService;
        sdks: exec.SdksService;
        store: exec.StoreService;
        templates: exec.TemplatesService;
        tests: exec.TestsService;
    };
    readonly files: files.FilesService & {
        archives: files.ArchivesService;
        backends: files.BackendsService;
        downloads: files.DownloadsService;
        extractions: files.ExtractionsService;
        ftp: files.FtpService;
        images: files.ImagesService;
        journal: files.JournalService;
        kit: files.KitService;
        mounts: files.MountsService;
        s3: files.S3Service;
        ssh: files.SshService;
        ui: files.UiService;
        uploads: files.UploadsService;
        webdav: files.WebdavService;
    };
    readonly notifications: notifications.NotificationsService & {
        icons: notifications.IconsService;
        kit: notifications.KitService;
        push: notifications.PushService & {
            subscriptions: notifications.PushSubscriptionsService;
        };
    };
    readonly sqlite: {
        databases: sqlite.DatabasesService;
        history: sqlite.HistoryService;
        kit: sqlite.KitService;
        kv: sqlite.KvService & {
            arrays: sqlite.KvArraysService;
            table: sqlite.KvTableService;
        };
        sql: sqlite.SqlService;
    };
    readonly terminal: {
        commands: terminal.CommandsService;
        drops: terminal.DropsService;
        keys: terminal.KeysService;
        kit: terminal.KitService;
        processes: terminal.ProcessesService;
        sessions: terminal.SessionsService;
        system: terminal.SystemService;
        workloads: terminal.WorkloadsService;
    };
    readonly watch: {
        events: watch.EventsService;
        kit: watch.KitService;
        watchers: watch.WatchersService;
    };
    readonly cron: {
        crontabs: cron.CrontabsService;
        entries: cron.EntriesService;
        events: cron.EventsService;
        kit: cron.KitService;
        runs: cron.RunsService;
    };
    readonly pipe: pipe.PipeService & {
        kit: pipe.KitService;
    };
    readonly notes: notes.NotesService & {
        avatars: notes.AvatarsService;
        collaborators: notes.CollaboratorsService;
        comments: notes.CommentsService;
        document: notes.DocumentService;
        files: notes.FilesService & {
            uploads: notes.FilesUploadsService;
        };
        kit: notes.KitService;
        members: notes.MembersService;
        mutations: notes.MutationsService;
        nodes: notes.NodesService;
        notebooks: notes.NotebooksService;
        reactions: notes.ReactionsService;
        records: notes.RecordsService;
        sockets: notes.SocketsService;
        versions: notes.VersionsService;
    };
    readonly tunnel: tunnel.TunnelService & {
        bindings: tunnel.BindingsService;
        kit: tunnel.KitService;
        sessions: tunnel.SessionsService;
    };
    readonly egress: {
        kit: egress.KitService;
        upstream: egress.UpstreamService;
    };
    readonly run: run.RunService & {
        catalog: run.CatalogService;
        jobs: run.JobsService;
        kit: run.KitService;
        profiles: run.ProfilesService;
        recipes: run.RecipesService;
        sources: run.SourcesService;
    };
    readonly proxyLogs: proxyLogs.ProxyLogsService;
    readonly vm: {
        console: vm.ConsoleService;
        events: vm.EventsService;
        guestAgent: vm.GuestAgentService;
        imports: vm.ImportsService;
        isos: vm.IsosService & {
            downloads: vm.IsosDownloadsService;
        };
        kit: vm.KitService;
        osinfo: vm.OsinfoService;
        snapshots: vm.SnapshotsService & {
            export: vm.SnapshotsExportService;
        };
        templates: vm.TemplatesService;
        unidentifiedRuns: vm.UnidentifiedRunsService;
        vms: vm.VmsService;
    };
    readonly agent: agent.AgentService & {
        acp: agent.AcpService;
        audio: agent.AudioService;
        bots: agent.BotsService & {
            channels: agent.BotsChannelsService;
            messages: agent.BotsMessagesService;
        };
        changes: agent.ChangesService;
        completions: agent.CompletionsService;
        computers: agent.ComputersService;
        definitions: agent.DefinitionsService;
        files: agent.FilesService;
        fusions: agent.FusionsService;
        gates: agent.GatesService;
        github: agent.GithubService & {
            auth: agent.GithubAuthService;
            branches: agent.GithubBranchesService;
            commits: agent.GithubCommitsService;
            prs: agent.GithubPrsService;
            repos: agent.GithubReposService;
            worktrees: agent.GithubWorktreesService;
        };
        headless: agent.HeadlessService;
        hooks: agent.HooksService;
        jev: agent.JevService;
        jobs: agent.JobsService;
        kit: agent.KitService;
        logs: agent.LogsService;
        loops: agent.LoopsService;
        mcp: agent.McpService;
        memory: agent.MemoryService & {
            items: agent.MemoryItemsService;
        };
        models: agent.ModelsService;
        providers: agent.ProvidersService & {
            accounts: agent.ProvidersAccountsService;
            auth: agent.ProvidersAuthService;
            oauth: agent.ProvidersOauthService;
        };
        realms: agent.RealmsService;
        scripts: agent.ScriptsService & {
            templates: agent.ScriptsTemplatesService;
        };
        sessions: agent.SessionsService & {
            approval: agent.SessionsApprovalService;
            approverLease: agent.SessionsApproverLeaseService;
            attachments: agent.SessionsAttachmentsService;
            autoReply: agent.SessionsAutoReplyService;
            commands: agent.SessionsCommandsService;
            tasks: agent.SessionsTasksService;
            tools: agent.SessionsToolsService;
            turns: agent.SessionsTurnsService;
            waiters: agent.SessionsWaitersService;
        };
        settings: agent.SettingsService;
        skills: agent.SkillsService & {
            hub: agent.SkillsHubService;
        };
        todos: agent.TodosService;
        tools: agent.ToolsService;
        usage: agent.UsageService;
        workflows: agent.WorkflowsService & {
            runs: agent.WorkflowsRunsService;
        };
    };
    constructor(config: HoodyClientConfig);
    /**
     * Set the access token of THIS client only. The client leaves the session
     * it shared with its parent and derived clients and starts one of its own:
     * nothing else changes token, a later refresh, adoption or logout of the
     * old session does not touch this client, and clients derived from this one
     * afterwards share the new session. The new session keeps the credentials
     * this client was constructed with (a derived client has none) and no
     * refresh token. A token recovery still in flight for this client is
     * discarded, and a request in flight is not sent again with this one: a 401
     * for the old token, or a failure it would have retried, is its answer. To
     * change the token of the whole session, use setSessionToken().
     */
    setToken(token: string): void;
    /**
     * Set the access token of the whole session: this client, the client it was
     * derived from and every client derived from either send it from now on. A
     * non-empty token also ends a logged-out state (see logout()), and any token
     * recovery still in flight is discarded. The refresh token and stored
     * credentials are kept; to replace those too, use adoptSession(). A request
     * in flight is not sent again with the new token: a 401, or a failure it
     * would have retried, is its answer.
     */
    setSessionToken(token: string): void;
    /**
     * Start a new generation of the session (see _HoodySessionState.generation).
     * Generations are unique across sessions, so a recovery that compares one
     * also notices a client that moved to another session.
     */
    private bumpGeneration;
    /**
     * HttpClient single-flights its own token refresh, so a 401 from the new
     * generation would otherwise join a recovery the old one started, and fail
     * with it. Forget that shared promise; the old recovery still settles, and
     * its result is discarded by its generation check.
     */
    private resetTransportRefresh;
    /** Every live client of the session, this one included. */
    private forEachMember;
    /** Give every client of the session the same access token (no generation change). */
    private applySessionToken;
    /** True while the session is the one a recovery started under, and not logged out. */
    private isCurrentSession;
    /**
     * 401 recovery (HttpClient onTokenExpired), single-flight per session and
     * generation: concurrent 401s on this client and its derived clients share
     * one recovery, which runs the caller's onTokenExpired, then the stored
     * refresh token or credentials, then the caller's refreshToken, and stops
     * at the first token. After logout() nothing may restore the session, and a
     * session replaced or ended while a step was awaiting wins over whatever
     * that step returns.
     *
     * The shared result is checked again for EACH caller when it arrives: a
     * client that left the session (setToken) or saw it end while waiting gets
     * nothing. What it does get is recorded in recoveryCommit, which the
     * transport checks once more right before it installs the token.
     *
     * The steps run as the client that started the recovery. If THAT client
     * leaves the session while they run, their result no longer belongs to the
     * session, and every waiter gets nothing too (their requests fail with the
     * 401): an availability cost accepted over handing any client a token from
     * a session it is not in.
     */
    private recoverSession;
    /** The recovery steps recoverSession() single-flights; see there. */
    private runRecovery;
    /**
     * HttpClient acceptRefreshedToken: asked synchronously right before the
     * transport installs a recovered token and replays the request. Only the
     * token recoverSession() last handed this client passes, and only while its
     * generation is still current.
     */
    private acceptRefreshedToken;
    /**
     * Adopt a session that was issued outside login(): the result of
     * api.auth.twoFactor.verify(), api.auth.oauth.exchange() or
     * api.auth.device.poll(), or tokens saved from an earlier run. Pass the response
     * envelope or its data. The access token becomes this client's bearer and
     * the refresh token is kept for automatic refresh, shared with clients
     * derived from this one. Returns the access token.
     *
     * An api.auth.login() response is accepted as it comes. When it
     * answered with a two-factor challenge or an auth_intent_token there is no
     * session to adopt, and this throws a ValidationError naming the step that
     * finishes the login.
     *
     * A request in flight under the previous session is not sent again with the
     * adopted token: a 401, or a failure it would have retried, is its answer.
     */
    adoptSession(tokens: HoodySessionTokens): string;
    /**
     * Finish a login that returned a two-factor challenge (data.temp_token):
     * verify the code with api.auth.twoFactor.verify() and adopt the session it returns.
     * Resolves to the new access token.
     *
     * The request body declares the same source channel as the login it
     * finishes: options.client, else the `client` of this client's stored
     * credentials, else 'sdk'. The API records it unless the challenge itself
     * already names a channel (an OAuth sign-in keeps the one it started with).
     */
    completeTwoFactorLogin(tempToken: string, code: string, options?: {
        client?: string;
    }): Promise<string>;
    /**
     * Log out THIS session: this client, and every client derived from it or
     * from the same parent, drops its access token, refresh token, stored
     * credentials and kit credential (kitAuth), and automatic
     * re-authentication stays off until login(), adoptSession(),
     * setSessionToken() or setToken() starts a new session. No request is
     * made, so it cannot fail, and the account's other sessions (other
     * devices, the CLI, other apps) stay signed in. It is what the CLI's
     * hoody logout does.
     *
     * The API has no call that revokes one session: the dropped access token
     * stays valid on the server until it expires. Use logoutAll() when the
     * token may have leaked, or to sign the account out everywhere.
     *
     * kitAuth is cleared because it is sent on the session's behalf (it often
     * holds the account token itself); pass it again with withComputer() when
     * a kit still needs it. Streams and sockets already open are NOT closed:
     * they belong to the caller, who holds their AbortSignal or close(), and
     * the client keeps no registry of them. Close them when logging out. An
     * EventsClient reconnects with the current (now empty) token.
     */
    logout(): Promise<void>;
    /**
     * Log out EVERYWHERE: api.auth.logoutAll() revokes every session of the
     * account (all devices, the CLI, other apps), not only this client's
     * token, and then this session is cleared as logout() clears it. Local
     * state is cleared even when the request fails; the failure is then
     * rethrown.
     */
    logoutAll(): Promise<void>;
    /** Drop every credential of the shared session and stop automatic recovery. */
    private clearSession;
    /** Register this client with the shared session (weakly, so it can be collected). */
    private joinSession;
    /** Remove this client from its session's members (see setToken()). */
    private leaveSession;
    /**
     * Instance-level wiring of the two account-session endpoints the client
     * must take part in:
     *  - api.auth.refresh(data) presents data.refreshToken as the
     *    bearer for that one request (the route verifies the REFRESH token as the
     *    bearer and requires the same value in the body) and never enters
     *    automatic 401 recovery itself. handleAuthRefresh() uses the same call.
     *  - api.auth.logoutAll() ends the local session once the server has
     *    revoked it, so the stored credentials cannot log the client back in.
     */
    private installAuthLifecycleHooks;
    /**
     * Get the current auth token, performing a lazy login first when the client
     * was constructed with credentials but has not authenticated yet. Returns
     * undefined if no token is available and no credentials are on file.
     *
     * Documented in the README (tunnel helpers pass `await hoody.getAuthToken()`)
     * and used by the agent streaming helper (lib/agent-client.ts) to mint the
     * `X-Hoody-Token` half of a computer-claim kit handshake.
     */
    getAuthToken(): Promise<string | undefined>;
    /**
     * Login with credentials.
     *
     * Returns the typed response shape (ApiAuthLoginResponse) instead
     * of `any` so consumers keep .data autocomplete and tokens narrowing. The
     * typed import comes from generated/types.ts; the @ts-ignore lines are kept
     * because the `api.auth` namespace is dynamic (its existence
     * depends on the OpenAPI spec at generation time).
     */
    login(credentials: HoodyCredentials): Promise<ApiAuthLoginResponse>;
    /**
     * login() for the static login() factory: a response without an access
     * token is not a login. A two-factor challenge becomes a
     * TwoFactorRequiredError that can finish on this client; anything else
     * tokenless (for example a PKCE intent response) is an ApiError.
     */
    protected loginForSession(credentials: HoodyCredentials): Promise<void>;
    /**
     * Extract and persist auth tokens from login/refresh responses.
     */
    private updateTokensFromAuthResponse;
    /**
     * Hand a pair the SDK just obtained to the caller's onSession hook. Never
     * awaited and never allowed to throw: it runs inside login() and inside the
     * 401 recovery, whose result must not depend on the caller's storage.
     */
    private notifySession;
    /**
     * Internal auth refresh flow for 401 responses.
     * Returns a fresh token when recovery succeeds.
     */
    private handleAuthRefresh;
    /**
     * A realm-scope 403 reaches the caller as the SAME ApiError the request
     * produced, enriched in place: code 'REALM_SCOPE_ERROR', a hint (also
     * appended to the message), currentRealm, and allowedRealms when they are
     * known. It has to be in place: HttpClient discards whatever an onError hook
     * throws and rethrows the original error, so an error built here would never
     * arrive. Nothing is logged, and no request is made unless the caller opted
     * in with realmErrorIntrospection (the answer is then cached per token).
     * Best effort: a failure here leaves the original error untouched.
     */
    private enrichRealmScopeError;
    /** The accessor path the realm-scope hint names; a unit test resolves it against a real client. */
    static readonly REALM_DISCOVERY_METHOD = "api.auth.tokens.getCurrent";
    /**
     * GET /api/v1/auth/tokens/me on the account (realm-less) host, for the
     * allowed realm ids of the current token. Undefined when it fails.
     */
    private fetchAllowedRealms;
    /**
     * Static factory for authentication.
     *
     * Identify the account with either `username` or `email` (see
     * HoodyCredentials) — the server rejects the wrong field for the value.
     *
     * Resolves only with a logged-in client. For an account with two-factor
     * authentication it rejects with TwoFactorRequiredError; finish with
     * error.complete(code), which resolves to the same client, logged in.
     */
    static login(baseURL: string, credentials: HoodyCredentials): Promise<HoodyClient>;
    /**
     * Create a new client instance scoped to a specific computer
     *
     * Automatically fetches computer details if ID is provided,
     * and configures URL templates for all Hoody Kit services.
     *
     * An object needs its id, project_id and a server (server_name, or a string
     * server) to route without a request. One that
     * has an id but no project_id or no server is looked up by id through the
     * account API, and the API's project and server are used; a project_id or
     * server it does give must be well formed and match them, or this throws
     * ValidationError. A failed lookup throws the API's error.
     *
     * @param computerOrId - Computer object or ID
     * @param options - Computer scoping options
     */
    withComputer(computerOrId: string | ComputerLike, options?: {
        kitAuth?: ProxyAuth | ProxyAuthPolicy;
        onKitAuthExpired?: (namespace: string, error: ApiError) => Promise<ProxyAuth | undefined>;
    }): Promise<HoodyClient>;
    /**
     * Create a new client instance scoped to a specific realm
     *
     * Realm-scoped clients route API requests through a realm-prefixed host
     * derived from the account base URL (domain-agnostic). The derived client
     * keeps the account base URL itself, so clearing or switching the realm
     * starts from the account host and the bearer stays in scope. Requests made
     * on the derived client's http directly go to the realm host too.
     * Auth token introspection (/auth/tokens/me) still works on the base domain
     * for bootstrap discovery.
     *
     * On a client whose target is 'kit' (see HoodyClientConfig.target) the base
     * URL is used as given: a realm label in it is not recognised, so
     * withRealm('all') cannot remove it. The generated services still apply
     * withRealm(id) to their own URLs, but a raw request on the derived
     * client's http bound for the base host throws ValidationError rather than
     * go out unscoped, unless that host already carries the realm.
     * Construct the client with target: 'account' when the base URL is an
     * account API.
     *
     * @param realmId - Realm ID to scope to (24 hexadecimal characters), or
     *   "all"/"default"/"*" to clear realm scoping. Anything else throws
     *   ValidationError: the server would ignore it and run the request
     *   unscoped.
     */
    withRealm(realmId?: string): HoodyClient;
    /**
     * Get the current realm ID (if scoped)
     */
    getRealmId(): string | undefined;
    /**
     * A view of this.http whose request methods first run check(path). Every
     * other member passes straight through, so the services see the same
     * transport, config and helpers as before.
     */
    private guardHttp;
    /**
     * True when this client targets the account API (HoodyClientConfig.target,
     * resolved at construction and kept by derived clients). Kit paths are
     * meaningless there. A direct-kit client is left alone, whatever its host
     * is called.
     */
    private isAccountApiBase;
    /**
     * Transport for a kit namespace's services. A kit service that has no
     * computer to build its URL from (the client was not made by
     * withComputer()) produces a bare path; on an account-API client that path
     * would go to the API host with the account bearer. Refuse it before it is
     * sent. Computer clients (the service builds a full kit URL) and direct-kit
     * clients (baseURL is the kit) are unaffected.
     */
    private guardKitHttp;
    /**
     * Transport for the account-API services. A realm reaches them as a host
     * label (per client via withRealm(), per call via the _realm option); the
     * services only prepend it. A label that is not a realm id would be ignored
     * by the server, which then runs the request across every realm; a realm
     * the service could not apply leaves the request on the account host. Both
     * are refused here, before anything is sent.
     */
    private guardAccountHttp;
    /**
     * Generate a URL for a specific kit service.
     *
     * When `local: true` is passed in options, returns the local Kit URL
     * (`https://localhost.{computersDomain}/{serviceSegment}`) instead of the
     * full external URL. The local URL only works from inside the computer's
     * own network — the Host auto-identifies the caller. Use this for cron
     * jobs, CLI scripts, or any in-computer automation targeting the
     * computer's own services. For cross-computer calls, use the default
     * (full external URL).
     */
    getKitUrl(kit: string, computer: ComputerLike | null, serviceIndexOrOptions?: number | {
        serviceIndex?: number;
        protocol?: 'http' | 'https';
        port?: number;
        local?: boolean;
    }): string;
    /**
     * Build a URL-template pattern for a specific kit namespace
     * using a baseURL-derived computers domain (domain-agnostic).
     */
    private getKitUrlTemplatePattern;
    /**
     * The computers domain of the configured baseURL: lib/domain-utils.ts computersDomainFor(), the one
     * derivation the CLI client, the embeds runtime and the kitAuth middleware share.
     *
     * Examples:
     * - api.hoody.com -> computers.hoody.com
     * - api.hoody.com -> computers.hoody.com
     * - {realm}.api.hoody.com -> computers.hoody.com
     * - localhost -> localhost (a kit host is a subdomain of it)
     *
     * An IP address base has no kit host: this throws where one is about to be built, so a client that
     * only calls the account API on an IP base URL keeps working.
     */
    private resolveComputersDomain;
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
    listKitUrls(computer: ComputerLike | null, serviceIndexOrOptions?: number | {
        serviceIndex?: number;
        protocol?: 'http' | 'https';
        port?: number;
        local?: boolean;
    }): Record<string, string>;
    /**
     * Get the Hoody IP check base URL (https://ip.hoody.com).
     *
     * Useful for verifying the exit IP of a computer proxy.
     * Example: `curl -x ${client.getKitUrl('proxy', computer)} ${client.getIpUrl()}`
     */
    getIpUrl(): string;
    /**
     * Check the caller's external IP by querying ip.hoody.com.
     *
     * Returns the same typed response as GET /api/v1/ip (ApiIpGetResponse).
     * No authentication required. Useful for verifying computer proxy exit IPs.
     *
     * @example
     * const { data } = await client.getIp();
     * console.log(data.ip);           // "203.0.113.42"
     * console.log(data.ip_info?.country); // "SG"
     */
    getIp(options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<ApiIpGetResponse>;
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
