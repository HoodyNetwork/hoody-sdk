// A copy-link entry whose link is unknown (no server or proxy domain) is off with its own reason, never a bare disabled
// item.
import { describe, expect, it, vi } from 'vitest';
import type { Translate } from '@kit';
import { fixtureWorld } from '@core';
import { computerMenu } from './parts/menu';
import strings from './strings.en.json';
import type { Computer } from './types';

vi.mock('./urls', () => ({ programUrl: () => '' }));

const tt = ((k: keyof typeof strings) => strings[k]) as Translate<typeof strings>;

describe('computers: copy-link entries without their link', () => {
  it('Copy terminal URL and Copy agent URL are off, each with its reason', () => {
    const entries = computerMenu(fixtureWorld.computers[0] as unknown as Computer, { has: () => true } as never, true, tt, () => {});
    for (const [id, key] of [['copyTerminal', 'menu.noTerminal'], ['copyAgent', 'menu.noAgent']] as const) {
      const e = entries.find((x) => x !== '-' && x.id === id) as { isDisabled?: boolean; disabledReason?: string };
      expect(e.isDisabled).toBe(true);
      expect(e.disabledReason).toBe(strings[key]);
    }
  });
});
