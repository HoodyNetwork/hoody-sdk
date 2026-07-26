/**
   * Unified SDK - Root Index
   *
   * Multi-namespace SDK with the following APIs:
   * - api
 * - browser
 * - code
 * - curl
 * - daemon
 * - display
 * - exec
 * - files
 * - notifications
 * - sqlite
 * - terminal
 * - watch
 * - cron
 * - pipe
 * - notes
 * - tunnel
 * - app
 * - proxyLogs
 * - agent
   *
   * @example
   * ```typescript
   * import * as SDK from './index';
   *
   * // Access services by namespace
   *  * const apiService = new SDK.api.SomeService(); // api
 * const browserService = new SDK.browser.SomeService(); // browser
 * const codeService = new SDK.code.SomeService(); // code
 * const curlService = new SDK.curl.SomeService(); // curl
 * const daemonService = new SDK.daemon.SomeService(); // daemon
 * const displayService = new SDK.display.SomeService(); // display
 * const execService = new SDK.exec.SomeService(); // exec
 * const filesService = new SDK.files.SomeService(); // files
 * const notificationsService = new SDK.notifications.SomeService(); // notifications
 * const sqliteService = new SDK.sqlite.SomeService(); // sqlite
 * const terminalService = new SDK.terminal.SomeService(); // terminal
 * const watchService = new SDK.watch.SomeService(); // watch
 * const cronService = new SDK.cron.SomeService(); // cron
 * const pipeService = new SDK.pipe.SomeService(); // pipe
 * const notesService = new SDK.notes.SomeService(); // notes
 * const tunnelService = new SDK.tunnel.SomeService(); // tunnel
 * const appService = new SDK.app.SomeService(); // app
 * const proxyLogsService = new SDK.proxyLogs.SomeService(); // proxyLogs
 * const agentService = new SDK.agent.SomeService(); // agent
   * ```
   *
   * @packageDocumentation
   */
export * as api from './api/index.js';
export * as browser from './browser/index.js';
export * as code from './code/index.js';
export * as curl from './curl/index.js';
export * as daemon from './daemon/index.js';
export * as display from './display/index.js';
export * as exec from './exec/index.js';
export * as files from './files/index.js';
export * as notifications from './notifications/index.js';
export * as sqlite from './sqlite/index.js';
export * as terminal from './terminal/index.js';
export * as watch from './watch/index.js';
export * as cron from './cron/index.js';
export * as pipe from './pipe/index.js';
export * as notes from './notes/index.js';
export * as tunnel from './tunnel/index.js';
export * as app from './app/index.js';
export * as proxyLogs from './proxyLogs/index.js';
export * as agent from './agent/index.js';
export * from './types.js';
export { ApiError, isApiError, isRetryableApiError, ValidationError, type ApiErrorRequestContext, type ApiErrorResponseDetails, type RetryableApiError, type RetryableStatus } from './errors.js';
export { HttpClient } from './http-client.js';
export type { IHttpClientConfig, IRequestData, IHttpClientMiddleware, IHttpClientMiddlewareRequestContext, IHttpClientMiddlewareResponseContext, IHttpClientMiddlewareErrorContext, } from './http-client.js';
export { HoodyClient } from './client.js';
