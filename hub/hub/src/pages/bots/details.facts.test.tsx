// Vitest: the Details rail's Status is one fact list, a kit
// Facts in the spec layout (label at the start, value at the end), with no hand-built dl beside it; the link, which carries an
// action, is a setting row (a Facts list holds no control). The Settings summary is a kit SettingGroup: one row per settings
// section, its summary as the row's value and an Open action that opens that section, never a hand-built button list.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const sel = (id: string) => `c-atlas~a1b2c3d4e5f60718293a4b5c~${id}`;
const open = (id = 'chief') => renderPage(page, { path: `/bots?sel=${encodeURIComponent(sel(id))}&details=1` });
const panel = () => screen.findByRole('complementary', { name: strings['rail.details'] });
const SECTIONS = ['model', 'behaviour', 'workers', 'guardrails', 'voice', 'advanced'] as const;
const openName = (r: (typeof SECTIONS)[number]) => strings['rail.openSection'].replace('{{section}}', strings[`about.${r}`]);
// The fixture chief: asks before risky steps, helpers on Hoody models, two strict guardrails, default voices, routing off.
const CHIEF_SUMMARY: Partial<Record<(typeof SECTIONS)[number], string>> = {
  behaviour: strings['about.behaviour.ask'],
  workers: strings['about.workers.llm'],
  guardrails: strings['about.guardrails_other'].replace('{{count}}', '2').replace('{{mode}}', strings['guard.mode.strict']),
  voice: strings['voice.rail.default'],
  advanced: strings['advanced.routing.off'],
};
// The setting row that holds a control: the nearest ancestor that also shows the section's label.
const rowOf = (el: HTMLElement, label: string): HTMLElement => {
  let n: HTMLElement | null = el;
  while (n && !(n.textContent ?? '').includes(label)) n = n.parentElement;
  if (!n) throw new Error(`no row for ${label}`);
  return n;
};

describe('the Details rail', () => {
  it('Status holds one fact list, in the spec layout, with Last active and the Identifier, and no other dl', async () => {
    await open();
    const side = await panel();
    const lists = side.querySelectorAll('dl');
    expect(lists).toHaveLength(1);
    const dl = lists[0] as HTMLElement;
    expect(dl).toHaveAttribute('aria-label', strings['rail.status']);
    expect(dl.parentElement?.className ?? '').toMatch(/spec/);
    const terms = [...dl.querySelectorAll('dt')].map((d) => d.textContent);
    expect(terms).toEqual([strings['rail.lastActive'], strings['rail.id']]);
    const values = [...dl.querySelectorAll('dd')].map((d) => d.textContent ?? '');
    expect(values).toHaveLength(2);
    expect(values[0]).not.toBe('');
    expect(values[0]).not.toBe(strings['col.never']);
    expect(values[1]).toMatch(/^0192…/); // the kit's short id form (start…end)
  }, 30000);

  it('the link is a setting row in Status, named Link, whose value is the button that opens the link and keys', async () => {
    const { router } = await open();
    const side = await panel();
    const status = within(side).getByRole('group', { name: strings['rail.link'] });
    const link = within(status).getByRole('button', { name: strings['rail.linkOpen'].replace('{{status}}', strings['link.status.active']) });
    await userEvent.click(link);
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).tab).toBe('link'));
  }, 30000);

  it('a Bot with no link offers to give one in the same Link row', async () => {
    await open('digest');
    const side = await panel();
    const status = within(side).getByRole('group', { name: strings['rail.link'] });
    expect(within(status).getByRole('button', { name: strings['rail.linkGive'] })).toBeInTheDocument();
  }, 30000);

  it('Settings is a SettingGroup: a row per section with its current value and a named Open action, and no list', async () => {
    await open();
    const side = await panel();
    const group = within(side).getByRole('group', { name: strings['rail.settings'] });
    for (const r of SECTIONS) {
      const row = rowOf(within(group).getByRole('button', { name: openName(r) }), strings[`about.${r}`]);
      const want = CHIEF_SUMMARY[r];
      if (want) expect(row.textContent).toContain(want);
      // the value is more than the label and the button
      else expect((row.textContent ?? '').replace(strings[`about.${r}`], '').replace(strings['rail.open'], '').trim()).not.toBe('');
    }
    expect(group.closest('section')?.querySelector('ul')).toBeNull();
  }, 30000);

  it.each(SECTIONS)('Open on the %s row opens that settings section', async (r) => {
    const { router } = await open();
    const side = await panel();
    const group = within(side).getByRole('group', { name: strings['rail.settings'] });
    await userEvent.click(within(group).getByRole('button', { name: openName(r) }));
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).settings).toBe(r));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  }, 30000);
});
