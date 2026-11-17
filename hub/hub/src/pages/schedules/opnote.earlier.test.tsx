// Vitest: the earlier-send note of every action. Only cron's pause shares its lock's sender
// with saves, so only it says the earlier change may be a different one (op.earlierShared); every other action, curl's and
// a loop's pause included, says an earlier try of the same action (op.earlier). A selector such as act.endsWith('pause')
// fails here.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@app/testing';
import type { Act } from './logic';
import { OpNote } from './parts/OpNote';
import strings from './strings.en.json';

afterEach(cleanup);

// A record over every Act: a new action added to the union fails to compile until it is listed here.
const EVERY: Record<Act | 'save', true> = {
  save: true, create: true, edit: true, pause: true, del: true, run: true, 'exec.run': true,
  'curl.pause': true, 'curl.edit': true, 'curl.del': true, 'loop.pause': true, 'loop.run': true, 'loop.del': true,
};
const ACTS = Object.keys(EVERY) as Array<Act | 'save'>;
const has = (key: 'op.earlier' | 'op.earlierShared'): boolean => screen.queryAllByText((t) => t.includes(strings[key])).length > 0;

describe('schedules: an earlier send\'s note names the right lock for each action', () => {
  it.each(ACTS)('%s', (act) => {
    render(<OpNote op={{ act, status: 'unknown', earlier: true }} onCheck={() => {}} onDismiss={() => {}} />);
    const shared = act === 'pause';
    expect([act, has('op.earlierShared'), has('op.earlier')]).toEqual([act, shared, !shared]);
  });
});
