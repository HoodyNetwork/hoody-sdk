// Vitest: the Magic comments panel's layout and words. How it runs and Access are open,
// titled setting groups; every other category is its own titled group under one More settings fold. Every setting the Hub
// knows has a plain label and Hub help in plain words, and its `@directive` as the row's one code line; no row repeats its group's
// name; a setting the computer says has no effect is no control (read-only under No longer used while the script still has
// its line). A switch with no line shows what the computer runs with, so it can be turned off. Units and examples show
// as placeholders, and a list's default names what applies.
import { CoreQueryProvider, queryClient } from '@core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, TARGET, type Reply } from '@core/test/env';
import { MagicPanel } from './parts/MagicPanel';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const S = strings as Record<string, string>;
const PATH = 'default/1/a.ts';
const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: PATH, name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [{ path: PATH }], summary: {}, aliases: [], deleted: [] } as unknown as CompScripts;

// As hoody-exec lists them (its own schema): no stated default (when_omitted null), the run-time one beside it.
const fld = (key: string, category: string, type: string, description: string, runtime: unknown = null, extra: object = {}) => ({ key, directive: `@${key}`, category, type, description, defaults: { when_omitted: null, runtime, sdk_import: null }, ...extra });
const FIELDS = [
  fld('enabled', 'execution', 'boolean', 'Enable or disable script execution.', true),
  fld('mode', 'execution', 'enum', 'Execution model for the script.', 'serverless', { enum_values: ['worker', 'serverless'] }),
  fld('timeout', 'execution', 'integer', 'Script timeout. A bare number is MILLISECONDS.', 3600000),
  fld('await-promises', 'execution', 'boolean', 'No effect: a returned promise is always awaited and its resolved value is the response.', true),
  fld('concurrent', 'execution', 'boolean|integer', 'Concurrency policy: true, false, or a max concurrency integer.', true),
  fld('websocket', 'execution', 'boolean', 'Enable WebSocket mode for the script.', false),
  fld('websocket-pre', 'execution', 'boolean', "Run the directory's pre.js once per WebSocket upgrade, before the handshake (default true).", true),
  fld('schedule', 'execution', 'string', 'Cron expression (5-field).'),
  fld('schedule-timeout', 'execution', 'integer', 'Per-fire wall-clock timeout.', 30000),
  fld('token', 'auth', 'string|string[]', 'Shared secret token for endpoint authentication.'),
  fld('description', 'metadata', 'string', 'Human-readable description for the script.'),
  fld('log-level', 'logging', 'enum', 'Logging verbosity.', 'standard', { enum_values: ['none', 'minimal', 'standard', 'full', 'debug'] }),
  fld('cors', 'cors', 'string|null', 'CORS origin strategy.'),
  fld('ai', 'ai', 'boolean', 'Enable or disable AI helpers.', true),
  fld('remote-messages', 'remote', 'boolean', 'Allow remote messages.', false),
];
let stored: Record<string, unknown> = {};
const reply = (url: string): Reply => {
  if (url.includes('/magic-comments/schema')) return { status: 200, body: { schema_version: '1.0.0', total_fields: FIELDS.length, parse_window_lines: 50, unknown_keys_behavior: 'ignored-by-serializer', defaults_context: { when_omitted: 'x', runtime: 'x', sdk_import: 'x' }, categories: {}, fields: FIELDS } };
  if (url.includes('/magic-comments/read')) return { status: 200, body: { path: PATH, resolvedPath: PATH, revision: 'abcdef0123456789', comments: stored, warnings: [] } };
  return { status: 200, body: { data: {} } };
};
const mount = () => render(<MagicPanel item={item} comp={comp} editable onChanged={() => undefined} />, { wrapper: CoreQueryProvider });
const group = (name: string) => screen.findByRole('group', { name }, { timeout: 8000 });
const more = () => screen.findByRole('button', { name: new RegExp(S['magic.more']!) }, { timeout: 8000 });

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  stored = {};
  onFetch((c) => reply(c.url));
  setTarget(TARGET);
});

describe('Magic comments: groups', () => {
  it('How it runs and Access are open titled groups; the rest are titled groups under one closed More settings fold', async () => {
    mount();
    expect(await group(S['magic.cat.execution']!)).toBeTruthy();
    expect(await group(S['magic.cat.auth']!)).toBeTruthy();
    const fold = await more();
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('group', { name: S['magic.cat.metadata'] })).toBeNull();
    await userEvent.click(fold);
    for (const c of ['metadata', 'logging', 'cors', 'ai', 'remote']) expect(await group(S[`magic.cat.${c}`]!)).toBeTruthy();
  }, 40000);

  it('no row is named like its group, and the run model reads in plain words with its default', async () => {
    mount();
    const g = await group(S['magic.cat.execution']!);
    expect(within(g).queryByText(S['magic.cat.execution']!, { selector: '[data-sg-row] *' })).toBeNull();
    expect(within(g).getByText(S['magic.f.mode']!)).toBeTruthy();
    const picker = within(g).getByRole('button', { name: new RegExp(S['magic.f.mode']!) });
    expect(picker.textContent).toContain(S['magic.defaultIs']!.replace('{{value}}', S['magic.e.mode.serverless']!));
  }, 40000);
});

