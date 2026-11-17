// The host's io (host-types.ts HubTermOptions.io) as the streams the renderer reads and writes (it duck-types the TTY
// parts it uses), and the host services a mount lends from it.
import { PassThrough, Writable } from 'node:stream';
import type { HubTermOptions } from '../host-types';
import type { TermHostServices } from '../env/session';

export function streamsOf(io: HubTermOptions['io']): { stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream; off: () => void } {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream & PassThrough;
  Object.assign(stdin, { isTTY: true, setRawMode: () => stdin });
  const offInput = io.input.onData((chunk) => { stdin.write(chunk); });
  const out = new Writable({ write(chunk, _enc, done) { try { io.cells.write(typeof chunk === 'string' ? chunk : chunk.toString('utf8')); done(); } catch (e) { done(e as Error); } } });
  Object.defineProperties(out, {
    isTTY: { value: true },
    columns: { get: () => io.size().cols },
    rows: { get: () => io.size().rows },
  });
  const offResize = io.onResize?.(() => { out.emit('resize'); }) ?? (() => {});
  return { stdin, stdout: out as unknown as NodeJS.WriteStream, off: () => { offInput(); offResize(); stdin.end(); } };
}

export function hostServicesOf(io: HubTermOptions['io']): TermHostServices {
  return {
    ...(io.copy ? { copy: (t: string) => io.copy?.(t) } : {}),
    ...(io.openExternal ? { openExternal: (u: string) => io.openExternal?.(u) } : {}),
  };
}
