// Bots Work, Task cell in the terminal: what a task waits on ("Waiting to: …", a Bot needs the user) is on
// the title's line, never a second line a one-line row drops: a clock in the gutter (its label the whole sentence), a
// "Waiting" tag when it fits, the whole sentence on the tag's tip.
import { expect, test } from 'bun:test';
import { drawTest } from '../../../term/prim/testing';
import { Box, FocusRoot } from '../../../term/prim';
import { semanticsOf } from '../../../term/prim/semantics';
import { useStrings } from '@kit';
import type { Delegate } from '../data';
import strings from '../strings.en.json';
import { taskCell } from './TaskCell';

/** The cell as the Work tab's cell callback draws it: with the page's translator. */
function TaskCell({ task }: { task: Delegate }) {
  const t = useStrings(strings);
  return taskCell(task, t);
}

const ON = 'Run a command that changes files in the shop repository';
const WAIT = `Waiting to: ${ON}`;
const draw = async (width: number, waiting?: string, title = 'Draft reply to a reader') => {
  const t = await drawTest(<FocusRoot><Box width={width} height={1} dir="row" clip><TaskCell task={{ sessionId: 's1', title, state: waiting ? 'waiting' : 'working', computerId: 'c1', model: 'm', waitingOn: waiting ?? null, startedAt: '2026-11-06T10:00:00Z' } as never} /></Box></FocusRoot>, { width: width + 4, height: 3 });
  const f = await t.settle();
  const sem = JSON.stringify(semanticsOf(t.renderer as never));
  t.renderer.destroy();
  return { line: f.split('\n')[0]!.slice(0, width).trimEnd(), sem };
};

test('waiting: clock, title and "Waiting" on one line; the whole sentence in the semantics', async () => {
  const { line, sem } = await draw(40, ON);
  expect(line).toMatch(/^\S+ Draft reply to a reader +Waiting/);
  expect(sem).toContain(WAIT);
});

test('narrow: the title gives way, the clock stays (the waiting is never lost)', async () => {
  const { line, sem } = await draw(16, ON);
  expect(line).toMatch(/^\S+ Draft/);
  expect(line).toContain('…');
  expect(sem).toContain(WAIT);
});

test('not waiting: the title alone, no mark', async () => {
  const { line } = await draw(40);
  expect(line).toBe('  Draft reply to a reader');
});
