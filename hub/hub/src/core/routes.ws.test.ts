// routes.ts `ws`: a WebSocket route is declared only as an agent GET with no other leg's
// flag, and every other leg (api, download, stream, upload, run, sendFile) refuses it unsent; socket.ts builds only ws routes.
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import { download, run, stream, upload } from './kit-io';
import { buildRequest, buildSocketRequest, defineRoute, type RouteSpec } from './routes';
import { botVoiceRoute } from './socket';
import { RANKS } from './stream-budget';
import { sendFile } from './upload';
import { boot, calls, R1, TARGET } from './test/env';

beforeEach(() => { boot({ realm: R1 }); });

const base: RouteSpec = { method: 'GET', path: '/bots/:id/voice', scope: 'agent', realm: 'bot', ws: true };

describe('routes ws flag', () => {
  it('is accepted only on an agent GET without another leg\'s flag, body, key, headers or bounds', () => {
    expect(() => defineRoute(base)).not.toThrow();
    const bad: Array<Partial<RouteSpec>> = [
      { method: 'POST' }, { scope: 'kit', kit: 'exec', index: 0, realm: undefined }, { scope: 'base', realm: undefined }, { stream: { id: 1, noId: 1 }, maxBytes: 9 },
      { idem: true }, { secret: true }, { maxBytes: 10 }, { timeoutMs: 10 }, { framed: false }, { readsEtag: true }, { readsStatus: true },
      { cwd: true }, { refuses: ['x'] }, { tickets: { journal: 'required' } },
    ];
    for (const b of bad) expect(() => defineRoute({ ...base, ...b } as RouteSpec), JSON.stringify(b)).toThrow('ROUTE_INVALID');
    expect(() => defineRoute({ ...base, ws: false as unknown as true })).toThrow('ROUTE_INVALID');
  });
  it('builds through buildSocketRequest only; buildRequest refuses it, and buildSocketRequest refuses any other route', () => {
    const plain = defineRoute({ method: 'GET', path: '/bots/:id', scope: 'agent', realm: 'bot' });
    expect(buildRequest(botVoiceRoute, { params: { id: 'b1' } })).toEqual({ refused: 'ROUTE_NOT_ALLOWED' });
    expect(buildSocketRequest(plain, { params: { id: 'b1' } })).toEqual({ refused: 'ROUTE_NOT_ALLOWED' });
    expect(buildSocketRequest(botVoiceRoute, { params: { id: 'b1' }, query: { mode: 'ptt' } })).toMatchObject({ url: '/bots/b1/voice?mode=ptt' });
  });
  it('is refused unsent by api, download, stream, upload, run and sendFile', async () => {
    const input = { params: { id: 'b1' }, target: TARGET, realm: R1 };
    await expect(api(botVoiceRoute, input)).rejects.toMatchObject({ kind: 'not_sent', code: 'ROUTE_NOT_ALLOWED' });
    await expect(download(botVoiceRoute, { ...input, maxBytes: 10 })).rejects.toMatchObject({ code: 'ROUTE_NOT_ALLOWED', notSent: true });
    expect(stream(botVoiceRoute, { ...input, onEvent: () => {} }).refused).toBe('ROUTE_NOT_ALLOWED');
    await expect(upload(botVoiceRoute, { ...input, body: new ReadableStream(), contentType: 'audio/webm' })).rejects.toMatchObject({ code: 'ROUTE_NOT_ALLOWED', notSent: true });
    await expect(run(botVoiceRoute, TARGET, '/bots/b1/voice')).rejects.toMatchObject({ code: 'ROUTE_NOT_ALLOWED', notSent: true });
    expect(await sendFile(botVoiceRoute, { ...input, file: new Blob(['x']), create: true, beforeSend: () => {} } as Parameters<typeof sendFile>[1])).toMatchObject({ outcome: 'not_sent', code: 'ROUTE_NOT_ALLOWED' });
    expect(calls).toEqual([]);
  });
  it('the stream budget ranks voice right after open', () => {
    expect(RANKS).toEqual(['changes', 'open', 'voice', 'focused', 'dock', 'visible', 'bot']);
  });
});
