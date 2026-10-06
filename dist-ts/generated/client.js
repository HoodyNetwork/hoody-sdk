/**
 * Unified Hoody Client
 *
 * Wraps all services and namespaces into a single client with shared configuration.
 */
import { HttpClient } from './http-client.js';
import { ApiError, isApiError, ValidationError } from './errors.js';
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
import * as egress from './egress/index.js';
import * as run from './run/index.js';
import * as proxyLogs from './proxyLogs/index.js';
import * as agent from './agent/index.js';
import * as bot from './bot/index.js';
/**
 * Every kit URL template names the server {serverName}; before, most named it {server}. For one
 * release a variable set that gives only server has serverName filled from it, so a caller still
 * passing the older name reaches the same host. The caller's object is copied, never changed.
 */
function _withServerNameAlias(templates) {
    if (!templates)
        return undefined;
    const out = {};
    for (const [namespace, vars] of Object.entries(templates)) {
        const copy = { ...vars };
        if (copy.serverName === undefined && copy.server !== undefined)
            copy.serverName = copy.server;
        out[namespace] = copy;
    }
    return out;
}
/**
 * The resolved target of a client config (see HoodyClientConfig.target). The
 * default is decided by explicit signals only: credentials mean an account
 * login, and the Hoody API host is recognised by its last three labels. Any
 * other host is used as given, so a direct-kit URL of any shape keeps working.
 */
function _resolveClientTarget(config) {
    if (config.target === 'account' || config.target === 'kit')
        return config.target;
    if (config.credentials || !config.baseURL)
        return 'account';
    let host = '';
    try {
        // A fully qualified host ('api.hoody.com.') is the same host.
        host = new URL(config.baseURL).hostname.toLowerCase().replace(/[.]+$/, '');
    }
    catch {
        // A relative base ('/proxy') is the account API behind the page's own
        // origin: the constructor resolves it against the page (_effectiveBaseURL),
        // and without a page a realm request on it is refused rather than sent
        // unscoped. Read as a kit URL it had no realm at all, so withRealm(id).http
        // sent the bearer to the unscoped account API.
        return 'account';
    }
    const labels = host.split('.');
    const n = labels.length;
    if (n >= 3 && labels[n - 3] === 'api' && labels[n - 2] === 'hoody')
        return 'account';
    // A bearer token on a host that is not recognisably the Hoody API is
    // ambiguous: a self-hosted or local account API, or a kit reached directly.
    // It is used as given ('kit': no kit-path refusal, no realm label split),
    // which is how such clients always behaved; say so once, so the choice is
    // visible and can be made explicit.
    if (config.token && !_warnedAmbiguousTarget) {
        _warnedAmbiguousTarget = true;
        console.warn('[HoodyClient] ' + host + ' is not a Hoody API host, so this client treats baseURL as a kit or daemon '
            + "reached directly (kit namespaces are not refused, a realm label in the host is kept as given). Pass target: 'account' "
            + "if it is an account API (kit calls then need withContainer(), and withRealm('all') can clear a realm label), or "
            + "target: 'kit' to silence this warning.");
    }
    return 'kit';
}
/** _resolveClientTarget warns about an ambiguous target once per process. */
let _warnedAmbiguousTarget = false;
/** A realm id as hoody-api accepts it: exactly 24 hexadecimal characters (case-insensitive). */
const REALM_ID_PATTERN = /^[a-f0-9]{24}$/i;
/**
 * Normalise a realm selector. Returns the lower-cased realm id, or undefined
 * for the selectors that mean "no realm" ('', '*', 'all', 'default'). Anything
 * else is refused: hoody-api only reads a realm from a 24-hex host label and
 * silently treats any other label as unscoped, so passing it through would run
 * the request against every realm of the account. Same rule as the CLI.
 */
function _normalizeRealmSelector(value, field) {
    if (value === undefined || value === null)
        return undefined;
    const trimmed = String(value).trim();
    const lowered = trimmed.toLowerCase();
    if (trimmed.length === 0 || lowered === '*' || lowered === 'all' || lowered === 'default') {
        return undefined;
    }
    if (!REALM_ID_PATTERN.test(trimmed)) {
        throw new ValidationError('Invalid realm id "' + trimmed + '": a realm id is 24 hexadecimal characters; use "all" or "default" to clear the realm.', field);
    }
    return lowered;
}
/**
 * The realm host of an account base URL, or undefined when its host cannot
 * carry one: hoody-api reads a realm only from a host of four labels or more,
 * and an IP literal has no labels to prefix.
 */
function _realmHostOf(accountBaseURL, realmId) {
    try {
        const host = new URL(accountBaseURL).hostname.toLowerCase();
        if (host.includes(':') || host.startsWith('[') || /^[0-9.]+$/.test(host))
            return undefined;
        if (host.replace(/[.]+$/, '').split('.').length < 3)
            return undefined;
        return { accountHost: host, realmHost: realmId + '.' + host };
    }
    catch {
        return undefined;
    }
}
/** Session generations, unique across every session in the process. */
let _sessionEpoch = 0;
const _ROUTE_DECISIONS = new WeakMap();
/** Tags whose call has settled. */
const _SPENT_ROUTE_TAGS = new WeakSet();
function _routeTag(decision) {
    const tag = Object.freeze({});
    _ROUTE_DECISIONS.set(tag, decision);
    return tag;
}
function _spendRouteTag(tag) {
    _ROUTE_DECISIONS.delete(tag);
    _SPENT_ROUTE_TAGS.add(tag);
}
/**
 * The decision a tag carries, if the tag is one this owner's guard issued and
 * its call has not settled. A spent tag is refused outright.
 */
function _routeDecision(tag, owner) {
    if (!tag)
        return undefined;
    if (_SPENT_ROUTE_TAGS.has(tag)) {
        throw new ValidationError('This request presents the route tag of a call that has already finished; a route tag is good for one call.', 'routeTag');
    }
    const decision = _ROUTE_DECISIONS.get(tag);
    return decision && decision.owner === owner ? decision : undefined;
}
/**
 * Spend a guarded call's tag once the call has settled: a promise when it
 * settles, anything else at once. streamEvents goes through _lazyTaggedStream.
 */
function _spendWhenSettled(result, tag) {
    if (!tag)
        return result;
    if (result && typeof result.then === 'function') {
        return result.finally(() => _spendRouteTag(tag));
    }
    _spendRouteTag(tag);
    return result;
}
/**
 * A guarded streamEvents call. Its one request is made by the first next()
 * or the first read of `response`, so the call is opened (and its tag
 * issued) only then, and the tag is spent as soon as the response or that
 * first next() settles: later next() calls only read the body. return() and throw() spend it too. An iterator that is closed before
 * it was read, or dropped unread, never issued a tag, so none is left live.
 *
 * It carries the stream's `response` (IEventStream) across the wrapper: the
 * opened stream's own, or, for one closed or refused before it opened, a
 * rejection. Without it the headers a stream answers with (hoody-agent's
 * X-Hoody-Turn-Id) were out of reach on every container-scoped client.
 */
function _lazyTaggedStream(open) {
    let inner;
    let tag;
    let closed = false;
    let settle;
    const response = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });
    // The iteration raises every failure itself; an unread response is not an unhandled rejection.
    response.catch(() => undefined);
    const refuse = (reason) => {
        if (settle)
            settle.reject(reason);
        settle = undefined;
    };
    const closedError = () => {
        const error = new Error('The event stream was closed before a response was accepted');
        error.name = 'StreamClosedError';
        return error;
    };
    const spend = () => {
        if (tag)
            _spendRouteTag(tag);
        tag = undefined;
    };
    const done = (value) => ({ done: true, value });
    // Opens the call once: the first next() or the first read of response,
    // whichever comes first. Reading the opened stream's response sends its
    // request (IEventStream), so the tag is spent when that settles too.
    let openFailure;
    const ensureOpen = () => {
        if (inner)
            return inner;
        if (openFailure)
            throw openFailure.error;
        let opened;
        try {
            opened = open();
        }
        catch (error) {
            openFailure = { error };
            refuse(error);
            throw error;
        }
        tag = opened.tag;
        inner = opened.iterable[Symbol.asyncIterator]();
        const innerResponse = opened.iterable.response;
        if (settle && innerResponse && typeof innerResponse.then === 'function') {
            const { resolve, reject } = settle;
            settle = undefined;
            innerResponse.then(resolve, reject);
            innerResponse.then(spend, spend);
        }
        return inner;
    };
    const stream = {
        get response() {
            if (!closed && !inner && !openFailure) {
                try {
                    ensureOpen();
                }
                catch {
                    // response is rejected with the failure; next() raises it.
                }
            }
            return response;
        },
        [Symbol.asyncIterator]() {
            return stream;
        },
        async next(...args) {
            if (closed)
                return done();
            const opened = ensureOpen();
            try {
                const result = await opened.next(...args);
                if (result.done) {
                    closed = true;
                    refuse(closedError());
                }
                return result;
            }
            catch (error) {
                closed = true;
                refuse(error);
                throw error;
            }
            finally {
                spend();
            }
        },
        async return(value) {
            closed = true;
            spend();
            refuse(closedError());
            return inner && inner.return ? inner.return(value) : done(value);
        },
        async throw(error) {
            closed = true;
            spend();
            refuse(error);
            if (inner && inner.throw)
                return inner.throw(error);
            throw error;
        },
    };
    return stream;
}
/**
 * A streamEvents call refused before it was sent: the first next() and the
 * stream's `response` both reject with the refusal, as an opened stream's
 * would.
 */
function _refusedStream(error) {
    const response = Promise.reject(error);
    response.catch(() => undefined);
    let finished = false;
    const stream = {
        response,
        [Symbol.asyncIterator]() {
            return stream;
        },
        async next() {
            if (finished)
                return { done: true, value: undefined };
            finished = true;
            throw error;
        },
        async return(value) {
            finished = true;
            return { done: true, value };
        },
        async throw(thrown) {
            finished = true;
            throw thrown;
        },
    };
    return stream;
}
/**
 * Auth calls that carry a credential in the request itself (password, refresh
 * token, 2FA or device code, OAuth exchange): every call other than a read
 * under the two auth route prefixes. They are refused outside the API's
 * credential scope and sent with every redirect refused, same-origin ones
 * included: hoody-api does not redirect these routes, so a redirect there is
 * not something to follow.
 *
 * This covers the credentials the SDK itself sends or injects. Other calls
 * whose body the CALLER fills with a secret (users.update with a new
 * password, the proxy password-group setters) follow the caller's routing: a
 * middleware that sends them elsewhere sends their body there. See
 * IHttpClientMiddleware.
 */
function _isCredentialAuthCall(method, url) {
    const upper = method.toUpperCase();
    if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS')
        return false;
    try {
        return /[/]api[/]v1[/](users[/])?auth[/]/.test(new URL(url, 'http://relative.invalid').pathname);
    }
    catch {
        return false;
    }
}
/**
 * Lower-cased host name of a URL, without a trailing dot, or undefined when it
 * does not parse. 'host.' (and 'host%2e', which the URL parser decodes to it)
 * is the same host: compared with the dot, it passed every "another host"
 * test in the refusers below while the request still went to the base.
 */
