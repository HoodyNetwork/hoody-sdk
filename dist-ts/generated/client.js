/**
 * Unified Hoody Client
 *
 * Wraps all services and namespaces into a single client with shared configuration.
 */
import { HttpClient } from './http-client.js';
import { createProxyAuthMiddleware } from '../lib/proxy-auth-middleware.js';
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
function _resolveContainerServer(container) {
    if (!container)
        return undefined;
    return container.server_name ?? container.server;
}
export class HoodyClient {
    http;
    urlTemplates;
    realmId;
    kitAuth;
    onKitAuthExpired;
    credentials;
    refreshToken;
    autoRefresh = true;
    api;
    browser;
    code;
    curl;
    daemon;
    display;
    exec;
    files;
    notifications;
    sqlite;
    terminal;
    watch;
    cron;
    pipe;
    notes;
    tunnel;
    app;
    proxyLogs;
    agent;
    constructor(config) {
        this.credentials = config.credentials ? config.credentials : undefined;
        this.autoRefresh = config.autoRefresh !== false;
        this.urlTemplates = config.urlTemplates ? config.urlTemplates : undefined;
        this.realmId = config.realmId;
        this.kitAuth = config.kitAuth;
        this.onKitAuthExpired = config.onKitAuthExpired;
        // Setup request error/auth handlers
        const configWithRetry = {
            ...config,
            onError: async (error) => {
                // Try user-provided handler first
                if (config.onError && await config.onError(error)) {
                    return true;
                }
                // Check realm errors first (enriches and re-throws, never retries)
                await this.handleRealmError(error);
                return false;
            },
            onTokenExpired: async (error) => {
                if (typeof config.onTokenExpired === 'function') {
                    const tokenFromUser = await config.onTokenExpired(error);
                    if (tokenFromUser) {
                        return tokenFromUser;
                    }
                }
                return this.handleAuthRefresh(error);
            },
        };
        if (config.kitAuth || config.onKitAuthExpired) {
            const proxyAuthMiddleware = createProxyAuthMiddleware(() => this.kitAuth, // getter — always reads current value
            config.baseURL || '');
            configWithRetry.middlewares = [proxyAuthMiddleware, ...(config.middlewares || [])];
        }
        // Wrap onKitAuthExpired to auto-update this.kitAuth from callback return value
        if (config.onKitAuthExpired) {
            const userCallback = config.onKitAuthExpired;
            configWithRetry.onKitAuthExpired = async (ns, error) => {
                const newAuth = await userCallback(ns, error);
                if (newAuth)
                    this.kitAuth = newAuth;
                return newAuth;
            };
        }
        if (config.refreshToken) {
            configWithRetry.refreshToken = config.refreshToken;
        }
        this.http = new HttpClient(configWithRetry);
        this.api = {
            authTokens: new api.AuthTokensService(this.http, 'api', this.realmId),
            vault: new api.UserVaultService(this.http, 'api', this.realmId),
            authentication: new api.AuthenticationService(this.http, 'api', this.realmId),
            tfa: new api.TwoFactorAuthenticationService(this.http, 'api', this.realmId),
            users: new api.UsersService(this.http, 'api', this.realmId),
            projects: new api.ProjectsService(this.http, 'api', this.realmId),
            containers: new api.ContainersService(this.http, 'api', this.realmId),
            images: new api.ContainerImagesService(this.http, 'api', this.realmId),
            firewall: new api.ContainerFirewallService(this.http, 'api', this.realmId),
            env: new api.ContainerEnvironmentService(this.http, 'api', this.realmId),
            notifications: new api.NotificationsService(this.http, 'api', this.realmId),
            proxyPermissionsProject: new api.ProxyPermissionsProjectService(this.http, 'api', this.realmId),
            proxyPermissionsContainer: new api.ProxyPermissionsContainerService(this.http, 'api', this.realmId),
            proxyHooks: new api.ProxyHooksService(this.http, 'api', this.realmId),
            proxyDiscovery: new api.ProxyDiscoveryService(this.http, 'api', this.realmId),
            proxyAliases: new api.ProxyAliasesService(this.http, 'api', this.realmId),
            storageShares: new api.StorageSharesService(this.http, 'api', this.realmId),
            utilities: new api.UtilitiesService(this.http, 'api', this.realmId),
            events: new api.EventsService(this.http, 'api', this.realmId),
            activity: new api.ActivityLogsService(this.http, 'api', this.realmId),
            ai: new api.AiService(this.http, 'api', this.realmId),
            meta: new api.MetaService(this.http, 'api', this.realmId),
            realms: new api.RealmsService(this.http, 'api', this.realmId),
            wallet: new api.WalletService(this.http, 'api', this.realmId),
            poolInvitations: new api.PoolInvitationsService(this.http, 'api', this.realmId),
            pools: new api.PoolsService(this.http, 'api', this.realmId),
            poolMembers: new api.PoolMembersService(this.http, 'api', this.realmId),
            serverRental: new api.ServerRentalService(this.http, 'api', this.realmId),
            rentals: new api.RentalsService(this.http, 'api', this.realmId),
            serverCommands: new api.ServerCommandsService(this.http, 'api', this.realmId),
            waitlist: new api.WaitlistService(this.http, 'api', this.realmId),
        };
        this.browser = {
            instances: new browser.InstanceManagementService(this.http, 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            interaction: new browser.BrowserInteractionService(this.http, 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            introspection: new browser.IntrospectionControlService(this.http, 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            health: new browser.ServerHealthMetricsService(this.http, 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            page: new browser.PageContentService(this.http, 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            cookies: new browser.BrowserStateService(this.http, 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            debugging: new browser.DebuggingService(this.http, 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            history: new browser.BrowsingHistoryService(this.http, 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
        };
        this.code = {
            vscode: new code.VscodeService(this.http, 'code', this.urlTemplates?.['code'], this.getKitUrlTemplatePattern('code')),
            auth: new code.AuthService(this.http, 'code', this.urlTemplates?.['code'], this.getKitUrlTemplatePattern('code')),
            static: new code.StaticService(this.http, 'code', this.urlTemplates?.['code'], this.getKitUrlTemplatePattern('code')),
            extensions: new code.ExtensionsService(this.http, 'code', this.urlTemplates?.['code'], this.getKitUrlTemplatePattern('code')),
            health: new code.HealthService(this.http, 'code', this.urlTemplates?.['code'], this.getKitUrlTemplatePattern('code')),
            proxy: new code.ProxyService(this.http, 'code', this.urlTemplates?.['code'], this.getKitUrlTemplatePattern('code')),
        };
        this.curl = Object.assign(new curl.CurlService(this.http, 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')), {
            events: new curl.EventsService(this.http, 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            health: new curl.HealthService(this.http, 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            jobs: new curl.JobsService(this.http, 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            schedules: new curl.SchedulesService(this.http, 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            sessions: new curl.SessionsService(this.http, 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            storage: new curl.StorageService(this.http, 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            ops: new curl.OpsService(this.http, 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
        });
        this.daemon = {
            health: new daemon.HealthService(this.http, 'daemon', this.urlTemplates?.['daemon'], this.getKitUrlTemplatePattern('daemon')),
            programs: new daemon.ProgramsService(this.http, 'daemon', this.urlTemplates?.['daemon'], this.getKitUrlTemplatePattern('daemon')),
            control: new daemon.ControlService(this.http, 'daemon', this.urlTemplates?.['daemon'], this.getKitUrlTemplatePattern('daemon')),
            status: new daemon.StatusService(this.http, 'daemon', this.urlTemplates?.['daemon'], this.getKitUrlTemplatePattern('daemon')),
            quickStart: new daemon.QuickStartService(this.http, 'daemon', this.urlTemplates?.['daemon'], this.getKitUrlTemplatePattern('daemon')),
        };
        this.display = Object.assign(new display.DisplayService(this.http, 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')), {
            health: new display.HealthService(this.http, 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            screenshots: new display.ScreenshotsService(this.http, 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            thumbnails: new display.ThumbnailsService(this.http, 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            input: new display.InputService(this.http, 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
        });
        this.exec = {
            system: new exec.SystemService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            execution: new exec.ScriptExecutionService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            validate: new exec.ValidateService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            templates: new exec.TemplatesService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            scripts: new exec.ScriptsService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            logs: new exec.LogsService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            cache: new exec.CacheService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            state: new exec.SharedStateService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            route: new exec.RouteService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            monitor: new exec.MonitorService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            health: new exec.HealthService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            dependencies: new exec.DependenciesService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            package: new exec.PackageService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            openapi: new exec.UserOpenapiService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            sdk: new exec.SdkService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            ids: new exec.ListService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            magic: new exec.MagicCommentsService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            schedules: new exec.SchedulesService(this.http, 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
        };
        this.files = Object.assign(new files.FilesService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')), {
            downloads: new files.DownloadsService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            archives: new files.ArchivesService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            backends: new files.BackendsService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            health: new files.HealthService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            journal: new files.JournalService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            mounts: new files.MountsService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            system: new files.SystemService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            images: new files.ImageProcessingService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            webdav: new files.WebdavService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            directories: new files.DirectoriesService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            authentication: new files.AuthenticationService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            ftp: new files.RemoteFtpService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            git: new files.RemoteGitService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            s3: new files.RemoteS3Service(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            ssh: new files.RemoteSshService(this.http, 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
        });
        this.notifications = Object.assign(new notifications.NotificationsService(this.http, 'notifications', this.urlTemplates?.['notifications'], this.getKitUrlTemplatePattern('notifications')), {
            health: new notifications.HealthService(this.http, 'notifications', this.urlTemplates?.['notifications'], this.getKitUrlTemplatePattern('notifications')),
            icons: new notifications.IconsService(this.http, 'notifications', this.urlTemplates?.['notifications'], this.getKitUrlTemplatePattern('notifications')),
            notify: new notifications.NotifyService(this.http, 'notifications', this.urlTemplates?.['notifications'], this.getKitUrlTemplatePattern('notifications')),
        });
        this.sqlite = {
            database: new sqlite.DatabaseService(this.http, 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
            health: new sqlite.HealthService(this.http, 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
            history: new sqlite.HistoryService(this.http, 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
            kvStore: new sqlite.KvStoreService(this.http, 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
            sql: new sqlite.SqlService(this.http, 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
            docs: new sqlite.DocumentationService(this.http, 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
            query: new sqlite.QueryService(this.http, 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
        };
        this.terminal = Object.assign(new terminal.TerminalService(this.http, 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')), {
            health: new terminal.HealthService(this.http, 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            sessions: new terminal.TerminalSessionsService(this.http, 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            execution: new terminal.TerminalExecutionService(this.http, 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            web: new terminal.WebInterfaceService(this.http, 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            docs: new terminal.ApiDocumentationService(this.http, 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            system: new terminal.SystemMonitoringService(this.http, 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            terminalState: new terminal.TerminalStateService(this.http, 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            terminalAutomation: new terminal.TerminalAutomationService(this.http, 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            terminalDragAndDrop: new terminal.TerminalDragAndDropService(this.http, 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
        });
        this.watch = {
            health: new watch.HealthService(this.http, 'watch', this.urlTemplates?.['watch'], this.getKitUrlTemplatePattern('watch')),
            system: new watch.SystemService(this.http, 'watch', this.urlTemplates?.['watch'], this.getKitUrlTemplatePattern('watch')),
            watchers: new watch.WatchersService(this.http, 'watch', this.urlTemplates?.['watch'], this.getKitUrlTemplatePattern('watch')),
            streams: new watch.StreamsService(this.http, 'watch', this.urlTemplates?.['watch'], this.getKitUrlTemplatePattern('watch')),
        };
        this.cron = {
            crontab: new cron.CrontabService(this.http, 'cron', this.urlTemplates?.['cron'], this.getKitUrlTemplatePattern('cron')),
            health: new cron.HealthService(this.http, 'cron', this.urlTemplates?.['cron'], this.getKitUrlTemplatePattern('cron')),
            system: new cron.SystemService(this.http, 'cron', this.urlTemplates?.['cron'], this.getKitUrlTemplatePattern('cron')),
            entries: new cron.EntriesService(this.http, 'cron', this.urlTemplates?.['cron'], this.getKitUrlTemplatePattern('cron')),
        };
        this.pipe = Object.assign(new pipe.PipeService(this.http, 'pipe', this.urlTemplates?.['pipe'], this.getKitUrlTemplatePattern('pipe')), {
            ui: new pipe.UiService(this.http, 'pipe', this.urlTemplates?.['pipe'], this.getKitUrlTemplatePattern('pipe')),
            info: new pipe.InfoService(this.http, 'pipe', this.urlTemplates?.['pipe'], this.getKitUrlTemplatePattern('pipe')),
            health: new pipe.HealthService(this.http, 'pipe', this.urlTemplates?.['pipe'], this.getKitUrlTemplatePattern('pipe')),
        });
        this.notes = {
            health: new notes.HealthService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            identity: new notes.IdentityService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            sockets: new notes.SocketsService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            avatars: new notes.AvatarsService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            notebooks: new notes.NotebooksService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            files: new notes.FilesService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            nodes: new notes.NodesService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            documents: new notes.DocumentsService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            collaborators: new notes.CollaboratorsService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            reactions: new notes.ReactionsService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            interactions: new notes.InteractionsService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            comments: new notes.CommentsService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            versions: new notes.VersionsService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            databases: new notes.DatabasesService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            users: new notes.UsersService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            mutations: new notes.MutationsService(this.http, 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
        };
        this.tunnel = Object.assign(new tunnel.TunnelService(this.http, 'tunnel', this.urlTemplates?.['tunnel'], this.getKitUrlTemplatePattern('tunnel')), {
            health: new tunnel.HealthService(this.http, 'tunnel', this.urlTemplates?.['tunnel'], this.getKitUrlTemplatePattern('tunnel')),
        });
        this.app = {
            health: new app.HealthService(this.http, 'app', this.urlTemplates?.['app'], this.getKitUrlTemplatePattern('app')),
            docs: new app.ApiDocumentationService(this.http, 'app', this.urlTemplates?.['app'], this.getKitUrlTemplatePattern('app')),
            execution: new app.AppExecutionService(this.http, 'app', this.urlTemplates?.['app'], this.getKitUrlTemplatePattern('app')),
            jobs: new app.JobsService(this.http, 'app', this.urlTemplates?.['app'], this.getKitUrlTemplatePattern('app')),
            sources: new app.SourcesService(this.http, 'app', this.urlTemplates?.['app'], this.getKitUrlTemplatePattern('app')),
            configuration: new app.ConfigurationService(this.http, 'app', this.urlTemplates?.['app'], this.getKitUrlTemplatePattern('app')),
            profiles: new app.ProfilesService(this.http, 'app', this.urlTemplates?.['app'], this.getKitUrlTemplatePattern('app')),
            recipes: new app.RecipesService(this.http, 'app', this.urlTemplates?.['app'], this.getKitUrlTemplatePattern('app')),
        };
        this.proxyLogs = {
            logs: new proxyLogs.LogsService(this.http, 'proxyLogs', this.urlTemplates?.['proxyLogs'], this.getKitUrlTemplatePattern('proxyLogs')),
        };
        this.agent = Object.assign(new agent.AgentService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')), {
            settings: new agent.SettingsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            agents: new agent.AgentsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            discovery: new agent.DiscoveryService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            system: new agent.SystemService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            github: new agent.GithubService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            headless: new agent.HeadlessService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            hoody: new agent.HoodyService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            hooks: new agent.HooksService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            jobs: new agent.JobsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            logs: new agent.LogsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            memory: new agent.MemoryService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            models: new agent.ModelsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            sessions: new agent.SessionsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            loops: new agent.LoopsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            tasks: new agent.TasksService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            tools: new agent.ToolsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            workflows: new agent.WorkflowsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            skills: new agent.SkillsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            statistics: new agent.StatisticsService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            todos: new agent.TodosService(this.http, 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
        });
    }
    /**
     * Set authentication token
     */
    setToken(token) {
        this.http.setToken(token);
    }
    /**
     * Get the current auth token, performing a lazy login first when the client
     * was constructed with credentials but has not authenticated yet. Returns
     * undefined if no token is available and no credentials are on file.
     *
     * Documented in the README (tunnel helpers pass `await hoody.getAuthToken()`)
     * and used by the agent streaming helper (lib/agent-client.ts) to mint the
     * `X-Hoody-Token` half of a container-claim kit handshake.
     */
    async getAuthToken() {
        const current = this.http.config?.token;
        if (!current && this.credentials) {
            await this.login(this.credentials);
        }
        const token = this.http.config?.token;
        return token ? String(token) : undefined;
    }
    /**
     * Login with credentials.
     *
     * Returns the typed response shape (ApiAuthenticationLoginResponse) instead
     * of `any` so consumers keep .data autocomplete and tokens narrowing. The
     * typed import comes from generated/types.ts; the @ts-ignore lines are kept
     * because the `api.authentication` namespace is dynamic (its existence
     * depends on the OpenAPI spec at generation time).
     */
    async login(credentials) {
        this.credentials = credentials;
        // @ts-ignore - Assuming api namespace exists and has authentication service
        if (this.api && this.api.authentication) {
            // @ts-ignore
            const response = await this.api.authentication.login(credentials);
            this.updateTokensFromAuthResponse(response);
            return response;
        }
        else {
            throw new Error('Authentication service not available');
        }
    }
    /**
     * Extract and persist auth tokens from login/refresh responses.
     */
    updateTokensFromAuthResponse(response) {
        const responseData = response?.data;
        if (!responseData || typeof responseData !== 'object') {
            return undefined;
        }
        const token = typeof responseData.token === 'string' ? responseData.token : undefined;
        if (!token) {
            return undefined;
        }
        this.setToken(token);
        if (typeof responseData.refreshToken === 'string' && responseData.refreshToken.length > 0) {
            this.refreshToken = responseData.refreshToken;
        }
        return token;
    }
    /**
     * Internal auth refresh flow for 401 responses.
     * Returns a fresh token when recovery succeeds.
     */
    async handleAuthRefresh(error) {
        if (!this.autoRefresh)
            return undefined;
        if (error?.status !== 401)
            return undefined;
        // @ts-ignore - Assuming api namespace exists
        if (!this.api || !this.api.authentication)
            return undefined;
        // Try refresh token first
        if (this.refreshToken) {
            try {
                // @ts-ignore
                const refreshResponse = await this.api.authentication.refreshToken({ refreshToken: this.refreshToken });
                const refreshed = this.updateTokensFromAuthResponse(refreshResponse);
                if (refreshed) {
                    return refreshed;
                }
            }
            catch {
                // Refresh failed, fall back to credentials
            }
        }
        // Fall back to credentials login
        if (this.credentials) {
            try {
                // @ts-ignore
                const loginResponse = await this.api.authentication.login(this.credentials);
                return this.updateTokensFromAuthResponse(loginResponse);
            }
            catch {
                // Login failed
            }
        }
        return undefined;
    }
    /**
     * Handle realm-related 403 errors by enriching with allowed realms
     */
    async handleRealmError(error) {
        if (error.status !== 403)
            return false;
        const msg = error.response?.message || error.message || '';
        const isRealmError = msg.includes('requires a realm-scoped URL') ||
            msg.includes('not valid for realm');
        if (!isRealmError)
            return false;
        // Fetch allowed realms from base domain (bootstrap exception)
        let allowedRealms = [];
        try {
            // Create a base-domain client (no realm) for introspection
            const baseHttp = new HttpClient({
                baseURL: this.http.config.baseURL,
                token: this.http.config.token,
                timeout: this.http.config.timeout || 10000,
            });
            const meResult = await baseHttp.get('/api/v1/auth/tokens/me', {});
            allowedRealms = meResult?.data?.restrictions?.allowed_realm_ids || [];
        }
        catch {
            // Introspection failed — still throw enriched error with what we know
        }
        const enriched = new Error(allowedRealms.length > 0
            ? `${msg}. Valid realms for this token: [${allowedRealms.join(', ')}]. Use client.withRealm('${allowedRealms[0]}') to scope your client.`
            : `${msg}. Use client.api.authTokens.getCurrentAuthToken() on the base domain to discover your allowed realms.`);
        enriched.status = 403;
        enriched.code = 'REALM_SCOPE_ERROR';
        enriched.response = error.response;
        enriched.allowedRealms = allowedRealms;
        enriched.currentRealm = this.realmId;
        enriched.request = error.request;
        throw enriched;
    }
    /**
     * Static factory for authentication
     */
    static async authenticate(baseURL, credentials) {
        const client = new HoodyClient({ baseURL, credentials });
        await client.login(credentials);
        return client;
    }
    /**
     * Create a new client instance scoped to a specific container
     *
     * Automatically fetches container details if ID is provided,
     * and configures URL templates for all hoody-kit services.
     *
     * @param containerOrId - Container object or ID
     * @param options - Container scoping options
     */
    async withContainer(containerOrId, options) {
        let container;
        if (typeof containerOrId === 'string') {
            // Fetch container details
            const response = await this.api.containers.get(containerOrId);
            container = response.data;
        }
        else {
            container = containerOrId;
        }
        // Accept either server or server_name (API response uses the latter;
        // hand-built objects often use the former).
        const containerServer = _resolveContainerServer(container);
        if (!container || !container.id || !container.project_id || !containerServer) {
            throw new Error('Invalid container object: missing id, project_id, or server/server_name');
        }
        // Create new client with pre-filled templates
        // We cast to any to access private config, or we can just reconstruct it
        const config = this.http.config;
        const newConfig = {
            baseURL: config.baseURL || '',
        };
        // Preserve ALL parent config fields on the scoped client. Without this,
        // transport, forceIPv4, forceIPv4Cache, and clientId/clientName are
        // silently dropped, and `timeout: 0` (caller opt-out) gets coerced to the
        // default 30s because a truthy check rejects 0. Use explicit `!== undefined`
        // for numeric fields where 0 is a meaningful value.
        if (config.token)
            newConfig.token = config.token;
        if (config.timeout !== undefined)
            newConfig.timeout = config.timeout; // keep timeout:0
        if (config.retries !== undefined)
            newConfig.retries = config.retries; // keep retries:0
        if (config.retryDelayMs !== undefined)
            newConfig.retryDelayMs = config.retryDelayMs;
        if (config.retryOnStatuses)
            newConfig.retryOnStatuses = config.retryOnStatuses;
        if (config.headers)
            newConfig.headers = config.headers;
        if (config.cache)
            newConfig.cache = config.cache;
        if (config.middlewares)
            newConfig.middlewares = config.middlewares;
        if (config.onTokenExpired)
            newConfig.onTokenExpired = config.onTokenExpired;
        if (config.refreshToken)
            newConfig.refreshToken = config.refreshToken;
        if (config.autoRetryAuth !== undefined)
            newConfig.autoRetryAuth = config.autoRetryAuth;
        if (config.transport)
            newConfig.transport = config.transport;
        if (config.forceIPv4 !== undefined)
            newConfig.forceIPv4 = config.forceIPv4;
        if (config.forceIPv4Cache)
            newConfig.forceIPv4Cache = config.forceIPv4Cache;
        if (config.clientId)
            newConfig.clientId = config.clientId;
        if (config.clientName)
            newConfig.clientName = config.clientName;
        if (this.realmId)
            newConfig.realmId = this.realmId;
        if (this.credentials)
            newConfig.credentials = this.credentials;
        newConfig.autoRefresh = this.autoRefresh;
        // Apply kit authentication.
        // When options.kitAuth overrides the parent's kitAuth, strip ANY
        // proxy-auth middleware (tagged via _proxyAuthMiddleware) from the cloned
        // middleware array before the new constructor prepends the fresh one.
        // Otherwise the child carries BOTH middlewares and the stale one may win
        // for requests that hit the pipeline before the new one.
        if (options?.kitAuth) {
            newConfig.kitAuth = options.kitAuth;
            if (newConfig.middlewares) {
                newConfig.middlewares = newConfig.middlewares.filter(m => !m._proxyAuthMiddleware);
            }
        }
        else if (this.kitAuth) {
            newConfig.kitAuth = this.kitAuth;
        }
        if (options?.onKitAuthExpired) {
            newConfig.onKitAuthExpired = options.onKitAuthExpired;
        }
        else if (this.onKitAuthExpired) {
            newConfig.onKitAuthExpired = this.onKitAuthExpired;
        }
        newConfig.urlTemplates = {
            'browser': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'code': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'curl': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'daemon': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'display': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'exec': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'files': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'notifications': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'sqlite': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'terminal': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'watch': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'cron': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'pipe': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'notes': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'tunnel': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'app': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'proxyLogs': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'agent': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            }
        };
        return new HoodyClient(newConfig);
    }
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
    withRealm(realmId) {
        const config = this.http.config;
        const normalizedRealm = typeof realmId === 'string' ? realmId.trim() : '';
        const clearRealmScope = normalizedRealm.length === 0 ||
            normalizedRealm === '*' ||
            normalizedRealm.toLowerCase() === 'all' ||
            normalizedRealm.toLowerCase() === 'default';
        const newConfig = {
            baseURL: config.baseURL || '',
        };
        if (!clearRealmScope) {
            newConfig.realmId = normalizedRealm;
        }
        // Preserve all parent config + kit auth state. Without this, withRealm()
        // drops transport/forceIPv4/clientId/kitAuth/onKitAuthExpired and coerces
        // timeout:0 to the default 30s.
        if (config.token)
            newConfig.token = config.token;
        if (config.timeout !== undefined)
            newConfig.timeout = config.timeout;
        if (config.retries !== undefined)
            newConfig.retries = config.retries;
        if (config.retryDelayMs !== undefined)
            newConfig.retryDelayMs = config.retryDelayMs;
        if (config.retryOnStatuses)
            newConfig.retryOnStatuses = config.retryOnStatuses;
        if (config.headers)
            newConfig.headers = config.headers;
        if (config.cache)
            newConfig.cache = config.cache;
        if (config.middlewares)
            newConfig.middlewares = config.middlewares;
        if (config.onTokenExpired)
            newConfig.onTokenExpired = config.onTokenExpired;
        if (config.refreshToken)
            newConfig.refreshToken = config.refreshToken;
        if (config.autoRetryAuth !== undefined)
            newConfig.autoRetryAuth = config.autoRetryAuth;
        if (config.transport)
            newConfig.transport = config.transport;
        if (config.forceIPv4 !== undefined)
            newConfig.forceIPv4 = config.forceIPv4;
        if (config.forceIPv4Cache)
            newConfig.forceIPv4Cache = config.forceIPv4Cache;
        if (config.clientId)
            newConfig.clientId = config.clientId;
        if (config.clientName)
            newConfig.clientName = config.clientName;
        if (this.credentials)
            newConfig.credentials = this.credentials;
        if (this.urlTemplates)
            newConfig.urlTemplates = this.urlTemplates;
        if (this.kitAuth)
            newConfig.kitAuth = this.kitAuth;
        if (this.onKitAuthExpired)
            newConfig.onKitAuthExpired = this.onKitAuthExpired;
        newConfig.autoRefresh = this.autoRefresh;
        return new HoodyClient(newConfig);
    }
    /**
     * Get the current realm ID (if scoped)
     */
    getRealmId() {
        return this.realmId;
    }
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
    getKitUrl(kit, container, serviceIndexOrOptions = 1) {
        const hasOptionsObject = typeof serviceIndexOrOptions === 'object'
            && serviceIndexOrOptions !== null
            && !Array.isArray(serviceIndexOrOptions);
        const isLocal = hasOptionsObject && serviceIndexOrOptions.local === true;
        const serviceSegment = this.resolveKitServiceSegment(kit, serviceIndexOrOptions);
        const containersDomain = this.resolveContainersDomain();
        if (isLocal) {
            return `https://localhost.${containersDomain}/${serviceSegment}`;
        }
        // Not local — container identity is mandatory. Accept either server_name
        // (API response) or server (hand-built objects) via _resolveContainerServer.
        const containerServer = _resolveContainerServer(container);
        if (!container || !container.id || !container.project_id || !containerServer) {
            throw new Error('Invalid container object');
        }
        return `https://${container.project_id}-${container.id}-${serviceSegment}.${containerServer}.${containersDomain}`;
    }
    /**
     * Build a URL-template pattern for a specific kit namespace
     * using a baseURL-derived containers domain (domain-agnostic).
     */
    getKitUrlTemplatePattern(namespace) {
        const containersDomain = this.resolveContainersDomain();
        const kitSegment = this.resolveKitNamespaceSegment(namespace);
        // Both proxyLogs and tunnel spec their patterns with {serverName} (not
        // {server}). Without this, getKitUrl('tunnel', ...) produces a URL with
        // an unsubstituted {server} variable.
        const serverVariable = (namespace === 'proxyLogs' || namespace === 'tunnel') ? 'serverName' : 'server';
        return `https://{projectId}-{containerId}-${kitSegment}-{serviceIndex}.{${serverVariable}}.${containersDomain}`;
    }
    /**
     * Derive containers domain from configured baseURL.
     *
     * Examples:
     * - api.hoody.com -> containers.hoody.com
     * - api.hoody.com -> containers.hoody.com
     * - {realm}.api.hoody.com -> containers.hoody.com
     */
    resolveContainersDomain() {
        const fallback = 'containers.hoody.com';
        const baseURL = this.http.getBaseURL();
        try {
            const host = new URL(baseURL).hostname;
            if (!host)
                return fallback;
            // Localhost / IP literal / bare-hostname baseURLs have no DNS-suffix we
            // can meaningfully transform. Returning 'containers.localhost' /
            // 'containers.127.0.0.1' would produce unresolvable subdomains for
            // dev/testing setups.
            const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
            const isIpv6 = /:/.test(host);
            const isLocalhost = host === 'localhost' || host.endsWith('.localhost');
            if (isIpv4 || isIpv6 || isLocalhost)
                return host;
            if (host.startsWith('containers.')) {
                return host;
            }
            const realmScopedApiHostPattern = /^[a-f0-9]{24}\.api\./i;
            if (realmScopedApiHostPattern.test(host)) {
                return host.replace(realmScopedApiHostPattern, 'containers.');
            }
            if (host.startsWith('api.')) {
                return `containers.${host.slice(4)}`;
            }
            const replaced = host.replace('.api.', '.containers.');
            if (replaced !== host) {
                return replaced;
            }
            return `containers.${host}`;
        }
        catch {
            return fallback;
        }
    }
    /**
     * Map SDK namespace to kit subdomain segment.
     */
    resolveKitNamespaceSegment(namespace) {
        if (namespace === 'notifications')
            return 'n';
        if (namespace === 'proxyLogs')
            return 'logs';
        if (namespace === 'app')
            return 'run';
        return namespace;
    }
    /**
     * Build the subdomain service segment used in Kit URLs.
     *
     * Examples:
     * - terminal + index 2 => terminal-2
     * - http + port 8080 => http-8080
     * - https-8443 => https-8443
     * - ssh => ssh
     */
    resolveKitServiceSegment(kit, serviceIndexOrOptions) {
        const rawKit = String(kit || '').trim().toLowerCase();
        if (!rawKit) {
            throw new Error('Kit name is required');
        }
        // proxyLogs must normalize to 'logs' here, matching
        // resolveKitNamespaceSegment. Without this, getKitUrl('proxyLogs', ...)
        // produces a URL subdomain like proxyLogs-1 instead of logs-1.
        const normalizedKit = rawKit === 'notifications' ? 'n'
            : rawKit === 'app' ? 'run'
                : rawKit === 'proxylogs' ? 'logs'
                    : rawKit;
        // Accept explicit dynamic service slugs as-is (http-8080, https-8443).
        if (/^(https?)-\d+$/.test(normalizedKit)) {
            return normalizedKit;
        }
        // SSH and proxy are special cases and do not use a numeric suffix.
        if (normalizedKit === 'ssh' || normalizedKit === 'proxy') {
            return normalizedKit;
        }
        const hasOptionsObject = typeof serviceIndexOrOptions === 'object'
            && serviceIndexOrOptions !== null
            && !Array.isArray(serviceIndexOrOptions);
        const options = hasOptionsObject ? serviceIndexOrOptions : {};
        let serviceIndex = typeof serviceIndexOrOptions === 'number' ? serviceIndexOrOptions : (options.serviceIndex ?? 1);
        const protocol = options.protocol;
        const optionPort = options.port;
        // Support protocol + port URL helpers:
        // - getKitUrl('http', container, { port: 8080 })
        // - getKitUrl('https', container, { port: 8443 })
        // - getKitUrl('http', container, 8080) // number interpreted as port for http/https
        if (normalizedKit === 'http' || normalizedKit === 'https' || protocol) {
            const resolvedProtocol = protocol || (normalizedKit === 'https' ? 'https' : 'http');
            const port = optionPort ?? (typeof serviceIndexOrOptions === 'number' ? serviceIndexOrOptions : undefined) ?? (resolvedProtocol === 'https' ? 443 : 80);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error(`Invalid port for ${resolvedProtocol} kit URL: ${port}`);
            }
            return `${resolvedProtocol}-${port}`;
        }
        if (!Number.isInteger(serviceIndex) || serviceIndex < 1) {
            throw new Error(`Invalid serviceIndex for kit URL: ${serviceIndex}`);
        }
        return `${normalizedKit}-${serviceIndex}`;
    }
    /**
     * Generate URLs for all standard kits
     */
    getKitUrls(container, serviceIndexOrOptions = 1) {
        const kits = ['terminal', 'browser', 'code', 'curl', 'cron', 'daemon', 'display', 'desktop', 'exec', 'files', 'notifications', 'sqlite', 'watch', 'logs', 'notes', 'app', 'pipe', 'tunnel', 'agent', 'proxy'];
        const urls = {};
        for (const kit of kits) {
            urls[kit] = this.getKitUrl(kit, container, serviceIndexOrOptions);
        }
        return urls;
    }
    /**
     * Get the Hoody IP check base URL (https://ip.hoody.com).
     *
     * Useful for verifying the exit IP of a container proxy.
     * Example: `curl -x ${client.getKitUrl('proxy', container)} ${client.getIpUrl()}`
     */
    getIpUrl() {
        return `https://${this.resolveIpDomain()}`;
    }
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
    async checkIp(options) {
        const url = `https://${this.resolveIpDomain()}/api/v1/ip`;
        const requestData = {};
        if (options?.signal)
            requestData.signal = options.signal;
        if (options?.timeoutMs !== undefined)
            requestData.timeoutMs = options.timeoutMs;
        return this.http.get(url, requestData);
    }
    /**
     * Derive IP-check domain from configured baseURL.
     *
     * Examples:
     * - api.hoody.com -> ip.hoody.com
     * - api.hoody.com -> ip.hoody.com
     * - {realm}.api.hoody.com -> ip.hoody.com
     */
    resolveIpDomain() {
        const fallback = 'ip.hoody.com';
        const baseURL = this.http.getBaseURL();
        try {
            const host = new URL(baseURL).hostname;
            if (!host)
                return fallback;
            if (host.startsWith('ip.')) {
                return host;
            }
            const realmScopedApiHostPattern = /^[a-f0-9]{24}\.api\./i;
            if (realmScopedApiHostPattern.test(host)) {
                return host.replace(realmScopedApiHostPattern, 'ip.');
            }
            if (host.startsWith('api.')) {
                return `ip.${host.slice(4)}`;
            }
            const replaced = host.replace('.api.', '.ip.');
            if (replaced !== host) {
                return replaced;
            }
            // Guard: localhost and IP literals — keep using fallback
            if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) {
                return fallback;
            }
            return `ip.${host}`;
        }
        catch {
            return fallback;
        }
    }
}
