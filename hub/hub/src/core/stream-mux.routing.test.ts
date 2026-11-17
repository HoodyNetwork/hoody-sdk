// The stream group's key holds the server, so a session stream opened for a computer on server Y
// never joins a connection opened on server X before the computer's row moved; each server carries only its own sessions.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { noteComputerRows } from './computer';
import { defineRoute } from './routes';
import { installTransport, type Transport } from './transport';
import { createStreamBudget, type StreamBudget } from './stream-budget';
import { resetStreamMux, sessionStream } from './stream-mux';
import type { StreamInput, StreamState } from './kit-io';
import { boot, R1, TARGET, UID } from './test/env';
import { installWebLocks } from './test/web-locks';

const SSE = { 'content-type': 'text/event-stream' };
let urls: URL[] = [];
const transport: Transport = {
  hoody: () => Promise.reject(new Error('not used')),
  fetch(url, init) {
    urls.push(new URL(url));
    const signal = init.signal;
    const body = new ReadableStream<Uint8Array>({
      start(x) { signal?.addEventListener('abort', () => { try { x.error(new DOMException('aborted', 'AbortError')); } catch { /* closed */ } }); },
    });
    return Promise.resolve(new Response(body, { status: 200, headers: SSE }));
  },
};
const mux = defineRoute({ method: 'GET', path: '/sessions:events', scope: 'agent', query: ['ids', 'since', 'incarnation'], stream: { id: 4096, noId: 4096 }, maxBytes: 1 << 20, timeoutMs: 20000 });
const single = defineRoute({ method: 'GET', path: '/sessions/:id/stream', scope: 'agent', query: ['since', 'incarnation'], stream: { id: 4096, noId: 1024 }, maxBytes: 1 << 20, timeoutMs: 20000 });
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };

const X = TARGET.container.server_name!;
const Y = 'sv2';
const C = TARGET.container.id;
const onY = { project: TARGET.project, container: { id: C, server_name: Y } };
const row = (server_name: string) => ({ id: C, project_id: TARGET.project.id, server_name });

let budget: StreamBudget;
beforeEach(() => {
  boot({ realm: R1 });
  urls = [];
  installTransport(transport);
  installWebLocks();
  budget = createStreamBudget({ limit: 3, reserve: 0, retryMs: 30, cutWaitMs: 40 });
});
afterEach(() => { resetStreamMux(); budget.reset(); installTransport(null); });

const open = (sid: string, target: typeof TARGET, states: StreamState[]) =>
  sessionStream({ mux, single, sid, key: sid }, { target, realm: R1, params: { id: sid }, query: {}, onEvent: () => {}, onState: (s: StreamState) => states.push(s) } as StreamInput, budget);

describe('a stream group belongs to one server', () => {
  it('A opened on X, the row moves to Y, B opened on Y: B rides its own connection to Y, never A\'s to X', async () => {
    noteComputerRows(UID, [row(X)]);
    const sa: StreamState[] = [], sb: StreamState[] = [];
    const a = open('a', TARGET, sa);
    await settle();
    const toX = () => urls.filter((u) => u.hostname.includes(`.${X}.`));
    const toY = () => urls.filter((u) => u.hostname.includes(`.${Y}.`));
    expect(toX().length, 'A is out on X').toBe(1);
    noteComputerRows(UID, [row(Y)]);
    const b = open('b', onY, sb);
    await settle();
    expect(toY().length, 'B opened its own connection on Y').toBe(1);
    expect(toY()[0]!.searchParams.get('ids')).toBe('b');
    expect(toX().every((u) => !(u.searchParams.get('ids') ?? '').split(',').includes('b')), 'B never asked of X').toBe(true);
    expect(sb.some((s) => s.state === 'closed'), 'B is not refused').toBe(false);
    a.close(); b.close();
  });
});
