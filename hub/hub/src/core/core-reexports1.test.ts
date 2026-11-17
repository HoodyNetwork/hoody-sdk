// The index re-exports realm's onAuthPurge and
// script-asks' version subscription as subscribeScriptAsksVersion (same functions, no behaviour change).
import { beforeEach, describe, expect, it } from 'vitest';
import * as core from './index';
import { onAuthPurge } from './realm';
import { dropScriptAsks, putScriptAsk, subscribeVersion, type ScriptAsk } from './script-asks';
import { boot, R1 } from './test/env';

const ask = (askId: string): ScriptAsk => ({
  askId, compId: 'comp-1', path: 'scripts/a.ts', realm: R1, owner: null, sessionId: null, turnId: null,
  phase: 'create', sentAt: 1000, createKey: 'hub-ck-' + askId, turnKey: 'hub-tk-' + askId,
});

beforeEach(() => { boot({ realm: R1 }); });

describe('core-reexports1', () => {
  it('index re-exports the very functions', () => {
    expect(core.onAuthPurge).toBe(onAuthPurge);
    expect(core.subscribeScriptAsksVersion).toBe(subscribeVersion);
  });
  it('subscribeScriptAsksVersion hears this tab\'s own writes, a drop included, until unsubscribed', async () => {
    let n = 0;
    const off = core.subscribeScriptAsksVersion(() => { n += 1; });
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const afterPut = n;
    expect(afterPut).toBeGreaterThan(0);
    expect(await dropScriptAsks([ask('a1')])).toBe('ok');
    expect(n).toBeGreaterThan(afterPut);
    off();
    const before = n;
    expect(await putScriptAsk(ask('a2'), null)).toBe('ok');
    expect(n).toBe(before);
  });
});
