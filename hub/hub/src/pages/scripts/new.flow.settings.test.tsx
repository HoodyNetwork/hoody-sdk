// Vitest (New script): the write-it-myself way keeps the magic-comment controls. The Script settings
// disclosure shows the computer's own fields, filled from exec's reading of the code's header, and a changed setting is
// put into the code by exec's print before Check. An answer that is not a known, matching edit list changes nothing.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  parse: [] as Array<{ text: string }>,
  print: [] as Array<{ text: string; set: Record<string, unknown> }>,
  parseAnswer: { outcome: 'done', data: { directives: [], problems: [] } } as { outcome: string; data?: unknown },
  // On: the parse hook holds a real pending flag over a short wait, as the live mutation does, so its own state changes re-render the flow.
  liveParse: false,
  printAnswer: (_v: { text: string; set: Record<string, unknown> }): { outcome: string; data?: unknown; error?: unknown } => ({ outcome: 'pending' }),
}));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  const React = await import('react');
  const fld = (key: string, category: string, type: string, extra: Record<string, unknown> = {}) => ({ key, directive: `@${key}`, category, type, description: `${key} help.`, ...extra });
  const schema = {
    fields: [
      fld('enabled', 'execution', 'boolean', { defaults: { when_omitted: true } }),
      fld('timeout', 'execution', 'integer', { range: { min: 0, max: 600000 } }),
      fld('mode', 'execution', 'enum', { enum_values: ['worker', 'serverless'] }),
      fld('schedule', 'execution', 'string'),
      fld('token', 'auth', 'string|string[]'),
      fld('label', 'metadata', 'string'),
    ],
  };
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1'), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2')]),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
    useCommentsSchema: () => ({ data: schema, isPending: false, isError: false, refetch: async () => undefined }),
    useCommentsParse: () => {
      const [, setBusy] = React.useState(false);
      return {
        mutateAsync: async (v: { text: string }) => {
          io.parse.push(v);
          if (!io.liveParse) return io.parseAnswer;
          setBusy(true);
          await new Promise((z) => setTimeout(z, 20));
          setBusy(false);
          return io.parseAnswer;
        },
      };
    },
    useCommentsPrint: () => ({ mutateAsync: async (v: { text: string; set: Record<string, unknown> }) => { io.print.push(v); return io.printAnswer(v); } }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import strings from './strings.en.json';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const codeBox = () => screen.getByRole('textbox', { name: strings['new.code'] }) as HTMLTextAreaElement;
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const CODE = 'export default () => new Response("notes");';

async function toWrite() {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: '/scripts/new' });
  await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
  const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
  await user.clear(address);
  await user.type(address, '/notes');
  await user.click(screen.getByRole('button', { name: strings['flow.continue'] }));
  await waitFor(() => expect(loc(r)).toMatch(/step=write$/));
  await user.clear(codeBox());
  // userEvent reads braces and brackets as key names; this code has neither.
  await user.type(codeBox(), CODE);
  await user.click(screen.getByRole('button', { name: new RegExp(strings['flow.settings.title']) }));
  return { r, user };
}

beforeEach(() => {
  clearDrafts();
  io.parse.length = 0;
  io.print.length = 0;
  io.parseAnswer = { outcome: 'done', data: { directives: [], problems: [] } };
  io.printAnswer = () => ({ outcome: 'pending' });
  io.liveParse = false;
});

