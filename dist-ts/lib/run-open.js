/**
 * Open an app in a computer — `box.run.open()`, `getStatus()`, `wait()`, `findOpen()`, `canOpen()` and `close()`.
 * Browser-safe (no Node imports). Maintained in lib/, not generated.
 *
 * The machine is lib/run-open-core.js, shared with the Hub (which loads its own copy of that
 * file) and driven by the CLI's `hoody run <app> --open` too. This file only gives
 * it a transport over this client and types for its results. Hoody Run (`run-1`) only resolves
 * what to run; the terminal kit creates the terminal, runs the app as a tracked workload and
 * reports its state. See the core's header for the evidence each state needs.
 *
 * Every request goes out once (`retries: 0`): the core decides what may be re-sent (an execute
 * only identically, a signal only when it provably never left) and what a lost answer means. A request that failed before
 * it left (an unbuildable URL) is reported to the core as not sent.
 *
 * The core's catalog() has no method here: `box.run.catalog` is the generated catalog service of the
 * same Hoody Run route (`box.run.catalog.list({ q })`), and a prototype method could not show through it.
 */
import './run-open-core.js';
import { RunService } from '../generated/run/run.service.js';
import { isApiError } from '../generated/errors.js';
import { ownerOf } from './service-owner.js';
import { retireMethods } from './retired-accessor.js';
/** The shared core (lib/run-open-core.js), as the global it defines. */
export function runOpenCore() {
    return globalThis.HoodyRunOpenCore;
}
function notSent(error) {
    return Object.assign(error instanceof Error ? error : new Error(String(error)), { notSent: true });
}
/** A service of the kit's namespace that builds its URLs: the namespace itself, else its `kit` service. */
function kitService(namespace, name) {
    const ns = namespace;
    if (ns && typeof ns.buildTemplateUrl === 'function')
        return ns;
    if (ns?.kit && typeof ns.kit.buildTemplateUrl === 'function')
        return ns.kit;
    throw new Error('run.open: this client has no ' + name + ' kit');
}
function machineFor(run) {
    const client = ownerOf(run, 'run.open');
    const services = {
        run: run,
        terminal: kitService(client.terminal, 'terminal'),
        display: kitService(client.display, 'display'),
    };
    const vars = services.run.defaultUrlTemplateVariables ?? {};
    if (vars.projectId === undefined || vars.computerId === undefined) {
        throw new Error('run.open needs a computer-scoped client (client.withComputer(...))');
    }
    const send = async (target, method, path, query, body) => {
        let url;
        const svc = services[target.kit];
        try {
            url = svc.buildTemplateUrl(path, { serviceIndex: target.index });
            if (!/^https?:\/\//.test(url))
                throw new Error('run.open: no kit URL for ' + target.kit + '-' + target.index);
        }
        catch (e) {
            throw notSent(e);
        }
        try {
            const data = { retries: 0, responseIsFinal: true, rawResponse: true, cache: false };
            if (query)
                data.query = query;
            if (body !== undefined)
                data.body = body;
            return { status: 200, body: await svc.http.request(method, url, data) };
        }
        catch (e) {
            // An HTTP answer is an answer, whatever its status; anything else is "no answer".
            if (isApiError(e) && e.status > 0) {
                const retryAfterMs = e.retryAfterMs;
                return { status: e.status, body: e.response, ...(typeof retryAfterMs === 'number' ? { retryAfterMs } : {}) };
            }
            throw e;
        }
    };
    return runOpenCore().createRunOpen({
        send,
        computer: { project: String(vars.projectId), computer_id: String(vars.computerId) },
    });
}
const PATCHED = Symbol.for('hoody.run-open.patched');
/**
 * Install `open()`, `getStatus()`, `wait()`, `findOpen()`, `canOpen()` and `close()` on the run service. Runs once
 * when this module loads; a second call does nothing.
 */
export function patchRunOpenExtensions() {
    const proto = RunService.prototype;
    if (proto[PATCHED])
        return;
    proto[PATCHED] = true;
    proto.open = function open(request, options) {
        return machineFor(this).open(request, options);
    };
    proto.getStatus = function getStatus(handle, options) {
        return machineFor(this).status(handle, options);
    };
    proto.wait = function wait(handle, options) {
        return machineFor(this).watch(handle, options);
    };
    proto.findOpen = async function findOpen(terminal, options) {
        const core = runOpenCore();
        const t = core.parseTarget(terminal);
        if (typeof terminal !== 'number' || !t || !('terminal' in t)) {
            return { ok: false, code: 'invalid_handle', message: core.message('invalid_handle'), notSent: true };
        }
        // The core's tag rule (16 hex digits, LAUNCH_TAG): getStatus(), wait() and close() refuse a malformed one the same way.
        const tag = options?.expectTag;
        if (tag !== undefined && !(typeof tag === 'string' && /^[0-9a-f]{16}$/.test(tag))) {
            return { ok: false, code: 'invalid_options', message: core.message('invalid_options'), notSent: true };
        }
        return machineFor(this).find(t.terminal, tag);
    };
    proto.canOpen = function canOpen() {
        return machineFor(this).capabilities();
    };
    proto.close = function close(target, options) {
        return machineFor(this).close(target, options);
    };
}
patchRunOpenExtensions();
// Renamed; each old name refuses, naming the new method.
retireMethods(RunService.prototype, 'run', { status: 'run.getStatus()', watch: 'run.wait()' });
