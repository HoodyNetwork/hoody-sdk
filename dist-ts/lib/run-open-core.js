'use strict';
// run-open-core.js — open, observe and close an app in a computer, over the kits' public HTTP routes.
//
// One implementation shared by the SDK (`client.run.open/status/close`, lib/run-open.ts), the CLI
// (`hoody run <app> --open`, `hoody run close|status`) and the Hub Apps view. The Hub loads its own
// copies of this file; drift tests keep every copy in step with this one.
// That is why this file has no import and no export: it is a classic script (the Hub loads it with
// a <script> tag) and a side-effect ES module (the SDK imports it) at once, and it defines exactly
// one frozen global, `HoodyRunOpenCore`. No Node or DOM API is used beyond `crypto`, `atob`,
// `TextEncoder`, `TextDecoder` and `setTimeout`, each of which can be injected.
//
// The contract it relies on:
//   - hoody-run (`run-1`) only RESOLVES. It answers what to run and never executes.
//   - hoody-terminal does the work: `exclusive` create on terminal-N, a tracked execute whose
//     workload record (incarnation I, command id C) is the only evidence of an app's state, a
//     workload signal keyed by (I, C), and DELETE with `?incarnation=I`. The signal carries no
//     operation key and a repeat is not a no-op, so it is re-sent only when it provably never left.
//   - The transport is injected: `send(target, method, path, query, body)` where target is
//     `{kit: 'run'|'terminal'|'display', index: n}`. It resolves `{status, body}` for any HTTP
//     answer (body: parsed JSON, else undefined) and rejects when no answer arrived. A rejection
//     carrying `notSent: true` proves the request never left; one carrying
//     `code: 'preflight_refused'` is the access-settings refusal of a restricted proxy policy.
//     An answer may also carry `retryAfterMs` (the server's Retry-After, already parsed to a
//     non-negative number of milliseconds); `busy` results pass it on.
//   - Resolve answers can carry secret values (`launch_env`). The core scrubs each answer it reads
//     as soon as it has taken what it needs. A caller holding resolve or preflight answers of its
//     own (a preview, a dropped or stale answer, one already used) calls
//     `HoodyRunOpenCore.scrubResolveAnswer(answer)` on each, which blanks those values in place.
//   - Every result is `{ok, code, message, state?, reason?, handle?, ...}`. `code` is one key of
//     MESSAGES. A failure with `notSent: true` and no `state` is definite: the app did not start.
//   - A caller that keeps its own record of a launch may pass open() `beforeExecute(handle)`: it is
//     awaited before each new command id leaves, and only `true` lets that id be sent. It may pass
//     status, watch and close `expectTag`: a record then counts only when its track label names that
//     launch tag (else `unknown`, reason `foreign_record`), and close neither signals nor deletes on
//     anything else, a failed read included.
//
// Evidence rules (what a state may claim):
//   - Nothing but the terminal kit's workload record decides `running`, `exited`, `not_started`
//     and `stopped`, and only a record naming exactly this (I, C), wherever it arrives (workload
//     list, admission or signal answer). The command's /result (output_quiet, markers, eviction)
//     is never read.
//   - `not_started` only from a record that says `never_started`. A missing record, a retired
//     incarnation or a restarted kit all read `unknown`.
//   - `ready` only for a window whose pid is a workload member, or a member-owned TCP listener on
//     IPv4 0.0.0.0 at the declared port. An IPv6-only listener stays `running`.
//   - After an execute that got no answer, the identical request is re-sent (same I, C, body), at
//     most 3 times within 30 s, spaced and never sooner than the answer's Retry-After allows;
//     a new command id is chosen only after a DEFINITE 409 COMMAND_ID_EXISTS on a first send.
//   - `stopped` only after the record reads `gone` following our signal, plus (OCI) two clean
//     Docker reads at least 3 s apart. Each harder signal (TERM, then KILL) goes only after a read
//     shows the workload still pending or running; an unreadable or missing record stops the close
//     at stop_unconfirmed. An app whose record has no `run:` label is never confirmed stopped.
//   - Secrets ride only in execute's staged `env`. The resolve call asks for
//     `launch_env: "separate"`, so `shell_command` (history, results, Details) holds no value;
//     a command that still holds a resolver secret is refused, and a resolver field that echoes
//     one (title, provider, kind, web path) is dropped before anything is shown or kept.
(function (root) {
    if (root.HoodyRunOpenCore)
        return; // first definition wins; the global is non-writable
    var VERSION = 1;
    // Terminal and display ids are valid only up to 9999: a launch creates terminal N and display N in
    // bandMin-bandMax (hoody-run's SUGGESTED_TERMINAL_BAND), above the shells numbered from 1 up. The band is not
    // reserved: the proxy's desktop-N (terminal and display 1600 + N) and browser-N (display 500 + N) address the
    // same ids, so desktop-6401..8399 and browser-7501..9499 reach them; create skips only the ids hoody-terminal
    // lists as sessions. Launches made before in legacyMin-legacyMax are still read and closed, never created.
    var LIMITS = Object.freeze({
        bandMin: 8001,
        bandMax: 9999,
        legacyMin: 15001,
        legacyMax: 19999,
        createTries: 16,
        createOutagesInARow: 3,
        commandIdTries: 4,
        replays: 3,
        replaySpacingMs: 250,
        replayWindowMs: 30000,
        args: 64,
        argBytes: 4096,
        envNames: 64,
        callerEnvNames: 32,
        envValueBytes: 65536,
        escalateWaitMs: 3000,
        killConfirmMs: 10000,
        sweepBudgetMs: 30000,
        sweepCleanGapMs: 3000,
        signalSends: 3,
        pollFastMs: 1000,
        pollFastForMs: 10000,
        pollSlowMs: 3000,
    });
    // Every feature the open sequence uses. A kit that lacks one is an old kit: nothing is sent.
    var RUN_FEATURES = ['args', 'pass_env', 'launch_tag', 'launch_env'];
    var TERMINAL_FEATURES = ['exclusive_create', 'require_staged', 'incarnation', 'tracked_exec', 'effective_uid'];
    var STATES = Object.freeze(['starting', 'started', 'running', 'ready', 'exited', 'not_started', 'stopped', 'unknown']);
    // Plain English copy, one per outcome code (the Hub translates the same codes with its own keys).
    var MESSAGES = Object.freeze({
        needs_update: 'This computer needs an update to open apps safely.',
        unreachable: 'Couldn\'t reach this computer.',
        access_refused: 'Apps can\'t reach this computer with its current access settings.',
        invalid_options: 'These options can\'t be used to open an app.',
        reserved_name: 'This setting name is reserved.',
        no_candidates: 'We couldn\'t find "{name}".',
        sources_unavailable: 'Some app sources didn\'t answer.',
        source_warming: 'Getting the app list ready…',
        policy_denied: 'This app isn\'t allowed on this computer.',
        args_unsupported: 'This app can\'t take options.',
        needs_pick: 'Several apps match. Pick one.',
        resolve_failed: 'We couldn\'t look up this app.',
        port_in_use: 'Something on this computer is already using what {name} needs.',
        too_many_apps: 'This computer has too many open apps.',
        busy: 'This computer is busy. Try again in a moment.',
        unsafe_setup: 'This computer\'s setup isn\'t safe for opening apps.',
        staging_unavailable: 'We couldn\'t pass your settings safely.',
        not_durable: 'The record that stops a second start couldn\'t be saved, so nothing was started.',
        shell_unavailable: 'This computer didn\'t start the shell this needs, so nothing was started.',
        folder_refused: 'This folder can\'t be opened on this computer, so nothing was started. Pick another folder.',
        shell_unsupported: 'This terminal\'s shell can\'t run apps, so nothing was started. Use bash or zsh, then try again.',
        couldnt_start: 'Couldn\'t start the app. Try again.',
        start_unconfirmed: 'We\'re not sure the app started.',
        terminal_replaced: 'That app\'s terminal was replaced, so it is closed.',
        cancelled: 'Opening was cancelled.',
        started: '{name} is starting…',
        running: '{name} is starting… the first time downloads it.',
        running_plain: '{name} is running.',
        ready: '{name} is ready.',
        done: 'Done.',
        exited_error: '{name} stopped with an error.',
        not_started: '{name} didn\'t start.',
        stopped: '{name} stopped.',
        tracker_lost: 'We can\'t follow this app any more.',
        unknown: 'We\'re not sure what {name} is doing.',
        stop_unconfirmed: 'We couldn\'t confirm {name} stopped.',
        other_user: 'Part of this app is running with administrator rights, so we couldn\'t stop all of it.',
        wrong_computer: 'This app was opened on another computer.',
        invalid_handle: 'That isn\'t an app handle.',
        no_app: 'No open app was found in that terminal.',
        several_apps: 'Several apps are open in that terminal. Pick one by its full handle.',
    });
    var ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var INCARNATION = /^[0-9a-f]{32}$/;
    var LAUNCH_TAG = /^[0-9a-f]{16}$/;
    var SHELL_QUOTING = /['"\\]/g;
    var TRACK_LABEL = /^run:(oci|app):([0-9a-f]{16})$/;
    var CONTAINER_ID = /^[0-9a-f]{12,64}$/;
    var OPENS_IN = { window: true, terminal: true, web: true };
    // ── small helpers ────────────────────────────────────────────────────────
    function own(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
    function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    function isInt(v, min, max) { return typeof v === 'number' && Math.floor(v) === v && v >= min && v <= max; }
    function utf8Bytes(s) {
        if (typeof TextEncoder === 'function')
            return new TextEncoder().encode(s).length;
        return unescape(encodeURIComponent(s)).length;
    }
    function hex(bytes) {
        var out = '';
        for (var i = 0; i < bytes.length; i++)
            out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
        return out;
    }
    function base64url(bytes) {
        var bin = '';
        for (var i = 0; i < bytes.length; i++)
            bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function decodeB64Utf8(b64) {
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++)
            bytes[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    function errCode(body) {
        if (!isObj(body))
            return undefined;
        if (typeof body.code === 'string')
            return body.code;
        if (isObj(body.error) && typeof body.error.code === 'string')
            return body.error.code;
        return undefined;
    }
    // The transport's Retry-After in ms, when it is a usable number (capped at an hour).
    function retryAfterOf(res) {
        var ms = isObj(res) ? res.retryAfterMs : undefined;
        if (typeof ms !== 'number' || !isFinite(ms) || ms < 0)
            return undefined;
        return Math.min(Math.round(ms), 3600000);
    }
    // Blank the secret values of a resolve or preflight answer in place: every `launch_env` entry's
    // value becomes '' and the `launch_env` member is removed. Accepts the answer body (or anything
    // else, which it leaves alone) and never throws, even on a frozen object. Returns how many values
    // it blanked. Safe to call twice.
    function scrubResolveAnswer(answer) {
        var n = 0;
        if (!isObj(answer) || !isObj(answer.launch_env))
            return 0;
        var le = answer.launch_env;
        for (var k in le) {
            if (!own(le, k))
                continue;
            try {
                if (isObj(le[k]) && typeof le[k].value === 'string' && le[k].value !== '') {
                    le[k].value = '';
                    n++;
                }
                else if (typeof le[k] === 'string' && le[k] !== '') {
                    le[k] = '';
                    n++;
                }
            }
            catch (_e) { /* frozen: nothing more can be done here */ }
        }
        try {
            delete answer.launch_env;
        }
        catch (_e) { /* frozen */ }
        return n;
    }
    // A failed send: `ambiguous` unless the transport proves the request never left.
    function sendFailure(e) {
        if (isObj(e) && e.code === 'preflight_refused')
            return { kind: 'refused' };
        if (isObj(e) && e.notSent === true)
            return { kind: 'not_sent' };
        // No answer, but a server's "come back later" still spaces the replays.
        var f = { kind: 'ambiguous' };
        var wait = retryAfterOf(e);
        if (wait !== undefined)
            f.retryAfterMs = wait;
        return f;
    }
    function fill(code, vars) {
        var text = MESSAGES[code] || MESSAGES.unknown;
        return text.replace('{name}', vars && vars.name ? vars.name : 'The app');
    }
    // ── handles ──────────────────────────────────────────────────────────────
    // A handle names one launch on one computer: terminal N, incarnation I, command C. Everything
    // else in it (launch tag, kind, where it opens) is recoverable from the workload record or the
    // resolve answer, so the compact form `N:I:C` is enough to observe and close an app.
    // A terminal a launch may live in: the band, or the old band of launches made before (read and close only).
    function launchTerminal(n) {
        return isInt(n, LIMITS.bandMin, LIMITS.bandMax) || isInt(n, LIMITS.legacyMin, LIMITS.legacyMax);
    }
    function validHandle(h) {
        return isObj(h)
            && launchTerminal(h.terminal_id)
            && typeof h.incarnation === 'string' && INCARNATION.test(h.incarnation)
            && isInt(h.command_id, 1, 65535)
            && (h.launch_tag === undefined || (typeof h.launch_tag === 'string' && LAUNCH_TAG.test(h.launch_tag)))
            && (h.kind === undefined || h.kind === 'oci' || h.kind === 'app')
            && (h.opens_in === undefined || own(OPENS_IN, h.opens_in))
            && (h.web === undefined || (isObj(h.web) && isInt(h.web.port, 1, 65535)));
    }
    function formatHandle(h) {
        return h.terminal_id + ':' + h.incarnation + ':' + h.command_id;
    }
    // `8001` (a terminal: shorthand), `8001:<32 hex>:<C>` (compact), or a handle object / its JSON.
    function parseTarget(input) {
        if (typeof input === 'number') {
            return launchTerminal(input) ? { terminal: input } : null;
        }
        if (isObj(input))
            return validHandle(input) ? { handle: copyHandle(input) } : null;
        if (typeof input !== 'string')
            return null;
        var s = input.trim();
        if (/^[0-9]{1,5}$/.test(s))
            return parseTarget(Number(s));
        var m = /^([0-9]{1,5}):([0-9a-f]{32}):([0-9]{1,5})$/.exec(s);
        if (m) {
            var h = { terminal_id: Number(m[1]), incarnation: m[2], command_id: Number(m[3]), display: Number(m[1]) };
            return validHandle(h) ? { handle: h } : null;
        }
        if (s.charAt(0) === '{') {
            try {
                return parseTarget(JSON.parse(s));
            }
            catch (_e) {
                return null;
            }
        }
        return null;
    }
    // The id half of a computer reference. A handle (or deps.computer) written before the rename names it
    // `container`; the current spelling is `computer_id` (old spellings are read, the new one is written). Every spelling is read, in
    // this order: a string `computer`, then `computer_id`, then the retired `container`; the first one present wins,
    // so `{ computer: 'B', computer_id: 'A' }` yields B. Only `computer_id` is written (copyHandle and the two places
    // that build a handle's `computer` block).
    function computerIdOf(c) {
        if (!isObj(c))
            return undefined;
        if (typeof c.computer === 'string')
            return c.computer;
        if (typeof c.computer_id === 'string')
            return c.computer_id;
        if (typeof c.container === 'string')
            return c.container; // retired spelling, read only
        return undefined;
    }
    function copyHandle(h) {
        var out = {
            v: VERSION,
            terminal_id: h.terminal_id,
            incarnation: h.incarnation,
            command_id: h.command_id,
            display: isInt(h.display, 1, 65535) ? h.display : h.terminal_id,
        };
        if (isObj(h.computer) && typeof h.computer.project === 'string' && computerIdOf(h.computer) !== undefined) {
            out.computer = { project: h.computer.project, computer_id: computerIdOf(h.computer) };
        }
        if (h.launch_tag !== undefined)
            out.launch_tag = h.launch_tag;
        if (h.kind !== undefined)
            out.kind = h.kind;
        if (h.opens_in !== undefined)
            out.opens_in = h.opens_in;
        if (h.web !== undefined)
            out.web = { port: h.web.port, path: typeof h.web.path === 'string' ? h.web.path : '/' };
        if (typeof h.name === 'string')
            out.name = h.name;
        return out;
    }
    // ── outcome → CLI exit code ──────────────────────────────────────────────
    // 0: started, running, ready, stopped, or exited 0 · 2: failed (nothing running, or a non-zero
    // exit) · 3: unknown or unreachable · 4: an old kit (nothing was sent).
    function exitCodeFor(r) {
        if (!r)
            return 3;
        if (r.code === 'needs_update')
            return 4;
        if (r.state === 'exited')
            return r.exit_code === 0 && !r.signal ? 0 : 2;
        if (r.ok)
            return 0;
        if (r.state === 'unknown' || r.code === 'unreachable' || r.code === 'start_unconfirmed')
            return 3;
        return 2;
    }
    // ── the machine ──────────────────────────────────────────────────────────
    function createRunOpen(deps) {
        if (!deps || typeof deps.send !== 'function')
            throw new TypeError('createRunOpen: deps.send is required');
        var send = deps.send;
        var user = typeof deps.user === 'string' && deps.user ? deps.user : 'user';
        var computer = isObj(deps.computer) ? deps.computer : undefined;
        var now = typeof deps.now === 'function' ? deps.now : function () { return Date.now(); };
        var sleep = typeof deps.sleep === 'function' ? deps.sleep : function (ms) {
            return new Promise(function (resolve) { setTimeout(resolve, ms); });
        };
        var random = typeof deps.random === 'function' ? deps.random : function (n) {
            if (!root.crypto || typeof root.crypto.getRandomValues !== 'function') {
                throw new Error('run-open: no secure random source');
            }
            return root.crypto.getRandomValues(new Uint8Array(n));
        };
        var RUN = { kit: 'run', index: 1 };
        var T0 = { kit: 'terminal', index: 0 };
        function TN(n) { return { kit: 'terminal', index: n }; }
        function DN(n) { return { kit: 'display', index: n }; }
        // One request; never throws. kind: 'answer' (any HTTP status), 'ambiguous', 'not_sent', 'refused'.
        async function call(target, method, path, query, body) {
            try {
                var res = await send(target, method, path, query || undefined, body);
                if (!isObj(res) || typeof res.status !== 'number')
                    return { kind: 'ambiguous' };
                return { kind: 'answer', status: res.status, body: res.body, retryAfterMs: retryAfterOf(res) };
            }
            catch (e) {
                return sendFailure(e);
            }
        }
        function randomCommandId() {
            for (;;) {
                var b = random(2);
                var c = (b[0] << 8) | b[1];
                if (c >= 1)
                    return c;
            }
        }
        function fail(code, extra) {
            var r = { ok: false, code: code, message: fill(code, extra) };
            for (var k in extra || {})
                if (own(extra, k) && k !== 'name')
                    r[k] = extra[k];
            return r;
        }
        function sameComputer(h) {
            if (!computer || !h.computer)
                return true;
            return h.computer.project === computer.project && computerIdOf(h.computer) === computerIdOf(computer);
        }
        // ── 1. capabilities ────────────────────────────────────────────────────
        function featuresOk(a, service, needed) {
            if (a.status !== 200 || !isObj(a.body) || a.body.service !== service || !isObj(a.body.features))
                return false;
            for (var i = 0; i < needed.length; i++)
                if (a.body.features[needed[i]] !== true)
                    return false;
            return true;
        }
        async function capabilities() {
            var both = await Promise.all([
                call(RUN, 'GET', '/api/v1/run/capabilities'),
                call(T0, 'GET', '/api/v1/terminal/capabilities'),
            ]);
            var run = both[0];
            var term = both[1];
            if (run.kind === 'refused' || term.kind === 'refused')
                return fail('access_refused', { notSent: true });
            if (run.kind !== 'answer' || term.kind !== 'answer')
                return fail('unreachable', { notSent: true });
            if (run.status === 401 || run.status === 403 || term.status === 401 || term.status === 403) {
                return fail('access_refused', { notSent: true });
            }
            if (run.status >= 500 || term.status >= 500)
                return fail('unreachable', { notSent: true });
            if (!featuresOk(run, 'run', RUN_FEATURES) || !featuresOk(term, 'terminal', TERMINAL_FEATURES)) {
                return fail('needs_update', { notSent: true });
            }
            return { ok: true };
        }
        // ── request validation (before anything is sent) ───────────────────────
        function checkRequest(req) {
            if (!isObj(req))
                return 'invalid_options';
            if (typeof req.app !== 'string' || !req.app.trim() || req.app.length > 512)
                return 'invalid_options';
            if (req.catalog !== undefined && typeof req.catalog !== 'boolean')
                return 'invalid_options';
            if (req.catalog === true && req.pick !== undefined)
                return 'invalid_options';
            if (req.pick !== undefined) {
                if (!isObj(req.pick) || typeof req.pick.candidate_id !== 'string' || !req.pick.candidate_id)
                    return 'invalid_options';
                if (req.pick.set_id !== undefined && typeof req.pick.set_id !== 'string')
                    return 'invalid_options';
            }
            if (req.args !== undefined) {
                if (!Array.isArray(req.args) || req.args.length > LIMITS.args)
                    return 'invalid_options';
                for (var i = 0; i < req.args.length; i++) {
                    if (typeof req.args[i] !== 'string' || utf8Bytes(req.args[i]) > LIMITS.argBytes || req.args[i].indexOf('\0') >= 0) {
                        return 'invalid_options';
                    }
                }
            }
            if (req.env !== undefined) {
                if (!isObj(req.env))
                    return 'invalid_options';
                var names = Object.keys(req.env);
                if (names.length > LIMITS.callerEnvNames)
                    return 'invalid_options'; // each one becomes a pass_env name
                for (var j = 0; j < names.length; j++) {
                    var v = req.env[names[j]];
                    if (!ENV_NAME.test(names[j]) || typeof v !== 'string' || v.indexOf('\0') >= 0)
                        return 'invalid_options';
                    if (names[j].indexOf('HOODY_') === 0)
                        return 'reserved_name';
                }
            }
            if (req.cwd !== undefined && (typeof req.cwd !== 'string' || !req.cwd || req.cwd.indexOf('\0') >= 0 || req.cwd.length > 4096)) {
                return 'invalid_options';
            }
            if (req.selector !== undefined && !isObj(req.selector))
                return 'invalid_options';
            if (req.opensIn !== undefined && req.opensIn !== 'window' && req.opensIn !== 'terminal')
                return 'invalid_options';
            if (req.shell !== undefined && req.shell !== 'bash')
                return 'invalid_options';
            return null;
        }
        // ── 2. resolve ─────────────────────────────────────────────────────────
        function resolveBody(req, launchTag) {
            var body = { app: req.app.trim(), launch_tag: launchTag, launch_env: 'separate' };
            var sel = req.selector || {};
            if (typeof sel.kind === 'string')
                body.kind = sel.kind;
            if (typeof sel.os === 'string')
                body.os = sel.os;
            if (Array.isArray(sel.source) && sel.source.length)
                body.source = sel.source.slice();
            if (Array.isArray(sel.tags) && sel.tags.length)
                body.tags = sel.tags.slice();
            if (req.pick) {
                body.pick = 'id';
                body.candidate_id = req.pick.candidate_id;
                if (req.pick.set_id)
                    body.set_id = req.pick.set_id;
            }
            else {
                body.pick = 'first';
            }
            if (req.args && req.args.length)
                body.args = req.args.slice();
            var names = req.env ? Object.keys(req.env) : [];
            if (names.length)
                body.pass_env = names;
            return body;
        }
        function resolveRefusal(a, name) {
            var code = errCode(a.body);
            if (code === 'NO_CANDIDATES') {
                var warned = isObj(a.body) && ((Array.isArray(a.body.warnings) && a.body.warnings.length > 0)
                    || (typeof a.body.error === 'string' && /partial result/i.test(a.body.error)));
                return fail(warned ? 'sources_unavailable' : 'no_candidates', { notSent: true, name: name });
            }
            // 502 from a resolver that answered: it could not search its sources, the kit is reachable.
            if (code === 'SOURCE_RESOLUTION_FAILED')
                return fail('sources_unavailable', { notSent: true, name: name });
            if (code === 'SOURCE_WARMING')
                return fail('source_warming', { notSent: true });
            if (code === 'POLICY_DENIED')
                return fail('policy_denied', { notSent: true });
            if (code === 'ARGS_UNSUPPORTED')
                return fail('args_unsupported', { notSent: true });
            if (a.status === 401 || a.status === 403)
                return fail('access_refused', { notSent: true });
            if (a.status >= 500)
                return fail('unreachable', { notSent: true });
            return fail('resolve_failed', { notSent: true, detail: { status: a.status, code: code } });
        }
        // What to run and where it opens, from a resolve answer; null when the answer is unusable.
        function plan(body) {
            if (!isObj(body) || !isObj(body.selected) || typeof body.shell_command !== 'string' || !body.shell_command)
                return null;
            var sel = body.selected;
            var starter = isObj(sel.starter) ? sel.starter : null;
            var oci = sel.provider === 'oci';
            var opensIn = 'terminal';
            var web;
            if (!oci && starter && own(OPENS_IN, starter.opens_in)) {
                opensIn = starter.opens_in;
                if (opensIn === 'web') {
                    if (!isObj(starter.web) || !isInt(starter.web.port, 1, 65535))
                        return null;
                    web = { port: starter.web.port, path: typeof starter.web.path === 'string' && starter.web.path.charAt(0) === '/' ? starter.web.path : '/' };
                }
            }
            else if (!oci && (sel.kind === 'gui'
                || (isObj(body.handoff) && isObj(body.handoff.suggested) && body.handoff.suggested.opens_in === 'window'))) {
                opensIn = 'window';
            }
            // Keyed by env name and without a prototype, so a name like __proto__ is an entry like any other.
            var launchEnv = Object.create(null);
            if (body.launch_env !== undefined) {
                if (!isObj(body.launch_env))
                    return null;
                for (var k in body.launch_env) {
                    if (!own(body.launch_env, k))
                        continue;
                    var e = body.launch_env[k];
                    if (!ENV_NAME.test(k) || !isObj(e) || typeof e.value !== 'string')
                        return null;
                    launchEnv[k] = { value: e.value, secret: e.secret === true };
                }
            }
            var secretEnv = [];
            if (starter && isObj(starter.secret_env)) {
                for (var s in starter.secret_env) {
                    if (!own(starter.secret_env, s))
                        continue;
                    if (!ENV_NAME.test(s) || starter.secret_env[s] !== 'generate')
                        return null;
                    secretEnv.push(s);
                }
            }
            return {
                command: body.shell_command,
                kind: oci ? 'oci' : 'app',
                opensIn: opensIn,
                web: web,
                title: typeof sel.title === 'string' ? sel.title : '',
                provider: typeof sel.provider === 'string' ? sel.provider : '',
                appKind: typeof sel.kind === 'string' ? sel.kind : 'any',
                launchEnv: launchEnv,
                secretEnv: secretEnv,
                catalogId: starter && typeof starter.catalog_id === 'string' ? starter.catalog_id : undefined,
            };
        }
        // Env merge, highest priority last: resolver launch_env, caller env, generated starter secrets.
        // env and generated have no prototype: every legal name (__proto__ included) is an entry of its own.
        function mergeEnv(p, callerEnv) {
            var env = Object.create(null);
            var k;
            for (k in p.launchEnv)
                env[k] = p.launchEnv[k].value;
            for (k in callerEnv || {}) {
                if (!own(callerEnv, k))
                    continue;
                if (p.secretEnv.indexOf(k) >= 0)
                    return { code: 'reserved_name' };
                env[k] = callerEnv[k];
            }
            var generated = Object.create(null);
            for (var i = 0; i < p.secretEnv.length; i++) {
                generated[p.secretEnv[i]] = base64url(random(32));
                env[p.secretEnv[i]] = generated[p.secretEnv[i]];
            }
            var names = Object.keys(env);
            var bytes = 0;
            for (var j = 0; j < names.length; j++)
                bytes += utf8Bytes(env[names[j]]);
            if (names.length > LIMITS.envNames || bytes > LIMITS.envValueBytes)
                return { code: 'invalid_options' };
            // Separate mode means no value is in the command text. A resolver that still embeds a
            // secret would put it in shell history and every result read; refuse instead of running.
            // Resolver secrets count at any length, quoted or not. A caller value never reaches the
            // resolver, so only a long one is refused: a short match is a coincidence, not a disclosure.
            var secrets = secretValues(p, generated);
            for (var m = 0; m < secrets.length; m++) {
                if (containsSecret(p.command, secrets[m]))
                    return { code: 'staging_unavailable' };
            }
            for (k in callerEnv || {}) {
                if (own(callerEnv, k) && callerEnv[k].length >= 8 && containsSecret(p.command, callerEnv[k]))
                    return { code: 'staging_unavailable' };
            }
            return { env: env, generated: generated };
        }
        // Values that must never be shown: the resolver's secret launch_env values (even when the
        // caller overrides the name) and the generated starter secrets.
        function secretValues(p, generated) {
            var out = [];
            for (var k in p.launchEnv) {
                if (p.launchEnv[k].secret && p.launchEnv[k].value)
                    out.push(p.launchEnv[k].value);
            }
            for (var g in generated)
                out.push(generated[g]);
            return out;
        }
        // True when the text holds the value, also split or escaped by shell quoting ('a'b, "a\"b", a\b).
        function containsSecret(text, value) {
            if (!value)
                return false;
            if (text.indexOf(value) >= 0)
                return true;
            var folded = value.replace(SHELL_QUOTING, '');
            return folded.length > 0 && text.replace(SHELL_QUOTING, '').indexOf(folded) >= 0;
        }
        // Resolver metadata is shown and kept (handle, Details, messages, --json). A field that
        // carries a secret is dropped whole rather than trimmed, so no part of the value survives.
        function hideSecrets(p, generated) {
            var secrets = secretValues(p, generated);
            function carries(text) {
                for (var i = 0; i < secrets.length; i++)
                    if (containsSecret(text, secrets[i]))
                        return true;
                return false;
            }
            if (carries(p.title))
                p.title = '';
            if (carries(p.provider))
                p.provider = '';
            if (carries(p.appKind))
                p.appKind = 'any';
            if (p.web && carries(p.web.path))
                p.web.path = '/';
        }
        // ── 3. port pre-check (web starters) ───────────────────────────────────
        async function readPorts() {
            var a = await call(T0, 'GET', '/api/v1/system/ports');
            if (a.kind !== 'answer' || a.status !== 200)
                return null;
            var list = Array.isArray(a.body) ? a.body : (isObj(a.body) && Array.isArray(a.body.ports) ? a.body.ports : null);
            return list;
        }
        function isTcp(p) { return isObj(p) && typeof p.protocol === 'string' && p.protocol.toLowerCase().indexOf('tcp') === 0; }
        // ── 4. create ──────────────────────────────────────────────────────────
        async function takenTerminals() {
            var a = await call(T0, 'GET', '/api/v1/terminal/sessions');
            var taken = {};
            if (a.kind !== 'answer' || a.status !== 200)
                return taken; // exclusive create still refuses a taken id
            var list = Array.isArray(a.body) ? a.body : (isObj(a.body) && Array.isArray(a.body.sessions) ? a.body.sessions : []);
            for (var i = 0; i < list.length; i++) {
                var id = Number(isObj(list[i]) ? (list[i].terminal_id !== undefined ? list[i].terminal_id : list[i].id) : NaN);
                if (isInt(id, LIMITS.bandMin, LIMITS.bandMax))
                    taken[id] = true;
            }
            return taken;
        }
        async function cleanup(n, incarnation) {
            if (!INCARNATION.test(incarnation || ''))
                return;
            await call(TN(n), 'DELETE', '/api/v1/terminal/' + n, { incarnation: incarnation });
        }
        // Returns {n, incarnation} or a failure. Only a definite answer moves on to the next id.
        async function createTerminal(req, opts) {
            var taken = await takenTerminals();
            var n = LIMITS.bandMin;
            var outages = 0;
            var inARow = 0;
            for (var tries = 0; tries < LIMITS.createTries; tries++) {
                while (n <= LIMITS.bandMax && taken[n])
                    n++;
                if (n > LIMITS.bandMax)
                    break;
                if (opts.signal && opts.signal.aborted)
                    return fail('cancelled', { notSent: true });
                progress(opts, { state: 'starting', phase: 'create', terminal_id: n });
                var body = { terminal_id: String(n), exclusive: true, display: String(n), wait_until_display: false, user: user };
                if (req.cwd)
                    body.cwd = req.cwd;
                // A pinned shell: the typed execute line then runs in bash whatever the computer's default shell is.
                if (req.shell === 'bash')
                    body.shell = '/bin/bash';
                var a = await call(TN(n), 'POST', '/api/v1/terminal/create', { terminal_id: String(n) }, body);
                if (a.kind === 'refused')
                    return fail('access_refused', { notSent: true });
                if (a.kind === 'not_sent')
                    return fail('unreachable', { notSent: true });
                var code = a.kind === 'answer' ? errCode(a.body) : undefined;
                if (a.kind === 'answer' && a.status === 200 && isObj(a.body) && a.body.status !== 'already_active') {
                    var inc = a.body.incarnation;
                    var okUser = a.body.user === user && typeof a.body.uid === 'number' && a.body.uid !== 0;
                    if (typeof inc !== 'string' || !INCARNATION.test(inc)) {
                        // Created, but without an incarnation it can be neither used nor deleted safely.
                        return fail('unsafe_setup', { notSent: true, terminal_id: n });
                    }
                    if (!okUser) {
                        await cleanup(n, inc);
                        return fail('unsafe_setup', { notSent: true });
                    }
                    // The answer names the shell it started; a kit that ignores the field (no echo) started another one.
                    if (req.shell === 'bash' && a.body.shell !== 'bash') {
                        await cleanup(n, inc);
                        return fail('shell_unavailable', { notSent: true });
                    }
                    return { ok: true, n: n, incarnation: inc };
                }
                if (a.kind === 'answer' && (code === 'USER_NOT_FOUND' || code === 'USER_SWITCH_UNAVAILABLE')) {
                    return fail('unsafe_setup', { notSent: true });
                }
                // A cwd the computer's user can't enter: refused before any shell started.
                if (a.kind === 'answer' && a.status === 403 && code === 'CWD_PERMISSION_DENIED')
                    return fail('folder_refused', { notSent: true });
                if (a.kind === 'answer' && (a.status === 401 || a.status === 403))
                    return fail('access_refused', { notSent: true });
                if (a.kind === 'answer' && a.status < 500 && code !== 'SESSION_EXISTS' && !(a.status === 200)) {
                    return fail('couldnt_start', { notSent: true, detail: { status: a.status, code: code } });
                }
                // 409 SESSION_EXISTS, an old-style "already_active", no answer or a 5xx: never use this id
                // (a lost create may have made it; the worst case is one idle empty terminal).
                if (a.kind !== 'answer' || a.status >= 500) {
                    outages++;
                    // Each lost create may have left an idle empty terminal: stop after a few in a row.
                    if (++inARow >= LIMITS.createOutagesInARow)
                        return fail('unreachable', { notSent: true });
                }
                else {
                    inARow = 0;
                }
                taken[n] = true;
            }
            // Only ids proven taken say the computer is full; a failed or lost create says nothing about room.
            return fail(outages > 0 ? 'unreachable' : 'too_many_apps', { notSent: true });
        }
        // ── 5. execute ─────────────────────────────────────────────────────────
        function admitted(a, incarnation, c) {
            if (a.kind !== 'answer' || a.status !== 200 || !isObj(a.body))
                return false;
            // The execute answer always names both; an answer missing either, or naming another, is not ours.
            if (a.body.incarnation !== incarnation)
                return false;
            return String(a.body.command_id) === String(c);
        }
        // A workload record is evidence about (I, C) only when it names exactly that pair.
        function isOwnRecord(w, incarnation, c) {
            return isObj(w) && w.incarnation === incarnation && String(w.command_id) === String(c);
        }
        // opts.beforeExecute(handle), when given, is awaited before each new command id leaves (the first send and each
        // one after COMMAND_ID_EXISTS, never before an identical replay): only `true` lets that id be sent.
        async function execute(n, incarnation, p, env, opts, cwd) {
            var c = randomCommandId();
            var trackLabel = 'run:' + p.kind + ':' + p.launchTag;
            for (var attempt = 0; attempt < LIMITS.commandIdTries; attempt++) {
                var body = {
                    command: p.command, wait: false, id: String(c), require_staged: true, track: true,
                    incarnation: incarnation, track_label: trackLabel, env: env,
                };
                // The command runs in cwd even when the shell's startup files left another folder.
                if (cwd)
                    body.cwd = cwd;
                // A window app keeps the kit's bounded display wait (it skips the wait when nothing can start a display).
                var query = { terminal_id: String(n) };
                if (p.opensIn !== 'window')
                    query.skip_display_wait = 'true';
                if (typeof opts.beforeExecute === 'function') {
                    var stored = false;
                    try {
                        stored = (await opts.beforeExecute(handleFor(n, incarnation, c, p))) === true;
                    }
                    catch (_e) {
                        stored = false;
                    }
                    // An earlier id was refused (COMMAND_ID_EXISTS) and this one never leaves: nothing started.
                    if (!stored)
                        return { definite: true, result: fail('not_durable', { notSent: true }) };
                    if (opts.signal && opts.signal.aborted)
                        return { definite: true, result: fail('cancelled', { notSent: true }) };
                }
                // The handle before the request leaves: a reload while execute is unanswered can still find this launch.
                progress(opts, { state: 'starting', phase: 'execute', terminal_id: n, handle: handleFor(n, incarnation, c, p) });
                var first = now();
                var a = await call(TN(n), 'POST', '/api/v1/terminal/execute', query, body);
                if (a.kind === 'refused' || a.kind === 'not_sent') {
                    return { definite: true, result: fail(a.kind === 'refused' ? 'access_refused' : 'unreachable', { notSent: true }) };
                }
                if (admitted(a, incarnation, c))
                    return { ok: true, c: c, body: a.body };
                var code = a.kind === 'answer' ? errCode(a.body) : undefined;
                var ambiguous = a.kind === 'ambiguous' || (a.kind === 'answer' && (a.status >= 500 || a.status === 200));
                if (!ambiguous) {
                    if (code === 'COMMAND_ID_EXISTS') {
                        c = randomCommandId();
                        continue;
                    }
                    if (code === 'STAGING_UNAVAILABLE')
                        return { definite: true, result: fail('staging_unavailable', { notSent: true }) };
                    if (code === 'TRACK_LIMIT')
                        return { definite: true, result: fail('too_many_apps', { notSent: true }) };
                    // 429: the terminal's execute queue is full; no record was made and nothing ran.
                    if (code === 'EXECUTE_BACKLOG_FULL') {
                        var busy = { notSent: true };
                        if (a.retryAfterMs !== undefined)
                            busy.retryAfterMs = a.retryAfterMs;
                        return { definite: true, result: fail('busy', busy) };
                    }
                    if (code === 'INCARNATION_MISMATCH')
                        return { definite: true, replaced: true, result: fail('terminal_replaced', { notSent: true }) };
                    // Refused before admission, nothing ran: a cwd the computer's user can't enter, a shell that can't run the line.
                    if (code === 'CWD_PERMISSION_DENIED')
                        return { definite: true, result: fail('folder_refused', { notSent: true }) };
                    if (code === 'SHELL_UNSUPPORTED')
                        return { definite: true, result: fail('shell_unsupported', { notSent: true }) };
                    if (a.status === 401 || a.status === 403)
                        return { definite: true, result: fail('access_refused', { notSent: true }) };
                    return { definite: true, result: fail('couldnt_start', { notSent: true, detail: { status: a.status, code: code } }) };
                }
                // No definite answer: the same request again (same I, C, body), never a new command id.
                // Replays are spaced 0.25, 0.5, then 1 s, or longer when the last answer's Retry-After
                // asks; a wait reaching past the replay window ends them, and the launch stays unknown.
                var prev = a;
                for (var r = 0; r < LIMITS.replays && now() - first < LIMITS.replayWindowMs; r++) {
                    var wait = Math.max(prev.retryAfterMs || 0, LIMITS.replaySpacingMs * Math.pow(2, r));
                    if (now() + wait - first >= LIMITS.replayWindowMs)
                        break;
                    await sleep(wait);
                    // The wait can outlast an abort or the window (an overrunning sleep): re-check before sending.
                    if ((opts.signal && opts.signal.aborted) || now() - first >= LIMITS.replayWindowMs)
                        break;
                    var again = await call(TN(n), 'POST', '/api/v1/terminal/execute', query, body);
                    if (admitted(again, incarnation, c))
                        return { ok: true, c: c, body: again.body };
                    if (again.kind === 'answer' && again.status !== 200 && again.status < 500)
                        break; // still not proof
                    prev = again;
                }
                body.env = null;
                return { unknown: true, c: c };
            }
            return { definite: true, result: fail('couldnt_start', { notSent: true }) };
        }
        // ── open ───────────────────────────────────────────────────────────────
        function progress(opts, evt) {
            if (opts && typeof opts.onProgress === 'function') {
                try {
                    opts.onProgress(evt);
                }
                catch (_e) { /* a progress listener never breaks the sequence */ }
            }
        }
        function handleFor(n, incarnation, c, p) {
            var h = {
                v: VERSION, terminal_id: n, incarnation: incarnation, command_id: c, display: n,
                launch_tag: p.launchTag, kind: p.kind, opens_in: p.opensIn,
            };
            if (computer)
                h.computer = { project: String(computer.project), computer_id: String(computerIdOf(computer)) };
            if (p.web)
                h.web = { port: p.web.port, path: p.web.path };
            if (p.title)
                h.name = p.title;
            return h;
        }
        async function open(req, opts) {
            opts = opts || {};
            var bad = checkRequest(req);
            if (bad)
                return fail(bad, { notSent: true });
            var caps = await capabilities();
            if (!caps.ok)
                return caps;
            var launchTag = hex(random(8));
            progress(opts, { state: 'starting', phase: 'resolve' });
            var a = await call(RUN, 'POST', '/api/v1/run/resolve', null, resolveBody(req, launchTag));
            if (a.kind === 'refused')
                return fail('access_refused', { notSent: true });
            if (a.kind !== 'answer')
                return fail('unreachable', { notSent: true });
            // plan() copies the values it needs; the answer is scrubbed before any path leaves this branch.
            var p = a.status === 200 ? plan(a.body) : null;
            // `opensIn` is the caller's own choice of where a plain app opens, for a source that does not say (the resolver
            // classifies only some). A starter, a web app and an OCI image keep what the resolver said.
            if (p && req.opensIn && p.kind === 'app' && !p.catalogId && p.opensIn !== 'web')
                p.opensIn = req.opensIn;
            scrubResolveAnswer(a.body);
            if (a.status !== 200)
                return resolveRefusal(a, req.app.trim());
            if (isObj(a.body) && (a.body.status === 'error' || typeof a.body.error === 'string')) {
                return fail('resolve_failed', { notSent: true });
            }
            if (isObj(a.body) && !a.body.selected && Array.isArray(a.body.candidates) && a.body.candidates.length) {
                return fail('needs_pick', { notSent: true });
            }
            if (!p)
                return fail('resolve_failed', { notSent: true });
            // A catalog entry opens only as itself: any other first match means it is not available here.
            if (req.catalog === true && p.catalogId !== req.app.trim())
                return fail('no_candidates', { notSent: true, name: req.app.trim() });
            p.launchTag = launchTag;
            var merged = mergeEnv(p, req.env);
            hideSecrets(p, merged.generated || {});
            var name = p.title || req.app.trim();
            if (merged.code)
                return fail(merged.code, { notSent: true, name: name });
            var details = { command: p.command, title: p.title, provider: p.provider, kind: p.appKind, env_names: Object.keys(merged.env) };
            if (p.opensIn === 'web') {
                var ports = await readPorts();
                if (!ports)
                    return fail('unreachable', { notSent: true });
                for (var i = 0; i < ports.length; i++) {
                    if (isTcp(ports[i]) && ports[i].port === p.web.port)
                        return fail('port_in_use', { notSent: true, name: name, details: details });
                }
            }
            var created = await createTerminal(req, opts);
            if (!created.ok)
                return created;
            var n = created.n;
            var inc = created.incarnation;
            if (opts.signal && opts.signal.aborted) {
                await cleanup(n, inc);
                return fail('cancelled', { notSent: true });
            }
            var ex = await execute(n, inc, p, merged.env, opts, req.cwd);
            merged.env = null;
            if (ex.definite) {
                if (!ex.replaced)
                    await cleanup(n, inc);
                ex.result.details = details;
                return ex.result;
            }
            var handle = handleFor(n, inc, ex.c, p);
            if (ex.unknown) {
                // The app may be running: keep the handle and the terminal; status() decides later.
                return { ok: false, state: 'unknown', code: 'start_unconfirmed', reason: 'start_unconfirmed', message: fill('start_unconfirmed'), handle: handle, details: details };
            }
            var out = { ok: true, state: 'started', code: 'started', message: fill('started', { name: name }), handle: handle, details: details };
            var w = ex.body && isOwnRecord(ex.body.workload, inc, ex.c) ? ex.body.workload : null;
            // An OCI app's `gone` workload proves nothing while its container may live: status() decides it later.
            var ociLeft = !!w && w.state === 'gone' && handle.kind === 'oci' && !(await ociGone(handle));
            if (w && !ociLeft && (w.state === 'running' || w.state === 'gone' || w.state === 'never_started' || w.state === 'unknown')) {
                // The admission answer already carries the record; report what it says, as status() would.
                var now1 = fromRecord(handle, w);
                out.state = now1.state === 'running' ? 'running' : now1.state;
                out.ok = now1.state === 'running' ? true : now1.ok;
                out.code = now1.state === 'running' ? (p.opensIn === 'terminal' ? 'running_plain' : 'running') : now1.code;
                out.message = fill(out.code, { name: name });
                if (now1.exit_code !== undefined) {
                    out.exit_code = now1.exit_code;
                    out.signal = now1.signal;
                }
                if (now1.reason)
                    out.reason = now1.reason;
            }
            if (ex.body && ex.body.replayed === true)
                out.replayed = true;
            var names = Object.keys(merged.generated);
            if (names.length)
                out.access = { name: names[0], value: merged.generated[names[0]] };
            var last = { state: out.state, phase: 'execute', handle: handle };
            if (out.exit_code !== undefined) {
                last.exit_code = out.exit_code;
                last.signal = out.signal;
            }
            progress(opts, last);
            return out;
        }
        // ── status ─────────────────────────────────────────────────────────────
        async function readWorkloads(n, incarnation, c) {
            var q = { terminal_id: String(n) };
            if (incarnation)
                q.incarnation = incarnation;
            if (c)
                q.command_id = String(c);
            var a = await call(TN(n), 'GET', '/api/v1/terminal/workloads', q);
            if (a.kind !== 'answer' || a.status !== 200 || !isObj(a.body) || !Array.isArray(a.body.workloads))
                return null;
            return a.body.workloads.filter(isObj);
        }
        function recordFor(list, h) {
            for (var i = 0; i < list.length; i++) {
                if (isOwnRecord(list[i], h.incarnation, h.command_id))
                    return list[i];
            }
            return null;
        }
        function members(rec) {
            if (!Array.isArray(rec.members))
                return [];
            return rec.members.filter(function (pid) { return isInt(pid, 1, 4194304); });
        }
        // Kind and launch tag from the record's track label: the server's evidence wins over what a stored
        // handle says (a cleanup sweeps by that tag). True when the record carried a label.
        function enrich(h, rec) {
            var m = typeof rec.track_label === 'string' ? TRACK_LABEL.exec(rec.track_label) : null;
            if (!m)
                return false;
            h.kind = m[1];
            h.launch_tag = m[2];
            return true;
        }
        // True only when two clean reads >= 3 s apart list no container with the handle's launch tag, the sweep's
        // rule: one empty listing can miss a container still being created.
        // An abort before the second read sends none and proves nothing (false).
        async function ociGone(h, signal) {
            if (!LAUNCH_TAG.test(h.launch_tag || ''))
                return false;
            for (var i = 0; i < 2; i++) {
                if (i)
                    await sleep(LIMITS.sweepCleanGapMs);
                if (signal && signal.aborted)
                    return false;
                var text = await rawExec(dockerRead(h.launch_tag));
                var ids = text === null ? null : parseDockerPs(text);
                if (!ids || ids.length)
                    return false;
            }
            return true;
        }
        async function readiness(h, pids) {
            if (!pids.length)
                return {};
            if (h.opens_in === 'window') {
                var a = await call(DN(h.display), 'GET', '/api/v1/display/windows', { displayId: String(h.display) });
                if (a.kind !== 'answer' || a.status !== 200 || !isObj(a.body) || !Array.isArray(a.body.windows))
                    return {};
                for (var i = 0; i < a.body.windows.length; i++) {
                    var w = a.body.windows[i];
                    if (isObj(w) && isInt(w.pid, 1, 4194304) && pids.indexOf(w.pid) >= 0)
                        return { ready: true };
                }
                return {};
            }
            if (h.opens_in === 'web' && h.web) {
                var ports = await readPorts();
                if (!ports)
                    return {};
                var v6 = false;
                for (var j = 0; j < ports.length; j++) {
                    var p = ports[j];
                    if (!isTcp(p) || p.port !== h.web.port || pids.indexOf(p.pid) < 0)
                        continue;
                    if (p.ip === '0.0.0.0')
                        return { ready: true };
                    if (typeof p.ip === 'string' && p.ip.indexOf(':') >= 0)
                        v6 = true;
                }
                return v6 ? { ipv6_only: true } : {};
            }
            return {};
        }
        function fromRecord(h, rec) {
            var name = h.name;
            var st = rec.state;
            if (st === 'pending')
                return { ok: true, state: 'started', code: 'started', message: fill('started', { name: name }) };
            if (st === 'running')
                return { ok: true, state: 'running' };
            if (st === 'gone') {
                var r = { ok: true, state: 'exited', exit_code: typeof rec.exit_code === 'number' ? rec.exit_code : null, signal: typeof rec.signal === 'string' ? rec.signal : null };
                r.code = r.exit_code === 0 && !r.signal ? 'done' : 'exited_error';
                r.ok = r.code === 'done';
                r.message = fill(r.code, { name: name });
                return r;
            }
            if (st === 'never_started')
                return { ok: false, state: 'not_started', code: 'not_started', message: fill('not_started', { name: name }) };
            var reason = rec.reason === 'tracker_lost' ? 'tracker_lost' : 'unknown';
            return { ok: false, state: 'unknown', code: reason, reason: reason, message: fill(reason, { name: name }) };
        }
        // expectTag: a launch tag (or undefined). A record then counts only when its track label names that tag.
        function badTag(t) {
            return t !== undefined && !(typeof t === 'string' && LAUNCH_TAG.test(t));
        }
        function tagged(rec, t) {
            var m = typeof rec.track_label === 'string' ? TRACK_LABEL.exec(rec.track_label) : null;
            return !!m && m[2] === t;
        }
        // A record at (I, C) that does not name the expected launch: evidence of another launch, never of this one.
        function foreignRecord(h) {
            return { ok: false, state: 'unknown', code: 'unknown', reason: 'foreign_record', message: fill('unknown', { name: h.name }), handle: h };
        }
        async function status(target, opts) {
            var expect = opts ? opts.expectTag : undefined;
            if (badTag(expect))
                return fail('invalid_options', { notSent: true });
            return statusOf(target, null, expect);
        }
        // A watch's abort signal also skips the readiness reads that follow the record read.
        async function statusOf(target, signal, expectTag) {
            var t = parseTarget(target);
            if (!t || !t.handle)
                return fail('invalid_handle', { notSent: true });
            var h = t.handle;
            if (!sameComputer(h))
                return fail('wrong_computer', { notSent: true });
            var list = await readWorkloads(h.terminal_id, h.incarnation, h.command_id);
            if (!list)
                return { ok: false, state: 'unknown', code: 'unreachable', reason: 'unreachable', message: fill('unreachable'), handle: h, transient: true };
            var rec = recordFor(list, h);
            if (!rec) {
                // Never "not started": a restarted kit or a wrapped ring loses records of live apps too.
                return { ok: false, state: 'unknown', code: 'unknown', reason: 'no_record', message: fill('unknown', { name: h.name }), handle: h };
            }
            if (expectTag !== undefined && !tagged(rec, expectTag))
                return foreignRecord(h);
            // An unlabelled record leaves the kind and tag unproven (a stored handle's, or none for a compact N:I:C
            // handle): the app may be an OCI app, so its end is unconfirmed.
            var labelled = enrich(h, rec);
            var r = fromRecord(h, rec);
            r.handle = h;
            // An OCI app's containers outlive its workload: ended only once two clean reads show none left. A watch
            // aborted before or between those reads sends no further one and learns nothing (a transient answer).
            if (r.state === 'exited' && (h.kind === 'oci' || !labelled)) {
                var cancelled = { ok: false, state: 'unknown', code: 'unknown', reason: 'cancelled', message: fill('unknown', { name: h.name }), handle: h, transient: true };
                if (signal && signal.aborted)
                    return cancelled;
                if (!labelled || !(await ociGone(h, signal))) {
                    if (signal && signal.aborted)
                        return cancelled;
                    return { ok: false, state: 'unknown', code: 'stop_unconfirmed', reason: 'stop_unconfirmed', message: fill('stop_unconfirmed', { name: h.name }), handle: h };
                }
            }
            if (r.state === 'running') {
                var skip = h.opens_in === 'terminal' || h.opens_in === undefined || (signal && signal.aborted);
                var rd = skip ? {} : await readiness(h, members(rec));
                if (rd.ready) {
                    r.state = 'ready';
                    r.code = 'ready';
                }
                else {
                    r.code = h.opens_in === 'window' || h.opens_in === 'web' ? 'running' : 'running_plain';
                    if (rd.ipv6_only) {
                        r.ipv6_only = true;
                        r.code = 'running_plain';
                    }
                }
                r.message = fill(r.code, { name: h.name });
            }
            return r;
        }
        // Poll status until the state settles: 1 s for 10 s, then every 3 s. Terminal apps settle at
        // `running` (they have no `ready`); a failed read is retried, not reported as a state.
        async function watch(target, opts) {
            opts = opts || {};
            var started = now();
            var limit = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 30000;
            var last = null;
            var lastState;
            if (badTag(opts.expectTag))
                return fail('invalid_options', { notSent: true });
            if (opts.signal && opts.signal.aborted) {
                // Aborted before the first read: send nothing, and claim nothing about the app.
                var t = parseTarget(target);
                if (!t || !t.handle)
                    return fail('invalid_handle', { notSent: true });
                if (!sameComputer(t.handle))
                    return fail('wrong_computer', { notSent: true });
                return { ok: false, state: 'unknown', code: 'unknown', reason: 'cancelled', message: fill('unknown', { name: t.handle.name }), handle: t.handle };
            }
            for (;;) {
                var r = await statusOf(target, opts.signal, opts.expectTag);
                if (r.code === 'invalid_handle' || r.code === 'wrong_computer')
                    return r;
                if (!r.transient || !last)
                    last = r;
                if (!r.transient && r.state !== lastState) {
                    lastState = r.state;
                    progress(opts, r);
                }
                var h = last.handle || {};
                var settled = !r.transient && (r.state === 'ready' || r.state === 'exited' || r.state === 'not_started' || r.state === 'stopped'
                    || r.state === 'unknown'
                    || (r.state === 'running' && (h.opens_in === 'terminal' || h.opens_in === undefined || r.ipv6_only)));
                if (settled)
                    return r;
                if (opts.signal && opts.signal.aborted)
                    return last;
                var elapsed = now() - started;
                if (elapsed >= limit)
                    return last;
                await sleep(elapsed < LIMITS.pollFastForMs ? LIMITS.pollFastMs : LIMITS.pollSlowMs);
                if (opts.signal && opts.signal.aborted)
                    return last; // aborted while waiting: no further read
            }
        }
        // ── close ──────────────────────────────────────────────────────────────
        // `close N`: act only when exactly one live workload with a `run:` label is in terminal N.
        // With expectTag (close's own lookup) the live record must name that tag before anything of it is adopted.
        async function findOne(n, expectTag) {
            var list = await readWorkloads(n);
            if (!list)
                return fail('unreachable', { notSent: true });
            var live = list.filter(function (w) {
                return w.state !== 'gone' && w.state !== 'never_started' && typeof w.track_label === 'string' && TRACK_LABEL.test(w.track_label)
                    && typeof w.incarnation === 'string' && INCARNATION.test(w.incarnation) && isInt(Number(w.command_id), 1, 65535);
            });
            var listed = live.map(function (w) {
                return { terminal_id: n, incarnation: w.incarnation, command_id: Number(w.command_id), state: w.state, track_label: w.track_label, handle: n + ':' + w.incarnation + ':' + Number(w.command_id) };
            });
            if (live.length === 0)
                return fail('no_app', { notSent: true });
            if (live.length > 1)
                return fail('several_apps', { notSent: true, workloads: listed });
            var h = { v: VERSION, terminal_id: n, incarnation: live[0].incarnation, command_id: Number(live[0].command_id), display: n };
            if (computer)
                h.computer = { project: String(computer.project), computer_id: String(computerIdOf(computer)) };
            if (expectTag !== undefined && !tagged(live[0], expectTag))
                return foreignRecord(h);
            enrich(h, live[0]);
            return { ok: true, handle: h };
        }
        // One signal step. A signal has no operation key and a second one is not a no-op (an app cleaning up
        // after INT may die on the next INT), so it is re-sent only when it provably never left. No answer, or a
        // 5xx, may have been delivered: `lost`, and close reads the record before it escalates.
        async function signalOnce(h, sig) {
            for (var i = 0; i < LIMITS.signalSends; i++) {
                var a = await call(TN(h.terminal_id), 'POST', '/api/v1/terminal/workloads/' + h.command_id + '/signal', { terminal_id: String(h.terminal_id) }, { incarnation: h.incarnation, signal: sig });
                if (a.kind === 'refused')
                    return { refused: true };
                if (a.kind === 'not_sent')
                    continue;
                if (a.kind !== 'answer' || a.status >= 500)
                    return { lost: true };
                if ((a.status === 200 || a.status === 202) && isObj(a.body)) {
                    // A record for another (I, C) proves nothing about ours: close keeps waiting on its own record.
                    var w = isOwnRecord(a.body.workload, h.incarnation, h.command_id) ? a.body.workload : null;
                    var failed = Array.isArray(a.body.failed) ? a.body.failed : [];
                    return {
                        rec: w,
                        gone: !!w && (w.state === 'gone' || w.state === 'never_started'),
                        never: !!w && w.state === 'never_started',
                        otherUser: failed.some(function (f) { return isObj(f) && f.reason === 'other_user'; }),
                        failed: failed.length,
                    };
                }
                return { error: true, status: a.status, code: errCode(a.body) };
            }
            return { lost: true };
        }
        // Read the record until it ends or the budget runs out: `{gone: rec}`, or `{alive}` where alive is true only
        // when the last read showed our own record still pending or running. A failed read, a missing record or an
        // `unknown` state proves nothing, and close never sends a harder signal on it.
        // With expectTag a record naming another launch ends the wait as `{foreign: true}`: it proves nothing about ours.
        async function waitGone(h, budgetMs, expectTag) {
            var until = now() + budgetMs;
            for (;;) {
                var list = await readWorkloads(h.terminal_id, h.incarnation, h.command_id);
                var rec = list ? recordFor(list, h) : null;
                if (rec && expectTag !== undefined && !tagged(rec, expectTag))
                    return { foreign: true };
                if (rec && (rec.state === 'gone' || rec.state === 'never_started'))
                    return { gone: rec };
                if (now() >= until)
                    return { alive: !!rec && (rec.state === 'running' || rec.state === 'pending') };
                await sleep(LIMITS.pollFastMs);
            }
        }
        function dockerRead(tag) {
            return 'docker ps -a --no-trunc --filter label=hoody.run.tag=' + tag + " --format '{{json .}}'";
        }
        // A raw one-shot command on terminal-0 as the session user. Returns its stdout text, or null
        // when anything about the reply is not a clean, complete, non-root, exit-0 answer.
        async function rawExec(command) {
            var a = await call(T0, 'POST', '/api/v1/terminal/execute', { ephemeral: 'true' }, { command: command, mode: 'raw', wait: true, user: user });
            if (a.kind !== 'answer' || a.status !== 200 || !isObj(a.body))
                return null;
            var b = a.body;
            if (b.user !== user || typeof b.uid !== 'number' || b.uid === 0)
                return null;
            if (b.exit_code !== 0 || b.stdout_truncated !== false || typeof b.stdout_b64 !== 'string')
                return null;
            try {
                return decodeB64Utf8(b.stdout_b64);
            }
            catch (_e) {
                return null;
            }
        }
        // Labelled containers by id; null when the read is not clean (never treated as empty).
        function parseDockerPs(text) {
            var ids = [];
            var lines = text.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line)
                    continue;
                var row;
                try {
                    row = JSON.parse(line);
                }
                catch (_e) {
                    return null;
                }
                if (!isObj(row) || typeof row.ID !== 'string' || !CONTAINER_ID.test(row.ID))
                    return null;
                ids.push(row.ID);
            }
            return ids;
        }
        // After `gone` nothing can create a new labelled container (the Docker CLI ran inside the
        // workload). Remove what exists and require two clean reads >= 3 s apart, covering a create
        // that was already in flight when the workload was killed.
        async function sweep(tag) {
            var until = now() + LIMITS.sweepBudgetMs;
            var cleanAt = null;
            for (;;) {
                var text = await rawExec(dockerRead(tag));
                var ids = text === null ? null : parseDockerPs(text);
                if (ids && ids.length === 0) {
                    if (cleanAt !== null && now() - cleanAt >= LIMITS.sweepCleanGapMs)
                        return true;
                    if (cleanAt === null)
                        cleanAt = now();
                }
                else {
                    cleanAt = null;
                    if (ids && ids.length)
                        await rawExec('docker rm -f ' + ids.join(' '));
                }
                if (now() >= until)
                    return false;
                await sleep(cleanAt !== null ? LIMITS.sweepCleanGapMs : LIMITS.pollFastMs);
            }
        }
        async function close(target, opts) {
            opts = opts || {};
            var t = parseTarget(target);
            if (!t)
                return fail('invalid_handle', { notSent: true });
            var expect = opts.expectTag;
            if (badTag(expect))
                return fail('invalid_options', { notSent: true });
            var h;
            if (t.terminal) {
                var one = await findOne(t.terminal, opts.expectTag);
                if (!one.ok)
                    return one;
                h = one.handle;
            }
            else {
                h = t.handle;
                if (!sameComputer(h))
                    return fail('wrong_computer', { notSent: true });
            }
            var name = h.name;
            var list = await readWorkloads(h.terminal_id, h.incarnation, h.command_id);
            var rec = list ? recordFor(list, h) : null;
            if (expect !== undefined) {
                // Only a read showing this launch's own tag lets close signal or delete; a failed read proves nothing.
                if (!list)
                    return { ok: false, state: 'unknown', code: 'stop_unconfirmed', reason: 'unreachable', message: fill('stop_unconfirmed', { name: name }), handle: h };
                if (rec && !tagged(rec, expect))
                    return foreignRecord(h);
            }
            var labelled = rec ? enrich(h, rec) : false;
            if (list && !rec) {
                return { ok: false, state: 'unknown', code: 'stop_unconfirmed', reason: 'no_record', message: fill('stop_unconfirmed', { name: name }), handle: h };
            }
            var ended = rec && (rec.state === 'gone' || rec.state === 'never_started');
            var neverRan = rec && rec.state === 'never_started';
            var otherUser = false;
            if (!ended) {
                var steps = [['INT', LIMITS.escalateWaitMs], ['TERM', LIMITS.escalateWaitMs], ['KILL', LIMITS.killConfirmMs]];
                for (var i = 0; i < steps.length && !ended; i++) {
                    var s = await signalOnce(h, steps[i][0]);
                    if (s.refused)
                        return fail('access_refused', { state: 'unknown', reason: 'access_refused', handle: h });
                    if (s.otherUser)
                        otherUser = true;
                    // Every later record is held to the expected tag too: a foreign one neither ends nor escalates the close.
                    if (expect !== undefined && s.rec && !tagged(s.rec, expect))
                        return foreignRecord(h);
                    if (s.gone) {
                        ended = true;
                        neverRan = s.never;
                        if (enrich(h, s.rec))
                            labelled = true;
                        break;
                    }
                    var done = await waitGone(h, steps[i][1], expect);
                    if (done.foreign)
                        return foreignRecord(h);
                    if (done.gone) {
                        ended = true;
                        neverRan = done.gone.state === 'never_started';
                        if (enrich(h, done.gone))
                            labelled = true;
                    }
                    else if (!done.alive)
                        break; // no read proved it still running: no harder signal, the stop stays unconfirmed
                }
            }
            if (!ended) {
                var why = otherUser ? 'other_user' : 'stop_unconfirmed';
                return { ok: false, state: 'unknown', code: why, reason: why, message: fill(why, { name: name }), handle: h };
            }
            // An unlabelled record may hide an OCI app (a compact handle has no kind): nothing to sweep by, unconfirmed.
            if ((h.kind === 'oci' || !labelled) && !neverRan) {
                if (!labelled || !h.launch_tag || !LAUNCH_TAG.test(h.launch_tag) || !(await sweep(h.launch_tag))) {
                    return { ok: false, state: 'unknown', code: 'stop_unconfirmed', reason: 'stop_unconfirmed', message: fill('stop_unconfirmed', { name: name }), handle: h };
                }
            }
            // Cleanup only. A 409 means the terminal was already replaced: nothing of ours to delete.
            await cleanup(h.terminal_id, h.incarnation);
            return { ok: true, state: 'stopped', code: 'stopped', message: fill('stopped', { name: name }), handle: h };
        }
        async function catalog(q) {
            var a = await call(RUN, 'GET', '/api/v1/run/catalog', typeof q === 'string' && q ? { q: q } : undefined);
            if (a.kind === 'refused')
                return fail('access_refused', { notSent: true });
            if (a.kind !== 'answer' || a.status !== 200 || !isObj(a.body) || !Array.isArray(a.body.entries)) {
                return fail(a.kind === 'answer' && a.status === 404 ? 'needs_update' : 'unreachable', { notSent: true });
            }
            return { ok: true, entries: a.body.entries.filter(isObj) };
        }
        return Object.freeze({
            capabilities: capabilities,
            catalog: catalog,
            open: open,
            status: status,
            watch: watch,
            close: close,
            find: findOne,
        });
    }
    var api = Object.freeze({
        VERSION: VERSION,
        LIMITS: LIMITS,
        STATES: STATES,
        MESSAGES: MESSAGES,
        RUN_FEATURES: Object.freeze(RUN_FEATURES.slice()),
        TERMINAL_FEATURES: Object.freeze(TERMINAL_FEATURES.slice()),
        createRunOpen: createRunOpen,
        exitCodeFor: exitCodeFor,
        parseTarget: parseTarget,
        formatHandle: formatHandle,
        message: fill,
        scrubResolveAnswer: scrubResolveAnswer,
    });
    Object.defineProperty(root, 'HoodyRunOpenCore', { value: api, writable: false, configurable: false, enumerable: false });
})(typeof globalThis !== 'undefined' ? globalThis : this);