describe('New script flow: Script settings on the write step', () => {
  it('shows the computer\'s fields filled from the code\'s own header; no secret, no schedule (step 2 has it)', async () => {
    io.parseAnswer = { outcome: 'done', data: { directives: [{ key: 'timeout', line: 1, value: 90000, raw: '90s', in_force: true }, { key: 'token', line: 2, redacted: true, in_force: true }], problems: [] } };
    await toWrite();
    const timeout = (await screen.findByRole('textbox', { name: strings['magic.f.timeout'] }, SLOW)) as HTMLInputElement;
    expect(timeout.value).toBe('90000');
    expect(io.parse.at(-1)?.text).toBe(CODE);
    expect(screen.getByRole('textbox', { name: strings['magic.f.label'] })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: strings['magic.f.token'] })).toBeNull();
    expect(screen.queryByText(strings['magic.f.schedule'])).toBeNull();
  });

  it('the header is read once and its fields show, while the parse request re-renders the flow with its own pending state', async () => {
    io.liveParse = true;
    io.parseAnswer = { outcome: 'done', data: { directives: [{ key: 'timeout', line: 1, value: 90000, raw: '90s', in_force: true }], problems: [] } };
    await toWrite();
    const timeout = (await screen.findByRole('textbox', { name: strings['magic.f.timeout'] }, { timeout: 2000 })) as HTMLInputElement;
    expect(timeout.value).toBe('90000');
    await new Promise((z) => setTimeout(z, 2000));
    expect(io.parse.length).toBeLessThanOrEqual(2);
  }, 40000);

  it('a field is never shown blank while the header is unread: a failed read offers Try again', async () => {
    io.parseAnswer = { outcome: 'pending' };
    await toWrite();
    expect(await screen.findByText(strings['flow.settings.unread'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: strings['magic.f.timeout'] })).toBeNull();
  });

  it('Continue puts a changed setting into the code by exec\'s print, then goes to Check with that code', async () => {
    const { r, user } = await toWrite();
    await user.type(await screen.findByRole('textbox', { name: strings['magic.f.label'] }, SLOW), 'Notes');
    io.printAnswer = (v) => {
      const out = `// @label Notes\n${v.text}`;
      return { outcome: 'done', data: { edits: [{ op: 'insert', line: 0, text: '// @label Notes' }], changed_lines: [1], removed_lines: [], verify: { lines: out.split('\n').length, sha256: sha(out) } } };
    };
    await user.click(screen.getByRole('button', { name: strings['flow.continue'] }));
    await waitFor(() => expect(loc(r)).toMatch(/step=check$/));
    expect(io.print).toEqual([{ text: CODE, set: { label: 'Notes' }, exec: expect.any(Number) }]);
    r.router.history.back();
    await waitFor(() => expect(loc(r)).toMatch(/step=write$/));
    expect(codeBox().value).toBe(`// @label Notes\n${CODE}`);
  });

  it('a setting changed after Check holds Write: browser Forward cannot skip putting it in the code', async () => {
    const { r, user } = await toWrite();
    await screen.findByRole('textbox', { name: strings['magic.f.label'] }, SLOW);
    await user.click(screen.getByRole('button', { name: strings['flow.continue'] }));
    await waitFor(() => expect(loc(r)).toMatch(/step=check$/));
    r.router.history.back();
    await waitFor(() => expect(loc(r)).toMatch(/step=write$/));
    if (!screen.queryByRole('textbox', { name: strings['magic.f.label'] })) await user.click(screen.getByRole('button', { name: new RegExp(strings['flow.settings.title']) }));
    await user.type(await screen.findByRole('textbox', { name: strings['magic.f.label'] }, SLOW), 'Notes');
    r.router.history.forward();
    await new Promise((z) => setTimeout(z, 300));
    await waitFor(() => expect(loc(r)).toMatch(/step=write$/));
    expect(io.print).toEqual([]);
  }, 40000);

  it('an unknown answer leaves the code as it was and stays on the step, saying so', async () => {
    const { r, user } = await toWrite();
    await user.type(await screen.findByRole('textbox', { name: strings['magic.f.label'] }, SLOW), 'Notes');
    await user.click(screen.getByRole('button', { name: strings['flow.continue'] }));
    expect(await screen.findByText(strings['flow.settings.unknown'], undefined, SLOW)).toBeTruthy();
    expect(loc(r)).toMatch(/step=write$/);
    expect(codeBox().value).toBe(CODE);
  });

  it('an edit list that does not match the code is not applied', async () => {
    const { r, user } = await toWrite();
    await user.type(await screen.findByRole('textbox', { name: strings['magic.f.label'] }, SLOW), 'Notes');
    io.printAnswer = () => ({ outcome: 'done', data: { edits: [{ op: 'insert', line: 0, text: '// @label Notes' }], verify: { lines: 2, sha256: sha('something else') } } });
    await user.click(screen.getByRole('button', { name: strings['flow.continue'] }));
    expect(await screen.findByText(strings['flow.settings.mismatch'], undefined, SLOW)).toBeTruthy();
    expect(loc(r)).toMatch(/step=write$/);
    expect(codeBox().value).toBe(CODE);
  });

  it('a refusal that names a field is shown on that field; the code is unchanged', async () => {
    const { user } = await toWrite();
    const timeout = await screen.findByRole('textbox', { name: strings['magic.f.timeout'] }, SLOW);
    await user.type(timeout, '5m');
    io.printAnswer = () => ({ outcome: 'failed', error: { status: 422, code: 'INVALID_VALUE', details: { directive: '@timeout' } } });
    await user.click(screen.getByRole('button', { name: strings['flow.settings.put'] }));
    expect(await screen.findByText(strings['flow.settings.refusedField'], undefined, SLOW)).toBeTruthy();
    expect(screen.getByText(strings['flow.settings.refused'])).toBeTruthy();
    expect(codeBox().value).toBe(CODE);
  });

  it('Put in the code and Discard are one row that never folds, neither of them the primary (the foot holds it), each saying why while nothing changed', async () => {
    const { user } = await toWrite();
    const label = await screen.findByRole('textbox', { name: strings['magic.f.label'] }, SLOW);
    const row = screen.getByRole('group', { name: strings['flow.settings.actions'] });
    const buttons = () => within(row).getAllByRole('button');
    expect(buttons().map((b) => b.getAttribute('data-action-id'))).toEqual(['put', 'discard']);
    for (const b of buttons()) expect(b).not.toHaveAttribute('data-variant', 'primary');
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary').map((b) => b.textContent)).toEqual([strings['flow.continue']]);
    expect(within(row).queryByRole('button', { name: 'More actions' })).toBeNull();
    for (const b of buttons()) {
      expect(b).toHaveAttribute('aria-disabled', 'true');
      expect(b).toHaveAccessibleDescription(strings['flow.settings.unchanged']);
    }
    await user.type(label, 'Notes');
    await waitFor(() => expect(buttons().map((b) => b.getAttribute('aria-disabled'))).toEqual([null, null]));
    const discard = buttons()[1];
    if (!discard) throw new Error('no Discard in the row');
    await user.click(discard);
    await waitFor(() => expect(screen.getByRole('textbox', { name: strings['magic.f.label'] })).toHaveValue(''));
    // Discard is disabled, drawn anew with its reason, and keeps the keyboard's place.
    await waitFor(() => expect(document.activeElement).toBe(buttons()[1]));
    expect(document.activeElement).toHaveAttribute('aria-disabled', 'true');
    expect(io.print).toEqual([]);
  });

  it('a value the field cannot take is caught before anything is sent', async () => {
    const { user } = await toWrite();
    await user.type(await screen.findByRole('textbox', { name: strings['magic.f.timeout'] }, SLOW), '9999999');
    await user.click(screen.getByRole('button', { name: strings['flow.settings.put'] }));
    expect(await screen.findByText(strings['magic.problem.range'], undefined, SLOW)).toBeTruthy();
    expect(io.print).toEqual([]);
  });
});