function _hostOf(url) {
    try {
        return new URL(url).hostname.toLowerCase().replace(/[.]+$/, '');
    }
    catch {
        return undefined;
    }
}
/**
 * The base this runtime's fetch resolves a relative URL against: the
 * document's base URL in a page, the location in a worker (its origin, when
 * that is all it carries), none elsewhere (Node's fetch refuses a relative
 * URL). Only an http(s) base counts. The transports resolve every
 * destination against the same base (http-client _transportBase).
 */
function _transportBase() {
    const g = globalThis;
    const candidates = [g.document ? g.document.baseURI : undefined, g.location ? g.location.href : undefined, g.location ? g.location.origin : undefined];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && /^https?:/i.test(candidate))
            return candidate;
    }
    return undefined;
}
/**
 * url resolved the way the transport's fetch resolves it, or undefined when
 * it does not resolve. A spelling the URL parser rewrites (HTTPS://, //host, a
 * backslash for a slash, a tab inside the scheme) is judged by where it goes.
 */
function _resolveTransportUrl(url) {
    try {
        const base = _transportBase();
        return base === undefined ? new URL(url) : new URL(url, base);
    }
    catch {
        return undefined;
    }
}
/**
 * True when url is relative and stays on the origin of whatever base it is
 * resolved against: resolved against two unrelated bases, one per scheme, it
 * keeps each base's host. An absolute URL, a scheme-relative one, and every
 * spelling the URL parser turns into one, takes a host of its own.
 */
function _isOriginRelative(url) {
    try {
        return new URL(url, 'https://a.invalid/').host === 'a.invalid'
            && new URL(url, 'http://b.invalid/').host === 'b.invalid';
    }
    catch {
        return false;
    }
}
/**
 * The account base URL a client actually sends to. An omitted or relative
 * base is resolved where the browser transport resolves it, against the page:
 * an omitted base is the page's origin. Realm URLs, route tags and the API
 * credential scope are all built from this, so a same-origin client applies a
 * realm on the page's host; built from the empty string they had no host, and
 * a requested realm was silently dropped. Without a page, or when it does not
 * resolve, the base is returned as given.
 */
function _effectiveBaseURL(baseURL) {
    if (/^https?:[/][/]/i.test(baseURL) || _transportBase() === undefined)
        return baseURL;
    const origin = globalThis.location?.origin;
    const resolved = baseURL === ''
        ? (typeof origin === 'string' && /^https?:/i.test(origin) ? _resolveTransportUrl(origin) : undefined)
        : _resolveTransportUrl(baseURL);
    if (!resolved || (resolved.protocol !== 'http:' && resolved.protocol !== 'https:'))
        return baseURL;
    return baseURL === '' ? resolved.origin : resolved.href;
}
/**
 * Whether url is inside the API's credential scope: the same scheme and port
 * as the account base URL, its host or a subdomain of it (a realm host), and
 * a path under its base path. Account credentials go nowhere else.
 *
 * Both are resolved as the transport resolves them (_resolveTransportUrl), an
 * omitted base being the page's origin. When neither resolves (no page, and a
 * base with no origin of its own), only a request URL that provably stays on
 * whatever origin the base resolves to (_isOriginRelative) is in scope. Any
 * other URL whose scope cannot be established is out: a backslash spelling
 * of //elsewhere used to pass as relative and took the login body with it.
 */
function _inApiCredentialScope(url, accountBaseURL) {
    const target = _resolveTransportUrl(url);
    const base = _resolveTransportUrl(accountBaseURL === '' ? '/' : accountBaseURL);
    if (target === undefined || base === undefined) {
        return target === undefined && base === undefined && _isOriginRelative(url);
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:')
        return false;
    if (target.protocol !== base.protocol || target.port !== base.port)
        return false;
    const host = target.hostname.toLowerCase();
    const baseHost = base.hostname.toLowerCase();
    if (host !== baseHost && !host.endsWith('.' + baseHost))
        return false;
    const basePath = base.pathname.replace(/[/]+$/, '');
    return basePath === '' || target.pathname === basePath || target.pathname.startsWith(basePath + '/');
}
/**
 * The account base URL with its host replaced by realmHost, the rest of the
 * caller's string (scheme, port, path, trailing slash) kept byte for byte.
 */
function _withRealmHost(accountBaseURL, realmHost) {
    const host = _hostOf(accountBaseURL);
    if (!host)
        return accountBaseURL;
    const at = accountBaseURL.toLowerCase().indexOf(host);
    if (at < 0)
        return accountBaseURL;
    return accountBaseURL.slice(0, at) + realmHost + accountBaseURL.slice(at + host.length);
}
/** HttpClient request methods whose first argument is the path. */
const _PATH_FIRST_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'mkcol', 'copy', 'move', 'lock', 'unlock', 'propfind', 'proppatch', 'checkauth', 'logout', 'prepareUpgrade']);
/** HttpClient request methods whose first argument is the method and second the path. */
const _METHOD_FIRST_METHODS = new Set(['request', 'stream', 'streamEvents']);
/**
 * client.http: the transport as the caller sees it. getBaseURL() returns the
 * base URL requests effectively go to (the realm host for a realm-scoped
 * account client), so getFetch()(getBaseURL() + path) stays in the realm.
 * Every other member is the transport's own, bound to the transport, so
 * getFetch() returns the identical fetch function and a method called with an
 * explicit receiver (accessor.call(client.http)) still works.
 *
 * refuse(path), when given, runs before every request method and throws when
 * the request cannot be sent as configured (a realm on a host that cannot
 * carry one); the method then rejects (streamEvents: its iterator throws)
 * with that error, the same ValidationError a generated method rejects with.
 */
function _configuredBaseView(transport, effectiveBaseURL, refuse) {
    // One function per member, made once: http.request === http.request. It is
    // remade only if the member itself was replaced on the transport.
    const made = new Map();
    const getBaseURL = () => effectiveBaseURL;
    return new Proxy(transport, {
        get(target, prop) {
            if (prop === 'getBaseURL' && effectiveBaseURL !== undefined)
                return getBaseURL;
            const value = Reflect.get(target, prop, target);
            if (typeof value !== 'function' || prop === 'constructor')
                return value;
            const known = made.get(prop);
            if (known && known.source === value)
                return known.wrapped;
            const wrapped = wrapMember(target, prop, value);
            made.set(prop, { source: value, wrapped });
            return wrapped;
        },
        set(target, prop, value) {
            return Reflect.set(target, prop, value, target);
        },
    });
    function wrapMember(target, prop, value) {
        const pathIndex = typeof prop !== 'string' ? -1
            : _PATH_FIRST_METHODS.has(prop) ? 0
                : _METHOD_FIRST_METHODS.has(prop) ? 1
                    : -1;
        if (!refuse || pathIndex < 0)
            return value.bind(target);
        return (...args) => {
            try {
                refuse(String(args[pathIndex]));
            }
            catch (error) {
                if (prop === 'streamEvents') {
                    return _refusedStream(error);
                }
                return Promise.reject(error);
            }
            return value.apply(target, args);
        };
    }
}
/**
 * Split a base URL whose host starts with a realm label
 * ({24hex}.api.example.com) into the account base URL and the realm it names.
 * Four labels at least, the same threshold hoody-api uses before it reads a
 * realm from the host. Any other URL is returned unchanged.
 */
function _splitRealmBaseURL(baseURL) {
    if (!baseURL)
        return { baseURL, realmId: undefined };
    try {
        const parsed = new URL(baseURL);
        const labels = parsed.hostname.split('.');
        const first = labels[0] || '';
        if (labels.length >= 4 && REALM_ID_PATTERN.test(first)) {
            const hostStart = baseURL.toLowerCase().indexOf(first.toLowerCase() + '.');
            if (hostStart >= 0) {
                // Cut the label out of the caller's own string, so the rest of it
                // (port, path, trailing slash) is kept byte for byte.
                return {
                    baseURL: baseURL.slice(0, hostStart) + baseURL.slice(hostStart + first.length + 1),
                    realmId: first.toLowerCase(),
                };
            }
        }
    }
    catch {
        // Not a parseable URL: nothing to split.
    }
    return { baseURL, realmId: undefined };
}
function _newSessionState(credentials) {
    return { credentials, refreshToken: undefined, loggedOut: false, generation: ++_sessionEpoch, members: new Set(), recovery: undefined };
}
/** Hands a parent's session to the client a derivation constructs, without a public config field. */
const _SESSION_HANDOFF = new WeakMap();
/**
 * Thrown by HoodyClient.login() when the account has two-factor
 * authentication on: the password was right, but no session exists until a
 * one-time code is verified. Call complete(code) to finish on the same client.
 * tempToken is valid for five minutes and is kept out of the error's
 * enumerable properties so that logging the error does not print it.
 */
export class TwoFactorRequiredError extends Error {
    code = 'TWO_FACTOR_REQUIRED';
    /** The second-factor method the server asked for (for example 'totp'). */
    method;
    constructor(client, tempToken, method) {
        super('Two-factor authentication required: call complete(code) with a code from the authenticator app or a backup code.');
        this.name = 'TwoFactorRequiredError';
        this.method = method;
        Object.defineProperty(this, 'tempToken', { value: tempToken, enumerable: false });
        Object.defineProperty(this, 'client', { value: client, enumerable: false });
    }
    /** Verify the code, adopt the session it returns, and resolve to the authenticated client. */
    async complete(code) {
        await this.client.completeTwoFactorLogin(this.tempToken, code);
        return this.client;
    }
}
/** True for the enriched realm-scope 403 the client raises. */
export function isRealmScopeError(error) {
    return isApiError(error) && error.code === 'REALM_SCOPE_ERROR';
}
/** A server name is interpolated into the kit host, so only one DNS label is one (as in lib/embeds/runtime.ts). */
function _isServerName(value) {
    return typeof value === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(value);
}
function _resolveContainerServer(container) {
    if (!container)
        return undefined;
    // server_name, else server: a string when hand-built, the server-details object ({ name, country, … })
    // on a containers.list item. Anything that is not a server name resolves to nothing and the caller
    // refuses the container.
    const given = container.server_name ?? container.server;
    const name = typeof given === 'object' && given !== null ? given.name : given;
    return _isServerName(name) ? name : undefined;
}
/** A routing field the caller supplied: any value but undefined. A supplied null is refused, never read as absent (see _assertGivenContainerRouting for the one server-field exception). */
function _containerFieldGiven(value) {
    return value !== undefined;
}
/**
 * withContainer() looks a container object up by id when it has a string id but lacks its
 * project_id or every server field. An object with both is used as given, with no request;
 * an object without an id is refused as before.
 */
function _containerNeedsLookup(container) {
    if (!container || typeof container !== 'object' || typeof container.id !== 'string' || container.id === '')
        return false;
    return !_containerFieldGiven(container.project_id)
        || !(_containerFieldGiven(container.server_name) || _containerFieldGiven(container.server));
}
/**
 * Every routing field the caller supplied must be usable before server_name / server are resolved
 * and before any request, each on its own: id and project_id a non-empty string, server_name a
 * server name, server a server name or a server-details object whose name is one. null is refused,
 * with one exception: a containers.list item carries `server_name: null` beside its server object, so a
 * null server_name (or server) is ignored when the OTHER server field is usable. Both null, or a null
 * beside an unusable other one, is refused.
 */
