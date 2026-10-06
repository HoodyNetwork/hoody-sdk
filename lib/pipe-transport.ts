/**
 * Pipe transport — how PipeStream (Node) and PipeMedia (browser) reach the
 * pipe kit. Browser-safe: no Node imports.
 *
 * `fromClient()` used to copy only the kit URL and then call the global
 * `fetch` with no credentials: the client's injected transport (egress
 * policy) and its `kitAuth` were both lost, so a permission-guarded pipe
 * refused every transfer. A transport built from the client instead sends
 * each request through `client.http.stream()` — the same seam the generated
 * streaming methods use: injected fetch, request middleware (kitAuth, with the
 * `pipe` namespace so a per-service policy selects its entry), Authorization
 * stripped on kit URLs, and non-2xx raised as ApiError.
 *
 * A pipe receiver's response headers wait for the sender, so the header
 * budget defaults to none (`timeoutMs: 0`); pass `timeoutMs` to bound it.
 */

import { isSecretHeaderName, redactUrl } from './redact.js';

/** The request a pipe helper makes. */
export interface PipeTransportRequest {
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * Browser HTTP cache mode, set by the global-fetch transport only. A client
   * transport cannot set it, so browser helpers also add a unique `_=` to
   * their GETs there (pipe-media.ts withCacheBuster).
   */
  cache?: RequestInit['cache'];
}

/** Sends one pipe request and returns the response with its body unread. */
export type PipeTransport = (method: string, url: string, request: PipeTransportRequest) => Promise<Response>;

interface StreamingHttp {
  stream(method: string, path: string, data?: Record<string, unknown>): Promise<Response>;
}

/**
 * Transport over a HoodyClient's HttpClient. Returns undefined for an object
 * without one (a plain `{ getKitUrl }` stub), which keeps the global-fetch path.
 */
export function pipeTransportFromClient(client: unknown): PipeTransport | undefined {
  const http = (client as { http?: Partial<StreamingHttp> } | null | undefined)?.http;
  if (!http || typeof http.stream !== 'function') return undefined;
  const stream = http.stream.bind(http) as StreamingHttp['stream'];
  return (method, url, request) => stream(method, url, {
    ...(request.headers ? { headers: request.headers } : {}),
    ...(request.body !== undefined ? { body: request.body } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
    timeoutMs: request.timeoutMs ?? 0,
    middlewareContext: { _kitNamespace: 'pipe' },
  });
}

/**
 * Whether a pipe request carries a credential, as the clients count one
 * (carriesCredential): a header the redaction set names, the container claim,
 * a header named in `extraHeaderNames` (a configured kit-token header), or a
 * secret the URL redactor would hide (userinfo, a token in the query or path).
 * Such a request never follows a redirect: fetch strips only Authorization,
 * Cookie and Proxy-Authorization on a cross-origin hop.
 */
export function pipeRequestCarriesCredential(
  url: string,
  headers: Record<string, string> | undefined,
  extraHeaderNames: readonly string[] = [],
): boolean {
  const extra = new Set(extraHeaderNames.filter((n) => n.length > 0).map((n) => n.toLowerCase()));
  const credentialHeader = Object.keys(headers ?? {}).some((name) => {
    const lower = name.toLowerCase();
    return isSecretHeaderName(name) || lower === 'x-hoody-container-claim' || extra.has(lower);
  });
  if (credentialHeader) return true;
  // redactUrl re-serialises the URL, so compare it with the serialised form, not the input.
  let serialised = url;
  try {
    serialised = new URL(url).toString();
  } catch {
    // Unparseable: redactUrl scrubs the query text as written.
  }
  return redactUrl(serialised) !== serialised;
}

/** Global-fetch fallback, for a helper constructed from a bare URL. */
export function globalFetchPipeTransport(): PipeTransport {
  return (method, url, request) => {
    const init: RequestInit & { duplex?: 'half' } = { method };
    if (request.headers) init.headers = request.headers;
    if (request.body !== undefined) {
      init.body = request.body as BodyInit;
      if (typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream) init.duplex = 'half';
    }
    if (request.signal) init.signal = request.signal;
    if (request.cache) init.cache = request.cache;
    // There is no client here, so no kitAuth header name was recorded to add.
    if (pipeRequestCarriesCredential(url, request.headers)) init.redirect = 'error';
    return fetch(url, init as RequestInit);
  };
}
