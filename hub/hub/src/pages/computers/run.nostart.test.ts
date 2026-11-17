// Why a computer that is not running offers no Start on its Run and Desktop tabs: the reason fits its state.
import { describe, expect, it } from 'vitest';
import type { Translate } from '@kit';
import { noStartReason } from './parts/menu';
import strings from './strings.en.json';

const tt = ((k: keyof typeof strings) => strings[k]) as Translate<typeof strings>;

describe('computers: the reason no Start is offered', () => {
  it('an expired computer says it expired; a stopped or paused one names the sign-in; other states say what to wait for', () => {
    expect(noStartReason({ status: 'stopped', server_expired: true }, tt)).toBe(strings['run.noStartExpired']);
    expect(noStartReason({ status: 'stopped' }, tt)).toBe(strings['run.stoppedNoStart']);
    expect(noStartReason({ status: 'paused' }, tt)).toBe(strings['run.stoppedNoStart']);
    expect(noStartReason({ status: 'stopping' }, tt)).toBe(strings['menu.waitStopping']);
    expect(noStartReason({ status: 'starting' }, tt)).toBe(strings['menu.waitStarting']);
    expect(noStartReason({ status: 'failed' }, tt)).toBe(strings['menu.restartFirst']);
  });
});