function _assertGivenContainerRouting(container) {
    if (_containerFieldGiven(container.id) && (typeof container.id !== 'string' || container.id === '')) {
        throw new ValidationError('Invalid container object: id must be a non-empty string', 'id');
    }
    if (_containerFieldGiven(container.project_id) && (typeof container.project_id !== 'string' || container.project_id === '')) {
        throw new ValidationError('Invalid container object: project_id must be a non-empty string', 'project_id');
    }
    const serverName = container.server_name;
    const server = container.server;
    const serverUsable = _isServerName(typeof server === 'object' && server !== null ? server.name : server);
    if (_containerFieldGiven(serverName) && !(serverName === null && serverUsable) && !_isServerName(serverName)) {
        throw new ValidationError('Invalid container object: server_name must be a server name', 'server_name');
    }
    if (_containerFieldGiven(server) && !(server === null && _isServerName(serverName)) && !serverUsable) {
        throw new ValidationError('Invalid container object: server must be a server name or an object with one', 'server');
    }
}
/**
 * The routing fields of a container looked up by id: the API's id, project_id and server
 * name. A project_id or server the caller also gave must equal the API's.
 */
function _containerFromLookup(given, found) {
    const record = (found && typeof found === 'object' ? found : {});
    const server = _resolveContainerServer(record);
    if (typeof record.id !== 'string' || record.id === '' || typeof record.project_id !== 'string' || record.project_id === '' || !server) {
        throw new Error('Invalid container object: the lookup of container ' + given.id + ' returned no id, project_id and server_name');
    }
    if (_containerFieldGiven(given.project_id) && given.project_id !== record.project_id) {
        throw new ValidationError('Invalid container object: project_id ' + String(given.project_id) + ' is not the project of container ' + given.id + ' (' + record.project_id + ')', 'project_id');
    }
    const givenServer = _resolveContainerServer(given);
    if (givenServer !== undefined && givenServer !== server) {
        throw new ValidationError('Invalid container object: server ' + givenServer + ' is not the server of container ' + given.id + ' (' + server + ')', 'server_name');
    }
    return { id: record.id, project_id: record.project_id, server_name: server };
}
export class HoodyClient {
    /**
     * The HTTP transport, for requests the generated services do not cover.
     * On a realm-scoped account client getBaseURL() returns the realm URL and
     * every request to the account host is moved to the realm host, so nothing
     * sent through it runs account-wide. getFetch() returns the fetch function
     * the client was given, unchanged: it is the raw transport, and a call made
     * with it directly runs no middleware and none of the SDK's realm or
     * credential policy; the URL and headers you give it are what is sent.
     */
    http;
    urlTemplates;
    realmId;
    kitAuth;
    onKitAuthExpired;
    /** Mutable only through setToken(), which moves this client to a session of its own. */
    session;
    /** The credentials this client was constructed with (derived clients have none of their own). */
    ownCredentials;
    /**
     * The transport itself. this.http is a view of it whose getBaseURL() is the
     * base URL the caller configured, realm included; this one holds the
     * account base URL the generated services build their URLs from.
     */
    transport;
    /**
     * The caller's own 401 hooks, never the session-bound wrappers installed on
     * the transport: derived clients inherit these, so a client that left the
     * session (setToken) does not keep recovering through its parent's session.
     */
    userOnTokenExpired;
    userRefreshToken;
    /**
     * The last recovery result handed to this client's transport, with the
     * generation it belongs to. The transport asks acceptRefreshedToken() right
     * before installing a token, and only this token, still current, passes.
     */
    recoveryCommit;
    autoRefresh = true;
    realmErrorIntrospection;
    /** What baseURL points at; see HoodyClientConfig.target. */
    target;
    /**
     * The caller's base URL (an account base with any realm label split off),
     * before an omitted base is resolved against the page (_effectiveBaseURL).
     * The kit domain is derived from it, and derived clients are built from it,
     * so the kit URLs of a same-origin browser client keep the default
     * containers domain they always had; only realm routing and credential
     * scope use the page.
     */
    callerBaseURL;
    /** Allowed realms per access token, filled only by the opt-in realm-error introspection. */
    realmIntrospectionCache;
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
    egress;
    run;
    proxyLogs;
    agent;
    bot;
    constructor(config) {
        // A session handed over by withRealm()/withContainer() is SHARED, not
        // copied: see _HoodySessionState.
        this.ownCredentials = config.credentials ? config.credentials : undefined;
        this.session = _SESSION_HANDOFF.get(config) ?? _newSessionState(this.ownCredentials);
        this.autoRefresh = config.autoRefresh !== false;
        this.realmErrorIntrospection = config.realmErrorIntrospection === true;
        this.urlTemplates = _withServerNameAlias(config.urlTemplates);
        this.target = _resolveClientTarget(config);
        // An account client's HTTP client holds the ACCOUNT base URL; the realm is
        // kept apart. A realm-host baseURL ({realmId}.api.example) is split here,
        // so withRealm('all') can clear the realm it named and switching realms
        // keeps the bearer: credential scope is the account origin plus its realm
        // subdomains. The realm still reaches every request: the services build
        // realm URLs themselves, and a request made on client.http directly gets
        // the realm host from the realm-host middleware below. A direct-kit URL is
        // never rewritten.
        // An omitted or relative base is resolved against the page first
        // (_effectiveBaseURL): that is where the browser transport sends, and the
        // realm URLs, route tags and credential scope below need its host.
        const splitBase = this.target === 'account'
            ? _splitRealmBaseURL(_effectiveBaseURL(config.baseURL || ''))
            : { baseURL: config.baseURL || '', realmId: undefined };
        this.callerBaseURL = this.target === 'account'
            ? _splitRealmBaseURL(config.baseURL || '').baseURL
            : config.baseURL || '';
        this.realmId = config.realmId !== undefined
            ? _normalizeRealmSelector(config.realmId, 'realmId')
            : splitBase.realmId;
        this.kitAuth = config.kitAuth;
        this.onKitAuthExpired = config.onKitAuthExpired;
        this.userOnTokenExpired = config.onTokenExpired;
        this.userRefreshToken = config.refreshToken;
        // Setup request error/auth handlers
        const configWithRetry = {
            ...config,
            baseURL: splitBase.baseURL,
            onError: async (error) => {
                // Enrich a realm-scope 403 in place first, so the caller (and the
                // caller's own onError) receive the same ApiError with the realm
                // details on it. Never throws: HttpClient logs and discards anything
                // thrown here and rethrows the original error.
                await this.enrichRealmScopeError(error);
                if (config.onError && await config.onError(error)) {
                    return true;
                }
                return false;
            },
            // The whole 401 recovery, the caller's refreshToken() included, runs in
            // recoverSession(): one flight per session and generation. The
            // transport's own refreshToken fallback is therefore not given the
            // caller's callback (it is removed below).
            onTokenExpired: (error) => this.recoverSession(error),
            acceptRefreshedToken: (token) => this.acceptRefreshedToken(token),
        };
        delete configWithRetry.refreshToken;
        if (config.kitAuth || config.onKitAuthExpired) {
            const proxyAuthMiddleware = createProxyAuthMiddleware(() => this.kitAuth, // getter — always reads current value
            this.callerBaseURL);
            // Exactly ONE kit-auth middleware per client. A derived client
            // (withContainer / withRealm) inherits the parent's middlewares, which
            // include the parent's kit-auth middleware; it read the PARENT's kitAuth
            // and ran after this one, so a credential refreshed on the child was
            // overwritten by the parent's stale one.
            const inherited = (config.middlewares || []).filter(m => !m._proxyAuthMiddleware);
            configWithRetry.middlewares = [proxyAuthMiddleware, ...inherited];
        }
        // Request-local bearer for the auth-refresh call (see handleAuthRefresh).
        // The refresh route verifies the REFRESH token as the bearer, which the
        // client's own token is not; mutating the shared token instead would hand
        // the refresh token to every other request in flight and to any client
        // cloned during the call. Middleware runs AFTER buildHeaders, so this is
        // the only seam that can override Authorization for one request. It is
        // tagged so a clone does not accumulate a second copy, and it is inert
        // unless that request carries the key. The key is nested under a name the
        // shared redactor already treats as a secret, so a middleware that logs
        // its context does not print the token.
        // Middlewares a derived client inherits from its parent may include the
        // tail steps rounds before this one installed as middlewares; they are
        // finalizers now (below) and never copied, but drop any such copy.
        configWithRetry.middlewares = (configWithRetry.middlewares || []).filter(m => !m._refreshBearerMiddleware
            && !m._realmHostMiddleware);
        // Realm scope and the refresh credential are FINALIZERS: the transport
        // runs them after every middleware, including any added later through
        // http.use() or http.setMiddlewares(), which cannot remove or reorder
        // them; credential confinement runs after each. One set per client: a
        // derived client installs its own.
        //
        // Realm scope, for a client with a realm. A request that ends up on the
        // account host itself is moved to a realm host unless the generated
        // service that sent it chose the account host (see _RouteDecision):
        //  - a service call goes to the host its service chose whenever it ends
        //    up anywhere inside the API (the account host or any subdomain of
        //    it): a middleware that strips its realm, or swaps it for a sibling
        //    realm, is overruled. This runs on EVERY client, with or without a
        //    realm of its own, so a per-call _realm holds on an account-wide
        //    client too. A destination outside the API is the caller's explicit
        //    routing and is left alone (confinement strips inherited credentials);
        //  - any other request (client.http used directly, as hoody-bot does)
        //    that ends on the account host goes to this client's realm host, if
        //    it has one.
        // A host that cannot carry a realm (localhost, an IP, a two-label host)
        // is refused, as the generated methods refuse it.
        const accountHost = _hostOf(splitBase.baseURL);
        const clientRealm = this.target === 'account' ? this.realmId : undefined;
        const realmHost = clientRealm ? _realmHostOf(splitBase.baseURL, clientRealm) : undefined;
        // API scope is _inApiCredentialScope's: the account origin's scheme and
        // port, its host or any subdomain of it. A kit-target client (a kit URL
        // used directly) has no API scope and is never rerouted here.
        const apiBaseURL = splitBase.baseURL;
        const realmScope = (context, routeTag) => {
            const decision = _routeDecision(routeTag, this);
            // Where the transport will send it, whatever the spelling. A URL that
            // does not resolve cannot be sent either (and carries no credential:
            // the transport's confinement gives it no scope).
            const destination = _resolveTransportUrl(context.url);
            if (!destination)
                return context;
            const host = destination.hostname.toLowerCase().replace(/[.]+$/, '');
            if (decision && this.target === 'account' && accountHost
                && (decision.host === accountHost || decision.host.endsWith('.' + accountHost))) {
                // Outside the API: the caller's own routing, left alone.
                if (host === decision.host || !_inApiCredentialScope(context.url, apiBaseURL))
                    return context;
                destination.hostname = decision.host;
                return { ...context, url: destination.toString() };
            }
            if (!clientRealm || host !== accountHost)
                return context;
            const scopedHost = realmHost && realmHost.realmHost;
            if (!scopedHost) {
                throw new ValidationError('Realm routing needs an API host with at least three labels (api.example.com); ' + accountHost
                    + ' cannot carry realm ' + clientRealm + ', so the request would run unscoped.', '_realm');
            }
            destination.hostname = scopedHost;
            return { ...context, url: destination.toString() };
        };
        // Refresh credential, last. The refresh route verifies the REFRESH token
        // as the bearer, which the client's own token is not; mutating the shared
        // token instead would hand the refresh token to every other request in
        // flight and to any client cloned during the call, so it is carried on
        // the one request (middlewareContext.hoodyAuth, a name the shared redactor
        // treats as a secret) and set here, after buildHeaders and every
        // middleware. A request carrying it, or any credential-bearing auth call
        // a service sent (_isCredentialAuthCall), is REFUSED unless it is still
        // inside the API's credential scope: withholding the header alone would
        // still post the credential in the body to wherever a middleware pointed
        // the request. The scope is the account host and EVERY subdomain of it,
        // not only realm labels: the deployment owns the whole *.api.hoody.<tld>
        // zone, and this check trusts it.
        const accountBaseURL = splitBase.baseURL;
        const refreshCredential = (context, routeTag) => {
            const carried = context.middlewareContext;
            const bearer = carried && carried.hoodyAuth ? carried.hoodyAuth.refreshToken : undefined;
            const hasBearer = typeof bearer === 'string' && bearer.length > 0;
            const decision = _routeDecision(routeTag, this);
            if ((hasBearer || (decision && decision.credential)) && !_inApiCredentialScope(context.url, accountBaseURL)) {
                let where = context.url;
                try {
                    where = new URL(context.url).origin;
                }
                catch { /* keep the raw string */ }
                throw new ValidationError('Refused to send an auth credential outside the API (' + where + '): a request middleware moved '
                    + context.method + ' ' + context.path + ' off ' + (accountHost || 'the API origin') + '.', 'url');
            }
            if (hasBearer) {
                return { ...context, headers: { ...context.headers, Authorization: 'Bearer ' + bearer } };
            }
            return context;
        };
        configWithRetry.finalizers = [realmScope, refreshCredential];
        // Wrap onKitAuthExpired to auto-update this.kitAuth from callback return
        // value. A logout (or any session change) while the callback was awaiting
        // wins: its result is neither stored nor used, and the kit request fails
        // with its 401, so logout() cannot be undone by a late kit credential.
        if (config.onKitAuthExpired) {
            const userCallback = config.onKitAuthExpired;
            configWithRetry.onKitAuthExpired = async (ns, error) => {
                if (this.session.loggedOut)
                    return undefined;
                const generation = this.session.generation;
                const newAuth = await userCallback(ns, error);
                if (!this.isCurrentSession(generation))
                    return undefined;
                if (newAuth)
                    this.kitAuth = newAuth;
                return newAuth;
            };
        }
        this.transport = new HttpClient(configWithRetry);
        // A realm on a host that cannot carry one: client.http refuses every
        // request bound for that host up front, with the ValidationError the
        // generated methods throw (the realm-scope step above also refuses it, as
        // the last line, but an error thrown by a middleware reaches the caller
        // wrapped in an ApiError).
        // A realm client with no API host at all (no baseURL, and no page to
        // resolve one against) is refused the same way: its requests would go
        // wherever the relative path lands, without the realm.
        // A kit-target client with a realm (an absolute base that is not a Hoody
        // API host, such as 'https://app.example.com/proxy'): the generated
        // services apply the realm to their own URLs, but client.http has no
        // realm host and sent the bearer to the base unscoped, while the relative
        // spelling '/proxy' applied the realm. A raw request bound for the base
        // host is refused instead, unless that host already carries the realm
        // (its first label is the realm id: '{realmId}.api.example.com', which is
        // how hoody-bot builds its client).
        const kitRealm = this.target !== 'account' ? this.realmId : undefined;
        const kitBaseHost = kitRealm ? _hostOf(splitBase.baseURL) : undefined;
        const kitBaseLabels = kitBaseHost ? kitBaseHost.split('.') : [];
        const kitBaseCarriesRealm = kitBaseLabels.length > 1 && kitBaseLabels[0] === kitRealm;
        const refuseKitRealm = kitRealm && !kitBaseCarriesRealm
            ? (path) => {
                if (/^https?:[/][/]/i.test(path) && kitBaseHost && _hostOf(path) !== kitBaseHost)
                    return;
                throw new ValidationError('Realm ' + kitRealm + ' cannot be applied to a request on client.http: this client treats '
                    + (splitBase.baseURL ? '"' + splitBase.baseURL + '"' : 'its base URL')
                    + " as a kit or daemon reached directly (target 'kit'), so the request would run unscoped. "
                    + "Drop the realm, or pass target: 'account' if this is an account API; its realm hosts "
                    + '({realmId}.<host>) must then be served.', '_realm');
            }
            : undefined;
        const refuseUnscoped = refuseKitRealm || (clientRealm && !realmHost
            ? (path) => {
                const absolute = /^https?:[/][/]/i.test(path);
                if (absolute && accountHost && _hostOf(path) !== accountHost)
                    return;
                if (absolute && !accountHost)
                    return;
                throw new ValidationError(accountHost
                    ? 'Realm routing needs an API host with at least three labels (api.example.com); ' + accountHost
                        + ' cannot carry realm ' + clientRealm + ', so the request would run unscoped.'
                    : 'Realm routing needs an absolute API base URL (baseURL, or the page the client runs on); '
                        + (splitBase.baseURL ? '"' + splitBase.baseURL + '" does not resolve to one' : 'this client has none')
                        + ', so realm ' + clientRealm + ' cannot be applied and the request would run unscoped.', '_realm');
            }
            : undefined);
        this.http = _configuredBaseView(this.transport, realmHost ? _withRealmHost(splitBase.baseURL, realmHost.realmHost) : undefined, refuseUnscoped);
        this.joinSession();
        // Guarded views of the transport for the generated services: kit services
        // refuse to send a kit path to the account API host, account services
        // refuse a realm host they could not scope (see the two guards below).
        const apiHttp = this.guardAccountHttp();
        const kitHttp = (namespace) => this.guardKitHttp(namespace);
        this.api = {
            activity: new api.ActivityService(apiHttp, 'api', this.realmId),
            ai: new api.AiService(apiHttp, 'api', this.realmId),
            auth: Object.assign(new api.AuthService(apiHttp, 'api', this.realmId), {
                device: new api.AuthDeviceService(apiHttp, 'api', this.realmId),
                oauth: new api.AuthOauthService(apiHttp, 'api', this.realmId),
                tokens: new api.AuthTokensService(apiHttp, 'api', this.realmId),
                twoFactor: new api.AuthTwoFactorService(apiHttp, 'api', this.realmId),
            }),
            containers: Object.assign(new api.ContainersService(apiHttp, 'api', this.realmId), {
                env: new api.ContainersEnvService(apiHttp, 'api', this.realmId),
            }),
            events: new api.EventsService(apiHttp, 'api', this.realmId),
            firewall: new api.FirewallService(apiHttp, 'api', this.realmId),
            images: new api.ImagesService(apiHttp, 'api', this.realmId),
            inbox: new api.InboxService(apiHttp, 'api', this.realmId),
            ip: new api.IpService(apiHttp, 'api', this.realmId),
            meta: new api.MetaService(apiHttp, 'api', this.realmId),
            network: new api.NetworkService(apiHttp, 'api', this.realmId),
            pools: Object.assign(new api.PoolsService(apiHttp, 'api', this.realmId), {
                invitations: new api.PoolsInvitationsService(apiHttp, 'api', this.realmId),
                members: new api.PoolsMembersService(apiHttp, 'api', this.realmId),
            }),
            projects: new api.ProjectsService(apiHttp, 'api', this.realmId),
            proxy: {
                aliases: new api.ProxyAliasesService(apiHttp, 'api', this.realmId),
                containerPermissions: new api.ProxyContainerPermissionsService(apiHttp, 'api', this.realmId),
                groups: new api.ProxyGroupsService(apiHttp, 'api', this.realmId),
                hooks: new api.ProxyHooksService(apiHttp, 'api', this.realmId),
                projectPermissions: new api.ProxyProjectPermissionsService(apiHttp, 'api', this.realmId),
                services: new api.ProxyServicesService(apiHttp, 'api', this.realmId),
                settings: new api.ProxySettingsService(apiHttp, 'api', this.realmId),
            },
            realms: new api.RealmsService(apiHttp, 'api', this.realmId),
            servers: Object.assign(new api.ServersService(apiHttp, 'api', this.realmId), {
                commands: new api.ServersCommandsService(apiHttp, 'api', this.realmId),
                jobs: new api.ServersJobsService(apiHttp, 'api', this.realmId),
                offers: new api.ServersOffersService(apiHttp, 'api', this.realmId),
                plans: new api.ServersPlansService(apiHttp, 'api', this.realmId),
                reservations: new api.ServersReservationsService(apiHttp, 'api', this.realmId),
                subscriptions: new api.ServersSubscriptionsService(apiHttp, 'api', this.realmId),
            }),
            snapshots: new api.SnapshotsService(apiHttp, 'api', this.realmId),
            storage: {
                shares: new api.StorageSharesService(apiHttp, 'api', this.realmId),
            },
            users: new api.UsersService(apiHttp, 'api', this.realmId),
            vault: new api.VaultService(apiHttp, 'api', this.realmId),
            wallet: new api.WalletService(apiHttp, 'api', this.realmId),
        };
        this.browser = {
            cookies: new browser.CookiesService(kitHttp('browser'), 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            history: new browser.HistoryService(kitHttp('browser'), 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            instances: new browser.InstancesService(kitHttp('browser'), 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            kit: new browser.KitService(kitHttp('browser'), 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            logs: new browser.LogsService(kitHttp('browser'), 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            page: new browser.PageService(kitHttp('browser'), 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            tabs: new browser.TabsService(kitHttp('browser'), 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
            viewport: new browser.ViewportService(kitHttp('browser'), 'browser', this.urlTemplates?.['browser'], this.getKitUrlTemplatePattern('browser')),
        };
        this.code = {
            extensions: new code.ExtensionsService(kitHttp('code'), 'code', this.urlTemplates?.['code'], this.getKitUrlTemplatePattern('code')),
            kit: new code.KitService(kitHttp('code'), 'code', this.urlTemplates?.['code'], this.getKitUrlTemplatePattern('code')),
            ui: new code.UiService(kitHttp('code'), 'code', this.urlTemplates?.['code'], this.getKitUrlTemplatePattern('code')),
        };
        this.curl = Object.assign(new curl.CurlService(kitHttp('curl'), 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')), {
            channel: new curl.ChannelService(kitHttp('curl'), 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            jobs: new curl.JobsService(kitHttp('curl'), 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            kit: new curl.KitService(kitHttp('curl'), 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            schedules: new curl.SchedulesService(kitHttp('curl'), 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            sessions: new curl.SessionsService(kitHttp('curl'), 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
            storage: new curl.StorageService(kitHttp('curl'), 'curl', this.urlTemplates?.['curl'], this.getKitUrlTemplatePattern('curl')),
        });
        this.daemon = {
            ephemeralPrograms: new daemon.EphemeralProgramsService(kitHttp('daemon'), 'daemon', this.urlTemplates?.['daemon'], this.getKitUrlTemplatePattern('daemon')),
            kit: new daemon.KitService(kitHttp('daemon'), 'daemon', this.urlTemplates?.['daemon'], this.getKitUrlTemplatePattern('daemon')),
            programs: new daemon.ProgramsService(kitHttp('daemon'), 'daemon', this.urlTemplates?.['daemon'], this.getKitUrlTemplatePattern('daemon')),
        };
        this.display = Object.assign(new display.DisplayService(kitHttp('display'), 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')), {
            clipboard: new display.ClipboardService(kitHttp('display'), 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            input: new display.InputService(kitHttp('display'), 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            keyboard: new display.KeyboardService(kitHttp('display'), 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            kit: new display.KitService(kitHttp('display'), 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            mouse: new display.MouseService(kitHttp('display'), 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            screenshots: new display.ScreenshotsService(kitHttp('display'), 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            thumbnails: new display.ThumbnailsService(kitHttp('display'), 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            ui: new display.UiService(kitHttp('display'), 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
            windows: new display.WindowsService(kitHttp('display'), 'display', this.urlTemplates?.['display'], this.getKitUrlTemplatePattern('display')),
        });
        this.exec = Object.assign(new exec.ExecService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')), {
            cache: new exec.CacheService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            kit: new exec.KitService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            logs: new exec.LogsService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            magicComments: new exec.MagicCommentsService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            modules: new exec.ModulesService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            namespaces: new exec.NamespacesService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            openapi: new exec.OpenapiService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            packages: new exec.PackagesService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            routes: new exec.RoutesService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            schedules: new exec.SchedulesService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            scripts: new exec.ScriptsService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            sdks: new exec.SdksService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            store: new exec.StoreService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
            templates: new exec.TemplatesService(kitHttp('exec'), 'exec', this.urlTemplates?.['exec'], this.getKitUrlTemplatePattern('exec')),
        });
        this.files = Object.assign(new files.FilesService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')), {
            archives: new files.ArchivesService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            backends: new files.BackendsService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            downloads: new files.DownloadsService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            extractions: new files.ExtractionsService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            ftp: new files.FtpService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            images: new files.ImagesService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            journal: new files.JournalService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            kit: new files.KitService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            mounts: new files.MountsService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            s3: new files.S3Service(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            ssh: new files.SshService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            ui: new files.UiService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            uploads: new files.UploadsService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
            webdav: new files.WebdavService(kitHttp('files'), 'files', this.urlTemplates?.['files'], this.getKitUrlTemplatePattern('files')),
        });
        this.notifications = Object.assign(new notifications.NotificationsService(kitHttp('notifications'), 'notifications', this.urlTemplates?.['notifications'], this.getKitUrlTemplatePattern('notifications')), {
            icons: new notifications.IconsService(kitHttp('notifications'), 'notifications', this.urlTemplates?.['notifications'], this.getKitUrlTemplatePattern('notifications')),
            kit: new notifications.KitService(kitHttp('notifications'), 'notifications', this.urlTemplates?.['notifications'], this.getKitUrlTemplatePattern('notifications')),
        });
        this.sqlite = {
            databases: new sqlite.DatabasesService(kitHttp('sqlite'), 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
            history: new sqlite.HistoryService(kitHttp('sqlite'), 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
            kit: new sqlite.KitService(kitHttp('sqlite'), 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
            kv: new sqlite.KvService(kitHttp('sqlite'), 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
            sql: new sqlite.SqlService(kitHttp('sqlite'), 'sqlite', this.urlTemplates?.['sqlite'], this.getKitUrlTemplatePattern('sqlite')),
        };
        this.terminal = {
            automation: new terminal.AutomationService(kitHttp('terminal'), 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            commands: new terminal.CommandsService(kitHttp('terminal'), 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            drops: new terminal.DropsService(kitHttp('terminal'), 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            keys: new terminal.KeysService(kitHttp('terminal'), 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            kit: new terminal.KitService(kitHttp('terminal'), 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            processes: new terminal.ProcessesService(kitHttp('terminal'), 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            sessions: new terminal.SessionsService(kitHttp('terminal'), 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            system: new terminal.SystemService(kitHttp('terminal'), 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
            ui: new terminal.UiService(kitHttp('terminal'), 'terminal', this.urlTemplates?.['terminal'], this.getKitUrlTemplatePattern('terminal')),
        };
        this.watch = {
            events: new watch.EventsService(kitHttp('watch'), 'watch', this.urlTemplates?.['watch'], this.getKitUrlTemplatePattern('watch')),
            kit: new watch.KitService(kitHttp('watch'), 'watch', this.urlTemplates?.['watch'], this.getKitUrlTemplatePattern('watch')),
            watchers: new watch.WatchersService(kitHttp('watch'), 'watch', this.urlTemplates?.['watch'], this.getKitUrlTemplatePattern('watch')),
        };
        this.cron = {
            crontabs: new cron.CrontabsService(kitHttp('cron'), 'cron', this.urlTemplates?.['cron'], this.getKitUrlTemplatePattern('cron')),
            entries: new cron.EntriesService(kitHttp('cron'), 'cron', this.urlTemplates?.['cron'], this.getKitUrlTemplatePattern('cron')),
            kit: new cron.KitService(kitHttp('cron'), 'cron', this.urlTemplates?.['cron'], this.getKitUrlTemplatePattern('cron')),
        };
        this.pipe = Object.assign(new pipe.PipeService(kitHttp('pipe'), 'pipe', this.urlTemplates?.['pipe'], this.getKitUrlTemplatePattern('pipe')), {
            kit: new pipe.KitService(kitHttp('pipe'), 'pipe', this.urlTemplates?.['pipe'], this.getKitUrlTemplatePattern('pipe')),
            ui: new pipe.UiService(kitHttp('pipe'), 'pipe', this.urlTemplates?.['pipe'], this.getKitUrlTemplatePattern('pipe')),
        });
        this.notes = Object.assign(new notes.NotesService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')), {
            avatars: new notes.AvatarsService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            collaborators: new notes.CollaboratorsService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            comments: new notes.CommentsService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            document: new notes.DocumentService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            files: Object.assign(new notes.FilesService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')), {
                uploads: new notes.FilesUploadsService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            }),
            kit: new notes.KitService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            members: new notes.MembersService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            mutations: new notes.MutationsService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            nodes: new notes.NodesService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            notebooks: new notes.NotebooksService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            reactions: new notes.ReactionsService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            records: new notes.RecordsService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            sockets: new notes.SocketsService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
            versions: new notes.VersionsService(kitHttp('notes'), 'notes', this.urlTemplates?.['notes'], this.getKitUrlTemplatePattern('notes')),
        });
        this.tunnel = Object.assign(new tunnel.TunnelService(kitHttp('tunnel'), 'tunnel', this.urlTemplates?.['tunnel'], this.getKitUrlTemplatePattern('tunnel')), {
            bindings: new tunnel.BindingsService(kitHttp('tunnel'), 'tunnel', this.urlTemplates?.['tunnel'], this.getKitUrlTemplatePattern('tunnel')),
            kit: new tunnel.KitService(kitHttp('tunnel'), 'tunnel', this.urlTemplates?.['tunnel'], this.getKitUrlTemplatePattern('tunnel')),
            sessions: new tunnel.SessionsService(kitHttp('tunnel'), 'tunnel', this.urlTemplates?.['tunnel'], this.getKitUrlTemplatePattern('tunnel')),
        });
        this.egress = {
            kit: new egress.KitService(kitHttp('egress'), 'egress', this.urlTemplates?.['egress'], this.getKitUrlTemplatePattern('egress')),
            upstream: new egress.UpstreamService(kitHttp('egress'), 'egress', this.urlTemplates?.['egress'], this.getKitUrlTemplatePattern('egress')),
        };
        this.run = Object.assign(new run.RunService(kitHttp('run'), 'run', this.urlTemplates?.['run'], this.getKitUrlTemplatePattern('run')), {
            config: new run.ConfigService(kitHttp('run'), 'run', this.urlTemplates?.['run'], this.getKitUrlTemplatePattern('run')),
            jobs: new run.JobsService(kitHttp('run'), 'run', this.urlTemplates?.['run'], this.getKitUrlTemplatePattern('run')),
            profiles: new run.ProfilesService(kitHttp('run'), 'run', this.urlTemplates?.['run'], this.getKitUrlTemplatePattern('run')),
            recipes: new run.RecipesService(kitHttp('run'), 'run', this.urlTemplates?.['run'], this.getKitUrlTemplatePattern('run')),
            sources: new run.SourcesService(kitHttp('run'), 'run', this.urlTemplates?.['run'], this.getKitUrlTemplatePattern('run')),
        });
        this.proxyLogs = new proxyLogs.ProxyLogsService(kitHttp('proxyLogs'), 'proxyLogs', this.urlTemplates?.['proxyLogs'], this.getKitUrlTemplatePattern('proxyLogs'));
        this.agent = Object.assign(new agent.AgentService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')), {
            acp: new agent.AcpService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            changes: new agent.ChangesService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            completions: new agent.CompletionsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            containers: new agent.ContainersService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            definitions: new agent.DefinitionsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            files: new agent.FilesService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            fusions: new agent.FusionsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            gates: new agent.GatesService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            github: new agent.GithubService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            headless: new agent.HeadlessService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            hooks: new agent.HooksService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            jev: new agent.JevService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            jobs: new agent.JobsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            kit: new agent.KitService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            logs: new agent.LogsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            loops: new agent.LoopsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            mcp: new agent.McpService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            memory: new agent.MemoryService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            models: new agent.ModelsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            platform: new agent.PlatformService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            providers: new agent.ProvidersService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            realms: new agent.RealmsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            sessions: Object.assign(new agent.SessionsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')), {
                turns: new agent.SessionsTurnsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            }),
            settings: new agent.SettingsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            skills: Object.assign(new agent.SkillsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')), {
                hub: new agent.SkillsHubService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            }),
            stats: new agent.StatsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            tasks: new agent.TasksService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            todos: new agent.TodosService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            tools: new agent.ToolsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            usage: new agent.UsageService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
            workflows: new agent.WorkflowsService(kitHttp('agent'), 'agent', this.urlTemplates?.['agent'], this.getKitUrlTemplatePattern('agent')),
        });
        this.bot = {
            kit: new bot.KitService(kitHttp('bot'), 'bot', this.urlTemplates?.['bot'], this.getKitUrlTemplatePattern('bot')),
            registrations: new bot.RegistrationsService(kitHttp('bot'), 'bot', this.urlTemplates?.['bot'], this.getKitUrlTemplatePattern('bot')),
        };
        this.installAuthLifecycleHooks();
    }
    /**
     * Set the access token of THIS client only. The client leaves the session
     * it shared with its parent and derived clients and starts one of its own:
     * nothing else changes token, a later refresh, adoption or logout of the
     * old session does not touch this client, and clients derived from this one
     * afterwards share the new session. The new session keeps the credentials
     * this client was constructed with (a derived client has none) and no
     * refresh token. A token recovery still in flight for this client is
     * discarded. To change the token of the whole session, use setSessionToken().
     */
    setToken(token) {
        const own = _newSessionState(this.ownCredentials);
        this.leaveSession();
        this.session = own;
        this.joinSession();
        this.resetTransportRefresh();
        this.transport.setToken(token);
    }
    /**
     * Set the access token of the whole session: this client, the client it was
     * derived from and every client derived from either send it from now on. A
     * non-empty token also ends a logged-out state (see logout()), and any token
     * recovery still in flight is discarded. The refresh token and stored
     * credentials are kept; to replace those too, use adoptSession().
     */
    setSessionToken(token) {
        this.bumpGeneration();
        if (token)
            this.session.loggedOut = false;
        this.applySessionToken(token);
    }
    /**
     * Start a new generation of the session (see _HoodySessionState.generation).
     * Generations are unique across sessions, so a recovery that compares one
     * also notices a client that moved to another session.
     */
    bumpGeneration() {
        const session = this.session;
        session.generation = ++_sessionEpoch;
        session.recovery = undefined;
        this.forEachMember((client) => client.resetTransportRefresh());
        return session.generation;
    }
    /**
     * HttpClient single-flights its own token refresh, so a 401 from the new
     * generation would otherwise join a recovery the old one started, and fail
     * with it. Forget that shared promise; the old recovery still settles, and
     * its result is discarded by its generation check.
     */
    resetTransportRefresh() {
        const transport = this.transport;
        if ('refreshTokenPromise' in transport)
            transport.refreshTokenPromise = null;
    }
    /** Every live client of the session, this one included. */
    forEachMember(visit) {
        const members = this.session.members;
        let sawSelf = false;
        members.forEach((ref) => {
            const client = ref.deref();
            if (!client) {
                members.delete(ref);
                return;
            }
            if (client === this)
                sawSelf = true;
            visit(client);
        });
        if (!sawSelf)
            visit(this);
    }
    /** Give every client of the session the same access token (no generation change). */
    applySessionToken(token) {
        this.forEachMember((client) => client.transport.setToken(token));
    }
    /** True while the session is the one a recovery started under, and not logged out. */
    isCurrentSession(generation) {
        return this.session.generation === generation && !this.session.loggedOut;
    }
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
    recoverSession(error) {
        const session = this.session;
        if (session.loggedOut)
            return Promise.resolve(undefined);
        const generation = session.generation;
        const running = session.recovery;
        let shared;
        if (running && running.generation === generation) {
            shared = running.promise;
        }
        else {
            shared = this.runRecovery(error, generation);
            const entry = { generation, promise: shared };
            session.recovery = entry;
            const clear = () => { if (session.recovery === entry)
                session.recovery = undefined; };
            shared.then(clear, clear);
        }
        return shared.then((token) => {
            if (!token || !this.isCurrentSession(generation))
                return undefined;
            this.recoveryCommit = { token, generation };
            return token;
        });
    }
    /** The recovery steps recoverSession() single-flights; see there. */
    async runRecovery(error, generation) {
        const userHook = this.userOnTokenExpired;
        if (typeof userHook === 'function') {
            const tokenFromUser = await userHook(error);
            if (!this.isCurrentSession(generation))
                return undefined;
            if (tokenFromUser) {
                this.applySessionToken(tokenFromUser);
                return tokenFromUser;
            }
        }
        const refreshed = await this.handleAuthRefresh(error, generation);
        if (refreshed || !this.isCurrentSession(generation))
            return refreshed;
        const userRefresh = this.userRefreshToken;
        if (typeof userRefresh === 'function') {
            const tokenFromRefresh = await userRefresh();
            if (!this.isCurrentSession(generation))
                return undefined;
            if (tokenFromRefresh) {
                this.applySessionToken(tokenFromRefresh);
                return tokenFromRefresh;
            }
        }
        return undefined;
    }
    /**
     * HttpClient acceptRefreshedToken: asked synchronously right before the
     * transport installs a recovered token and replays the request. Only the
     * token recoverSession() last handed this client passes, and only while its
     * generation is still current.
     */
    acceptRefreshedToken(token) {
        const commit = this.recoveryCommit;
        return !!commit && commit.token === token && this.isCurrentSession(commit.generation);
    }
    /**
     * Adopt a session that was issued outside login(): the result of
     * api.auth.twoFactor.verify(), api.auth.oauth.exchange() or
     * oauthDeviceToken(), or tokens saved from an earlier run. Pass the response
     * envelope or its data. The access token becomes this client's bearer and
     * the refresh token is kept for automatic refresh, shared with clients
     * derived from this one. Returns the access token.
     *
     * An api.auth.login() response is accepted as it comes. When it
     * answered with a two-factor challenge or an auth_intent_token there is no
     * session to adopt, and this throws a ValidationError naming the step that
     * finishes the login.
     */
    adoptSession(tokens) {
        const envelope = tokens;
        const carrier = (envelope && typeof envelope.data === 'object' && envelope.data !== null && typeof envelope.token !== 'string'
            ? envelope.data
            : envelope);
        const token = carrier && typeof carrier.token === 'string' ? carrier.token : '';
        if (!token && carrier && (carrier.requires_2fa === true || typeof carrier.temp_token === 'string')) {
            throw new ValidationError('adoptSession: this login answered with a two-factor challenge, not a session; finish it with completeTwoFactorLogin(data.temp_token, code)', 'token');
        }
        if (!token && carrier && typeof carrier.auth_intent_token === 'string') {
            throw new ValidationError('adoptSession: this login answered with an auth_intent_token (response_mode intent), not a session; redeem it with api.auth.oauth.authorize() and exchange(), then adopt the exchange result', 'token');
        }
        if (!token) {
            throw new ValidationError('adoptSession: no access token in the given session (expected token, or data.token)', 'token');
        }
        const refreshToken = carrier && typeof carrier.refreshToken === 'string' && carrier.refreshToken.length > 0
            ? carrier.refreshToken
            : undefined;
        // Replace the whole session at once. Nothing of the previous one may
        // survive: not its refresh token, and not its stored login credentials,
        // which automatic recovery would otherwise use to log back into the
        // previous account. The generation moves on, so a recovery still in
        // flight for the old session is discarded, and every client of the
        // session switches token at once.
        this.bumpGeneration();
        this.session.credentials = undefined;
        this.session.refreshToken = refreshToken;
        this.session.loggedOut = false;
        this.applySessionToken(token);
        return token;
    }
    /**
     * Finish a login that returned a two-factor challenge (data.temp_token):
     * verify the code with api.auth.twoFactor.verify() and adopt the session it returns.
     * Resolves to the new access token.
     */
    async completeTwoFactorLogin(tempToken, code) {
        const tfa = this.api && this.api.auth && this.api.auth.twoFactor;
        if (!tfa || typeof tfa.verify !== 'function') {
            throw new Error('Two-factor service not available');
        }
        const response = await tfa.verify({ temp_token: tempToken, code }, { authRetry: false });
        return this.adoptSession(response);
    }
    /**
     * Log out. hoody-api's logout revokes EVERY session of the account (all
     * devices, the CLI, other apps), not only this client's token. Afterwards
     * this client, and every client derived from it or from the same parent,
     * drops its access token, refresh token, stored credentials and kit
     * credential (kitAuth), and automatic re-authentication stays off until
     * login(), adoptSession(), setSessionToken() or setToken() starts a new
     * session. Local state is cleared even when the request fails; the failure
     * is then rethrown.
     *
     * kitAuth is cleared because it is sent on the session's behalf (it often
     * holds the account token itself); pass it again with withContainer() when
     * a kit still needs it. Streams and sockets already open are NOT closed:
     * they belong to the caller, who holds their AbortSignal or close(), and
     * the client keeps no registry of them. Close them when logging out. An
     * EventsClient reconnects with the current (now empty) token.
     */
    async logout() {
        const auth = this.api && this.api.auth;
        try {
            if (auth && typeof auth.logoutAll === 'function') {
                await auth.logoutAll();
            }
        }
        finally {
            this.clearSession();
        }
    }
    /** Drop every credential of the shared session and stop automatic recovery. */
    clearSession() {
        const session = this.session;
        session.credentials = undefined;
        session.refreshToken = undefined;
        session.loggedOut = true;
        this.bumpGeneration();
        this.forEachMember((client) => {
            client.http.setToken('');
            client.http.clearCache();
            client.kitAuth = undefined;
        });
    }
    /** Register this client with the shared session (weakly, so it can be collected). */
    joinSession() {
        const WeakRefCtor = globalThis.WeakRef;
        const members = this.session.members;
        if (members.size >= 64) {
            members.forEach((ref) => { if (!ref.deref())
                members.delete(ref); });
        }
        const self = this;
        members.add(WeakRefCtor ? new WeakRefCtor(self) : { deref: () => self });
    }
    /** Remove this client from its session's members (see setToken()). */
    leaveSession() {
        const members = this.session.members;
        members.forEach((ref) => {
            const client = ref.deref();
            if (!client || client === this)
                members.delete(ref);
        });
    }
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
    installAuthLifecycleHooks() {
        const auth = this.api && this.api.auth;
        if (!auth)
            return;
        if (typeof auth.refresh === 'function') {
            const originalRefresh = auth.refresh;
            auth.refresh = (data, options) => {
                const refreshBearer = data && typeof data.refreshToken === 'string' ? data.refreshToken : undefined;
                const middlewareContext = { ...((options && options.middlewareContext) || {}) };
                if (refreshBearer) {
                    const carried = middlewareContext.hoodyAuth;
                    middlewareContext.hoodyAuth = { ...(carried && typeof carried === 'object' ? carried : {}), refreshToken: refreshBearer };
                }
                return originalRefresh.call(auth, data, { ...(options || {}), authRetry: false, middlewareContext });
            };
        }
        if (typeof auth.logoutAll === 'function') {
            const originalLogout = auth.logoutAll;
            auth.logoutAll = async (...args) => {
                const result = await originalLogout.apply(auth, args);
                this.clearSession();
                return result;
            };
        }
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
        if (!current && this.session.credentials) {
            await this.login(this.session.credentials);
        }
        const token = this.http.config?.token;
        return token ? String(token) : undefined;
    }
    /**
     * Login with credentials.
     *
     * Returns the typed response shape (ApiAuthLoginResponse) instead
     * of `any` so consumers keep .data autocomplete and tokens narrowing. The
     * typed import comes from generated/types.ts; the @ts-ignore lines are kept
     * because the `api.auth` namespace is dynamic (its existence
     * depends on the OpenAPI spec at generation time).
     */
    async login(credentials) {
        // A login starts a new session: recovery in flight for the old one is
        // discarded, and the old refresh token is not carried into the new one.
        const generation = this.bumpGeneration();
        this.session.credentials = credentials;
        this.session.refreshToken = undefined;
        this.session.loggedOut = false;
        // @ts-ignore - Assuming api namespace exists and has authentication service
        if (this.api && this.api.auth) {
            // @ts-ignore
            const response = await this.api.auth.login(credentials);
            // A logout, adoption or newer login that landed meanwhile wins.
            if (this.isCurrentSession(generation))
                this.updateTokensFromAuthResponse(response);
            return response;
        }
        else {
            throw new Error('Authentication service not available');
        }
    }
    /**
     * login() for the static login() factory: a response without an access
     * token is not a login. A two-factor challenge becomes a
     * TwoFactorRequiredError that can finish on this client; anything else
     * tokenless (for example a PKCE intent response) is an ApiError.
     */
    async loginForSession(credentials) {
        const response = await this.login(credentials);
        const data = response?.data;
        if (data && typeof data.token === 'string' && data.token.length > 0)
            return;
        if (data && typeof data.temp_token === 'string' && data.temp_token.length > 0) {
            throw new TwoFactorRequiredError(this, data.temp_token, typeof data.method === 'string' ? data.method : undefined);
        }
        throw new ApiError({
            message: 'Login returned no access token',
            status: 200,
            code: 'NO_ACCESS_TOKEN',
            response: { message: response?.message },
        });
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
        // Same session (callers check its generation first), so no bump here.
        this.applySessionToken(token);
        if (typeof responseData.refreshToken === 'string' && responseData.refreshToken.length > 0) {
            this.session.refreshToken = responseData.refreshToken;
        }
        return token;
    }
    /**
     * Internal auth refresh flow for 401 responses.
     * Returns a fresh token when recovery succeeds.
     */
    async handleAuthRefresh(error, generation = this.session.generation) {
        if (!this.autoRefresh)
            return undefined;
        if (error?.status !== 401)
            return undefined;
        if (!this.isCurrentSession(generation))
            return undefined;
        // @ts-ignore - Assuming api namespace exists
        if (!this.api || !this.api.auth)
            return undefined;
        // Try refresh token first. The refresh route verifies the REFRESH token as
        // the bearer and requires the same value in the body, so sending the (just
        // rejected) access token makes every refresh fail with 401. The bearer is
        // carried on THIS request only, through the tagged middleware installed in
        // the constructor: the client's own token is never changed, so a request
        // issued while the refresh is in flight — or a client cloned during it —
        // keeps the token it already had.
        // authRetry: false keeps a 401 on the refresh call itself from
        // re-entering this recovery path. (No backticks in this comment: it sits
        // inside the template literal that emits the client, and a pair of them
        // terminates that literal — which is exactly what broke the 08:16 deploy.)
        // The public api.auth.refresh() does both itself (see
        // installAuthLifecycleHooks); they are repeated here so this path does
        // not depend on the hook having been installed.
        const refreshToken = this.session.refreshToken;
        if (refreshToken) {
            try {
                // @ts-ignore
                const refreshResponse = await this.api.auth.refresh({ refreshToken }, { authRetry: false, middlewareContext: { hoodyAuth: { refreshToken } } });
                // A logout or session replacement that landed while the refresh was
                // in flight wins.
                if (!this.isCurrentSession(generation))
                    return undefined;
                const refreshed = this.updateTokensFromAuthResponse(refreshResponse);
                if (refreshed) {
                    return refreshed;
                }
            }
            catch {
                // Refresh failed, fall back to credentials
            }
        }
        // Fall back to credentials login. Also authRetry: false: a 401 from the
        // login itself must surface, not wait on the refresh already running here.
        const credentials = this.session.credentials;
        if (credentials && this.isCurrentSession(generation)) {
            try {
                // @ts-ignore
                const loginResponse = await this.api.auth.login(credentials, { authRetry: false });
                if (!this.isCurrentSession(generation))
                    return undefined;
                return this.updateTokensFromAuthResponse(loginResponse);
            }
            catch {
                // Login failed
            }
        }
        return undefined;
    }
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
    async enrichRealmScopeError(error) {
        try {
            if (!error || error.status !== 403 || error.code === 'REALM_SCOPE_ERROR')
                return;
            const response = error.response && typeof error.response === 'object' ? error.response : undefined;
            const msg = String((response && response.message) || error.message || '');
            if (!msg.includes('requires a realm-scoped URL') && !msg.includes('not valid for realm'))
                return;
            const token = String(this.http.config?.token || '');
            let allowedRealms;
            const cached = this.realmIntrospectionCache;
            if (cached && cached.token === token) {
                allowedRealms = cached.realms;
            }
            else if (this.realmErrorIntrospection) {
                allowedRealms = await this.fetchAllowedRealms();
                if (allowedRealms)
                    this.realmIntrospectionCache = { token, realms: allowedRealms };
            }
            const hint = allowedRealms && allowedRealms.length > 0
                ? 'Valid realms for this token: [' + allowedRealms.join(', ') + "]. Use client.withRealm('" + allowedRealms[0] + "') to scope your client."
                : 'Call client.' + HoodyClient.REALM_DISCOVERY_METHOD + '() on a client without a realm to list the realms this token allows, then scope with client.withRealm(realmId).';
            error.code = 'REALM_SCOPE_ERROR';
            error.hint = hint;
            error.currentRealm = this.realmId;
            if (allowedRealms)
                error.allowedRealms = allowedRealms;
            error.message = msg + '. ' + hint;
        }
        catch {
            // Enrichment is advisory; the original error is still thrown.
        }
    }
    /** The accessor path the realm-scope hint names; a unit test resolves it against a real client. */
    static REALM_DISCOVERY_METHOD = 'api.auth.tokens.getCurrent';
    /**
     * GET /api/v1/auth/tokens/me on the account (realm-less) host, for the
     * allowed realm ids of the current token. Undefined when it fails.
     */
    async fetchAllowedRealms() {
        try {
            // Create a base-domain client (no realm) for introspection.
            //
            // This request carries the caller's BEARER, so it must leave through the caller's transport
            // like every other request. An earlier version built it with baseURL/token/timeout only, so on a realm 403 the
            // bearer went out through the runtime's global fetch — outside the injected egress policy
            // (hoody-bot injects one into every per-user client). Carry the injected transport and the
            // middleware chain.
            const parentConfig = this.http.config;
            const injectedFetch = this.http.getInjectedFetch();
            const introspectionConfig = {
                baseURL: parentConfig.baseURL,
                token: parentConfig.token,
                timeout: parentConfig.timeout || 10000,
                ...(injectedFetch ? { fetch: injectedFetch } : {}),
                // Without the realm-host middleware: this lookup is account-level by design.
                middlewares: (parentConfig.middlewares || []).filter(m => !m._realmHostMiddleware), // never undefined: exactOptionalPropertyTypes
            };
            // The same five knobs withRealm() and withContainer() copy, and for the same reason. An earlier
            // fix carried the fetch and the middleware chain and stopped there, which is enough for
            // hoody-bot (it injects a fetch) and not for anyone who configures the transport instead:
            // a Node SDK or CLI user behind the dispatcher-based proxy had this ONE request leave on
            // the default agent, with their bearer on it, and be identified as nobody in particular
            // because the client id and name were dropped too.
            // The CALLER's transport options, not the normalised `parentConfig.transport`: that one has every
            // default filled in, and the browser client warns about each Node-only knob it is handed.
            const configuredTransport = this.http.getConfiguredTransport();
            if (configuredTransport)
                introspectionConfig.transport = configuredTransport;
            if (parentConfig.forceIPv4 !== undefined)
                introspectionConfig.forceIPv4 = parentConfig.forceIPv4;
            if (parentConfig.forceIPv4Cache)
                introspectionConfig.forceIPv4Cache = parentConfig.forceIPv4Cache;
            if (parentConfig.clientId)
                introspectionConfig.clientId = parentConfig.clientId;
            if (parentConfig.clientName)
                introspectionConfig.clientName = parentConfig.clientName;
            const baseHttp = new HttpClient(introspectionConfig);
            const meResult = await baseHttp.get('/api/v1/auth/tokens/me', {});
            const realms = meResult?.data?.restrictions?.allowed_realm_ids;
            return Array.isArray(realms) ? realms.filter((r) => typeof r === 'string') : [];
        }
        catch {
            return undefined;
        }
    }
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
    static async login(baseURL, credentials) {
        const client = new HoodyClient({ baseURL, credentials });
        await client.loginForSession(credentials);
        return client;
    }
    /**
     * Create a new client instance scoped to a specific container
     *
     * Automatically fetches container details if ID is provided,
     * and configures URL templates for all hoody-kit services.
     *
     * An object needs its id, project_id and a server (server_name, a string
     * server, or a server object's name) to route without a request. One that
     * has an id but no project_id or no server is looked up by id through the
     * account API, and the API's project and server are used; a project_id or
     * server it does give must be well formed and match them, or this throws
     * ValidationError. A failed lookup throws the API's error.
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
            // A routing field the caller gave must be well formed, whether or not the object is
            // then looked up: a complete object with `project_id: 42` or `id: 123` would route to
            // `42-<id>…` or install a numeric id, and `project_id: null` is not a missing one. A null
            // server_name beside a usable server (a containers.list item) is the one null that is ignored.
            if (containerOrId && typeof containerOrId === 'object')
                _assertGivenContainerRouting(containerOrId);
            if (_containerNeedsLookup(containerOrId)) {
                // An object that names the container but not where it runs ({ id }, or metadata without
                // its project or server) is looked up by id, and the API's answer routes the client.
                // A routing field the caller did give must match that answer: it is checked, never
                // replaced. A failed lookup throws the API's own error.
                const response = await this.api.containers.get(containerOrId.id);
                container = _containerFromLookup(containerOrId, response?.data);
            }
            else {
                container = containerOrId;
            }
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
            // The caller's base, not the transport's page-resolved one: the scoped
            // client resolves it again, and derives its kit domain from it.
            baseURL: this.callerBaseURL,
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
        // The caller's own hooks, never the transport's: those are this client's
        // session-bound wrappers, and a derived client that later leaves the
        // session (setToken) would keep recovering through this one's.
        if (this.userOnTokenExpired)
            newConfig.onTokenExpired = this.userOnTokenExpired;
        if (this.userRefreshToken)
            newConfig.refreshToken = this.userRefreshToken;
        if (config.autoRetryAuth !== undefined)
            newConfig.autoRetryAuth = config.autoRetryAuth;
        // The CALLER's transport options, never the normalised `config.transport`: that one has every
        // default filled in, so each derived browser client warned about Node-only knobs nobody set.
        const configuredTransport = this.http.getConfiguredTransport();
        if (configuredTransport)
            newConfig.transport = configuredTransport;
        // The INJECTED fetch must survive every derived client: a realm-scoped client that fell back to
        // the runtime's global fetch would leave the caller's egress policy.
        // Read it through getInjectedFetch(), NOT config.fetch: the BROWSER HttpClient keeps the injection out
        // of its config on purpose (it late-binds the global when nothing was injected), so the config copy
        // alone drops the transport in the very build hoody-bot bundles.
        const injectedFetch = this.http.getInjectedFetch();
        if (injectedFetch)
            newConfig.fetch = injectedFetch;
        if (config.forceIPv4 !== undefined)
            newConfig.forceIPv4 = config.forceIPv4;
        if (config.forceIPv4Cache)
            newConfig.forceIPv4Cache = config.forceIPv4Cache;
        if (config.clientId)
            newConfig.clientId = config.clientId;
        if (config.clientName)
            newConfig.clientName = config.clientName;
        // Raw-body capture for response-signature checks (lib/signing.ts) must
        // survive derivation like the rest of the transport configuration.
        if (config.captureRawBody)
            newConfig.captureRawBody = true;
        // The event-stream frame limit is part of the transport configuration too.
        if (config.maxStreamFrameBytes !== undefined)
            newConfig.maxStreamFrameBytes = config.maxStreamFrameBytes;
        if (config.onStreamDiagnostic)
            newConfig.onStreamDiagnostic = config.onStreamDiagnostic;
        if (this.realmId)
            newConfig.realmId = this.realmId;
        newConfig.autoRefresh = this.autoRefresh;
        if (this.realmErrorIntrospection)
            newConfig.realmErrorIntrospection = true;
        newConfig.target = this.target;
        // The session (credentials, refresh token, logged-out state) is shared
        // with the scoped client, never copied: see _HoodySessionState.
        _SESSION_HANDOFF.set(newConfig, this.session);
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
            'egress': {
                projectId: container.project_id,
                containerId: container.id,
                server: containerServer,
                serverName: containerServer,
                serviceIndex: 1
            },
            'run': {
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
            },
            'bot': {
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
    withRealm(realmId) {
        const config = this.http.config;
        const selectedRealm = _normalizeRealmSelector(realmId, 'realmId');
        const newConfig = {
            // Always the account base URL: the constructor split any realm label off
            // it. The caller's, not the page-resolved one (see callerBaseURL).
            baseURL: this.callerBaseURL,
        };
        if (selectedRealm) {
            newConfig.realmId = selectedRealm;
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
        // The caller's own hooks, never the transport's: those are this client's
        // session-bound wrappers, and a derived client that later leaves the
        // session (setToken) would keep recovering through this one's.
        if (this.userOnTokenExpired)
            newConfig.onTokenExpired = this.userOnTokenExpired;
        if (this.userRefreshToken)
            newConfig.refreshToken = this.userRefreshToken;
        if (config.autoRetryAuth !== undefined)
            newConfig.autoRetryAuth = config.autoRetryAuth;
        // The CALLER's transport options, never the normalised `config.transport`: that one has every
        // default filled in, so each derived browser client warned about Node-only knobs nobody set.
        const configuredTransport = this.http.getConfiguredTransport();
        if (configuredTransport)
            newConfig.transport = configuredTransport;
        // The INJECTED fetch must survive every derived client: a realm-scoped client that fell back to
        // the runtime's global fetch would leave the caller's egress policy.
        // Read it through getInjectedFetch(), NOT config.fetch: the BROWSER HttpClient keeps the injection out
        // of its config on purpose (it late-binds the global when nothing was injected), so the config copy
        // alone drops the transport in the very build hoody-bot bundles.
        const injectedFetch = this.http.getInjectedFetch();
        if (injectedFetch)
            newConfig.fetch = injectedFetch;
        if (config.forceIPv4 !== undefined)
            newConfig.forceIPv4 = config.forceIPv4;
        if (config.forceIPv4Cache)
            newConfig.forceIPv4Cache = config.forceIPv4Cache;
        if (config.clientId)
            newConfig.clientId = config.clientId;
        if (config.clientName)
            newConfig.clientName = config.clientName;
        if (config.captureRawBody)
            newConfig.captureRawBody = true;
        if (config.maxStreamFrameBytes !== undefined)
            newConfig.maxStreamFrameBytes = config.maxStreamFrameBytes;
        if (config.onStreamDiagnostic)
            newConfig.onStreamDiagnostic = config.onStreamDiagnostic;
        if (this.urlTemplates)
            newConfig.urlTemplates = this.urlTemplates;
        if (this.kitAuth)
            newConfig.kitAuth = this.kitAuth;
        if (this.onKitAuthExpired)
            newConfig.onKitAuthExpired = this.onKitAuthExpired;
        newConfig.autoRefresh = this.autoRefresh;
        if (this.realmErrorIntrospection)
            newConfig.realmErrorIntrospection = true;
        newConfig.target = this.target;
        _SESSION_HANDOFF.set(newConfig, this.session);
        return new HoodyClient(newConfig);
    }
    /**
     * Get the current realm ID (if scoped)
     */
    getRealmId() {
        return this.realmId;
    }
    /**
     * A view of this.http whose request methods first run check(path). Every
     * other member passes straight through, so the services see the same
     * transport, config and helpers as before.
     */
    guardHttp(check, accountService) {
        // A request a generated service sends has chosen its host already (a
        // realm URL, a kit URL, or the base URL for a call it sends without a
        // realm). Record that choice for this one call as a route tag (see
        // _RouteDecision): the realm-scope finalizer keeps it, and restores it
        // after a middleware moved the request. Direct client.http requests carry
        // none. A credential-bearing auth call also refuses redirects.
        const transport = this.transport;
        const mark = (method, path, options) => {
            if (options !== undefined && (options === null || typeof options !== 'object'))
                return { data: options };
            const text = String(path);
            const url = /^https?:[/][/]/i.test(text)
                ? text
                : transport.getBaseURL().replace(/[/]+$/, '') + (text.startsWith('/') ? text : '/' + text);
            const credential = accountService && _isCredentialAuthCall(method, url);
            const routeTag = _routeTag({ owner: this, host: _hostOf(url) || '', credential });
            const bag = (options || {});
            return { data: credential ? { ...bag, routeTag, redirect: 'error' } : { ...bag, routeTag }, tag: routeTag };
        };
        // prepareUpgrade: the generated WebSocket builders build their socket URL
        // through it, so an upgrade is refused exactly like an HTTP call.
        const pathFirst = _PATH_FIRST_METHODS;
        const methodFirst = _METHOD_FIRST_METHODS;
        return new Proxy(this.transport, {
            get: (target, prop) => {
                const value = target[prop];
                if (typeof value !== 'function')
                    return value;
                if (typeof prop === 'string' && pathFirst.has(prop)) {
                    return (path, options, ...rest) => {
                        check(path);
                        const marked = mark(prop === 'prepareUpgrade' ? 'GET' : prop, path, options);
                        return _spendWhenSettled(value.call(target, path, marked.data, ...rest), marked.tag);
                    };
                }
                if (typeof prop === 'string' && methodFirst.has(prop)) {
                    return (method, path, data, ...rest) => {
                        check(path);
                        if (prop === 'streamEvents') {
                            return _lazyTaggedStream(() => {
                                const marked = mark(method, path, data);
                                return { iterable: value.call(target, method, path, marked.data, ...rest), tag: marked.tag };
                            });
                        }
                        const marked = mark(method, path, data);
                        return _spendWhenSettled(value.call(target, method, path, marked.data, ...rest), marked.tag);
                    };
                }
                return value.bind(target);
            },
        });
    }
    /**
     * True when this client targets the account API (HoodyClientConfig.target,
     * resolved at construction and kept by derived clients). Kit paths are
     * meaningless there. A direct-kit client is left alone, whatever its host
     * is called.
     */
    isAccountApiBase() {
        return this.target === 'account';
    }
    /**
     * Transport for a kit namespace's services. A kit service that has no
     * container to build its URL from (the client was not made by
     * withContainer()) produces a bare path; on an account-API client that path
     * would go to the API host with the account bearer. Refuse it before it is
     * sent. Container clients (the service builds a full kit URL) and direct-kit
     * clients (baseURL is the kit) are unaffected.
     */
    guardKitHttp(namespace) {
        return this.guardHttp((path) => {
            const lowered = String(path).toLowerCase();
            if (lowered.startsWith('http://') || lowered.startsWith('https://'))
                return;
            if (!this.isAccountApiBase())
                return;
            throw new ValidationError(namespace + ' is a container kit: call client.withContainer(container) first and use the client it returns'
                + ' (or construct the client with the kit URL as baseURL). This client targets the account API, which does not serve ' + path + '.', 'container');
        }, false);
    }
    /**
     * Transport for the account-API services. A realm reaches them as a host
     * label (per client via withRealm(), per call via the _realm option); the
     * services only prepend it. A label that is not a realm id would be ignored
     * by the server, which then runs the request across every realm; a realm
     * the service could not apply leaves the request on the account host. Both
     * are refused here, before anything is sent.
     */
    guardAccountHttp() {
        return this.guardHttp((path) => {
            const text = String(path);
            const lowered = text.toLowerCase();
            if (!lowered.startsWith('http://') && !lowered.startsWith('https://'))
                return;
            let host;
            let baseHost;
            try {
                host = new URL(text).hostname.toLowerCase();
                baseHost = new URL(this.transport.getBaseURL()).hostname.toLowerCase();
            }
            catch {
                return;
            }
            if (!baseHost)
                return;
            // The services turn a path into a full URL only to apply a realm, so a
            // full URL still on the account host is a realm that did not take.
            // (A base host that itself starts with a realm label, kept as given on a
            // 'kit'-target client, is already scoped.)
            if (host === baseHost && !REALM_ID_PATTERN.test(baseHost.split('.')[0] || '')) {
                throw new ValidationError('Invalid realm: it could not be applied to ' + baseHost + ', so the request would run unscoped.', '_realm');
            }
            if (!host.endsWith('.' + baseHost))
                return;
            const label = host.slice(0, host.length - baseHost.length - 1);
            if (!REALM_ID_PATTERN.test(label)) {
                throw new ValidationError('Invalid realm id "' + label + '": a realm id is 24 hexadecimal characters.', '_realm');
            }
            // hoody-api reads a realm only from a host of four labels or more
            // ({realm}.api.example.com); on a shorter one ({realm}.localhost) it
            // would silently serve the request unscoped.
            if (host.split('.').length < 4) {
                throw new ValidationError('Realm routing needs an API host with at least three labels (api.example.com); ' + baseHost + ' cannot carry a realm, so the request would run unscoped.', '_realm');
            }
        }, true);
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
        // Every kit names the server {serverName}, as the kit specs do. For one release a caller still
        // passing server has it copied to serverName (_withServerNameAlias).
        return `https://{projectId}-{containerId}-${kitSegment}-{serviceIndex}.{serverName}.${containersDomain}`;
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
        const baseURL = this.callerBaseURL;
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
            : rawKit === 'proxylogs' ? 'logs'
                : rawKit;
        // Accept explicit dynamic service slugs as-is (http-8080, https-8443).
        if (/^(https?)-\d+$/.test(normalizedKit)) {
            return normalizedKit;
        }
        // SSH is a protocol endpoint, not an indexed kit service.
        if (normalizedKit === 'ssh') {
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
        // One egress process serves the whole container, so every index reaches the
        // same proxy and the canonical URL carries no suffix — the form the CLI,
        // the docs and the edge's prefix handling all use. The suffix is not
        // cosmetic though: proxy permissions are evaluated per service index, so an
        // explicit index above 1 is preserved. Dropping it at index 1 is lossless
        // because the router normalizes a missing index to 1 (sniParser).
        if (normalizedKit === 'egress' && serviceIndex === 1) {
            return normalizedKit;
        }
        return `${normalizedKit}-${serviceIndex}`;
    }
    /**
     * Generate URLs for all standard kits
     */
    getKitUrls(container, serviceIndexOrOptions = 1) {
        const kits = ['terminal', 'browser', 'code', 'curl', 'cron', 'daemon', 'display', 'desktop', 'exec', 'files', 'notifications', 'sqlite', 'watch', 'logs', 'notes', 'run', 'pipe', 'tunnel', 'agent', 'bot', 'egress'];
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
     * Returns the same typed response as GET /api/v1/ip (ApiIpGetResponse).
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
        const baseURL = this.callerBaseURL;
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
