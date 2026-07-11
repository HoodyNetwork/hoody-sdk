/**
 * Kit Proxy Auth Middleware
 *
 * Injects Kit authentication credentials into requests targeting
 * Kit service URLs. Applied as the FIRST middleware so it runs
 * before user middlewares.
 */
import type { IHttpClientMiddleware } from '../generated/http-client.js';
import { type ProxyAuth, type ProxyAuthPolicy } from './proxy-auth.js';
/**
 * Creates a middleware that injects proxy auth credentials into Kit requests.
 *
 * @param getAuth - Getter for the proxy auth configuration or policy
 * @param baseURL - The API base URL (used to distinguish API vs Kit requests)
 */
export declare function createProxyAuthMiddleware(getAuth: () => ProxyAuth | ProxyAuthPolicy | undefined, baseURL: string): IHttpClientMiddleware;