describe('Magic comments: rows', () => {
  it('every known setting has its plain label and Hub help, and its @directive as the one code line of its row', async () => {
    mount();
    await userEvent.click(await more());
    for (const f of FIELDS.filter((x) => x.key !== 'await-promises')) {
      const label = S[`magic.f.${f.key}`];
      expect(label, f.key).toBeTruthy();
      // The row's own label, not a switch's On/Off words (a switch draws them in its <label>).
      await screen.findAllByText(label!, { selector: '[data-sg-row] *' });
      const row = screen.getAllByText(label!, { selector: '[data-sg-row] *' }).find((el) => !el.closest('label'))!.closest('[data-sg-row]')!;
      expect(row.textContent, f.key).toContain(S[`magic.h.${f.key}`]!);
      expect(row.textContent, f.key).not.toContain(f.description);
      // The line as written is the row's own code line, once; the help says nothing about the code.
      const code = row.querySelectorAll('[data-sg-code]');
      expect(code, f.key).toHaveLength(1);
      expect(code[0]!.textContent, f.key).toBe(f.directive);
      expect(row.textContent!.split(f.directive).length - 1, f.key).toBe(1);
      expect(row.textContent, f.key).not.toMatch(/in the code/i);
    }
  }, 40000);

  it('every row is the same shape: a field or switch is described by its help, and a secret keeps its buttons in the row\'s action cell', async () => {
    stored = { token: '[REDACTED]' };
    mount();
    const g = await group(S['magic.cat.execution']!);
    for (const el of [within(g).getByRole('textbox', { name: S['magic.f.timeout'] }), within(g).getByRole('switch', { name: S['magic.f.enabled'] }), within(g).getByRole('button', { name: new RegExp(S['magic.f.mode']!) })]) {
      const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
      const row = el.closest('[data-sg-row]')!;
      expect(ids.some((id) => row.querySelector(`#${CSS.escape(id)}`)?.textContent === S[`magic.h.${row.querySelector('[data-sg-code]')!.textContent!.slice(1)}`])).toBe(true);
    }
    const access = await group(S['magic.cat.auth']!);
    const key = within(access).getByText(S['magic.f.token']!).closest('[data-sg-row]')!;
    const make = within(access).getByRole('button', { name: S['key.replace'] });
    expect(make.closest('[data-sg-action]')?.parentElement).toBe(key);
    expect(within(access).getByRole('button', { name: S['magic.secretRemove'] }).closest('[data-sg-action]')?.parentElement).toBe(key);
    // Where the key stands is the row's value, in the same cell every other row keeps its control in.
    expect(within(key as HTMLElement).getByText(S['magic.secretSet']!).closest('[data-sg-row] > *')).toBe(key.children[1]);
    expect(make.closest('[data-sg-row] > *')).toBe(key.children[2]);
  }, 40000);

  it('a time limit shows its unit as an example', async () => {
    mount();
    const g = await group(S['magic.cat.execution']!);
    expect(within(g).getByRole('textbox', { name: S['magic.f.timeout'] }).getAttribute('placeholder')).toBe(S['magic.p.timeout']);
    expect(within(g).getByRole('textbox', { name: S['magic.f.schedule-timeout'] }).getAttribute('placeholder')).toBe(S['magic.p.schedule-timeout']);
  }, 40000);

  it('a switch with no line shows what the computer runs with, and turning it off is a change', async () => {
    mount();
    const g = await group(S['magic.cat.execution']!);
    const pre = within(g).getByRole('switch', { name: S['magic.f.websocket-pre'] }) as HTMLInputElement;
    expect(pre.checked).toBe(true);
    await userEvent.click(pre);
    expect(screen.getByRole('button', { name: S['magic.review'] }).hasAttribute('disabled') || screen.getByRole('button', { name: S['magic.review'] }).getAttribute('aria-disabled') === 'true').toBe(false);
  }, 40000);
});

describe('Magic comments: a setting with no effect', () => {
  it('is no control; while the script still has its line it shows read-only under No longer used', async () => {
    stored = { 'await-promises': true };
    mount();
    const g = await group(S['magic.retired']!);
    expect(within(g).getByText(S['magic.f.await-promises']!)).toBeTruthy();
    expect(within(g).getByText(S['magic.on']!)).toBeTruthy();
    expect(g.querySelector('[data-sg-code]')?.textContent).toBe('@await-promises');
    expect(screen.queryByRole('switch', { name: S['magic.f.await-promises'] })).toBeNull();
  }, 40000);

  it('is not shown at all when the script has no line for it', async () => {
    mount();
    await group(S['magic.cat.execution']!);
    expect(screen.queryByText(S['magic.f.await-promises']!)).toBeNull();
    expect(screen.queryByRole('group', { name: S['magic.retired'] })).toBeNull();
  }, 40000);
});
