// The real Api's terminal calls for one setup press (termOn): each goes to the computer shown when termOn() was asked,
// also after core shows another one. The page's plain terminal calls go to the computer shown at the send.
import { answers, bootFixtureCore, capture, reply } from '@core';
import { setTarget } from '@core/ctx';
import { describe, expect, it } from 'vitest';
import { coreApi } from './coreApi';
import { routes } from './routes';

const A = { project: { id: 'p1' }, container: { id: 'c-first', server_name: 'sv1' } };
const B = { project: { id: 'p1' }, container: { id: 'c-second', server_name: 'sv1' } };
const OWNED = { n: 8001, inc: 'inc-1' };

describe('coreApi termOn', () => {
  it('a close sent after another computer is shown still goes to the first one; the plain call goes to the shown one', async () => {
    const seen: Array<[string, string | undefined]> = [];
    const note = (name: string) => (req: { target: { container: { id: string } } | null }) => {
      seen.push([name, req.target?.container.id]);
      return answers.ok({});
    };
    bootFixtureCore({ rules: [reply(routes.termDelete, note('delete')), reply(routes.termWrite, note('write'))] });
    setTarget(A);
    const api = coreApi();
    const press = api.termOn?.();
    expect(press).toBeDefined();
    setTarget(B);
    expect(capture().target?.container.id).toBe('c-second');
    await press?.termWrite(OWNED, 'x');
    await press?.termDelete(OWNED);
    await api.termDelete(OWNED);
    expect(seen).toEqual([['write', 'c-first'], ['delete', 'c-first'], ['delete', 'c-second']]);
  });

  it('given a computer, the calls go to that one, not to the one shown when it is asked', async () => {
    const seen: Array<string | undefined> = [];
    bootFixtureCore({ rules: [reply(routes.termWrite, (req) => { seen.push(req.target?.container.id); return answers.ok({}); })] });
    setTarget(B);
    await coreApi().termOn?.(A).termWrite(OWNED, 'x');
    expect(seen).toEqual(['c-first']);
  });
});
