// Get a computer's structure: what it starts from, a plate that says what you get (and the one thing missing, when
// something is), one framed group whose rows hold every required choice, then More options with its own framed groups.
// The plate follows the form: the server and the software named there are the ones the create will use, and the size
// is that server's. A project is always shown, also when the list holds one; with none, the plate says so and the
// Project row offers New project.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type * as Data from './data';
import page from './page';
import strings from './strings.en.json';

const rec = vi.hoisted(() => ({ mode: 'real' as 'real' | 'one' | 'empty', calls: [] as { project: string; body: Record<string, unknown> }[] }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  return {
    ...real,
    useProjects: () => {
      const q = real.useProjects();
      if (rec.mode === 'one') return { ...q, data: [{ id: 'pA', name: 'Alpha' }] as typeof q.data };
      if (rec.mode === 'empty') return { ...q, data: [] };
      return q;
    },
    useCreate: () => ({ ...real.useCreate(), mutateAsync: (v: { project: string; body: Record<string, unknown> }) => (rec.calls.push(v), Promise.resolve({ outcome: 'done' as const })) }),
  };
});

async function open() {
  await renderPage(page, { path: '/computers' });
  await userEvent.click((await screen.findAllByRole('button', { name: strings['action.get'] }, { timeout: 20000 }))[0] as HTMLElement);
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 20000 });
}
const plate = (d: HTMLElement) => within(d).getByRole('group', { name: strings['create.sum.label'] });
/** A fact of the plate, by its label: the text of its value. */
const fact = (d: HTMLElement, label: string) => within(plate(d)).getByText(label, { selector: 'dt' }).parentElement!.querySelector('dd')!.textContent ?? '';
const more = (d: HTMLElement) => within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) });
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const row = (el: Element) => el.closest('[data-sg-row]');

describe('Get a computer: structure', () => {
  beforeEach(() => {
    rec.mode = 'real';
    rec.calls = [];
  });

  it('reads top to bottom: what it starts from, what you get, the computer, more options; one heading style', async () => {
    const d = await open();
    const from = within(d).getByRole('radiogroup', { name: strings['create.from'] });
    const computer = within(d).getByRole('heading', { name: strings['create.g.computer'] });
    expect(before(from, plate(d))).toBe(true);
    expect(before(plate(d), computer)).toBe(true);
    expect(before(computer, more(d))).toBe(true);
    // The heading names the one group that holds every required choice.
    const group = within(d).getByRole('group', { name: strings['create.g.computer'] });
    expect(group).toContainElement(within(d).getByRole('textbox', { name: strings['field.name'] }));
    expect(group).toContainElement(within(d).getByRole('button', { name: new RegExp(`${strings['field.server']}$`) }));
    expect(group).toContainElement(within(d).getByRole('button', { name: new RegExp(`${strings['field.project']}$`) }));
    // The colour is no required choice: it waits in More options.
    expect(within(d).queryByRole('radiogroup', { name: strings['create.color'] })).toBeNull();
    // The fold says what is inside while nothing in it changed.
    expect(more(d)).toHaveTextContent(strings['create.moreWhat']);
    await userEvent.click(more(d));
    const inside = (['create.g.look', 'create.g.software', 'create.g.machine', 'create.g.access'] as const).map((k) => within(d).getByRole('heading', { name: strings[k] }));
    // One heading style (the kit group title) everywhere; the ones in the fold share a level, under More options.
    for (const h of [computer, ...inside]) expect(h).toHaveAttribute('data-hub-heading');
    expect(new Set(inside.map((h) => h.tagName)).size).toBe(1);
    expect(before(inside[0]!, inside[1]!) && before(inside[1]!, inside[2]!) && before(inside[2]!, inside[3]!)).toBe(true);
    // Every group has the same frame: the kit card around its rows.
    for (const h of [computer, ...inside]) expect(h.closest('section')?.querySelector('[data-setting-group="field"]')).not.toBeNull();
  }, 40000);

  it('every choice is a row of a group, named as before, and its help is read with it', async () => {
    const d = await open();
    const name = within(d).getByRole('textbox', { name: strings['field.name'] });
    const server = within(d).getByRole('button', { name: new RegExp(`${strings['field.server']}$`) });
    const project = within(d).getByRole('button', { name: new RegExp(`${strings['field.project']}$`) });
    for (const el of [name, server, project]) {
      expect(row(el)).not.toBeNull();
      expect(el.closest('[data-setting-group="field"]')).not.toBeNull();
    }
    expect(name).toHaveAccessibleDescription(strings['create.nameHelp']);
    expect(within(row(project) as HTMLElement).getByText(strings['create.projectHelp'])).toBeInTheDocument();
    // New project is the Project row's own button, not a link between fields.
    expect(row(within(d).getByRole('button', { name: strings['create.newProject'] }))).toBe(row(project));
    await userEvent.click(more(d));
    const colour = within(d).getByRole('radiogroup', { name: strings['create.color'] });
    expect(row(colour)).not.toBeNull();
    // The swatches offered fit one line; the colour picked at random is one of them.
    expect(within(colour).getAllByRole('radio')).toHaveLength(8);
    expect(within(colour).getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
    for (const k of ['create.hoodyKit', 'create.devKit', 'create.ai', 'create.autostart', 'create.ramdisk', 'create.kvm'] as const) expect(row(within(d).getByRole('switch', { name: strings[k] }))).not.toBeNull();
    for (const k of ['create.ssh', 'create.comment'] as const) expect(row(within(d).getByRole('textbox', { name: strings[k] }))).not.toBeNull();
    // One primary action: the footer's.
    expect(d.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  }, 40000);

  it('the plate says what the form does not ask: the size the server gives it, the system and the software', async () => {
    const d = await open();
    const server = within(d).getByRole('button', { name: new RegExp(`${strings['field.server']}$`) }).textContent ?? '';
    const sentence = plate(d).querySelector('p')!.textContent ?? '';
    expect(sentence).toMatch(/^A new computer on .+\.$/);
    // The server named is the one picked (its name is the first word after the flag in the field).
    const serverName = sentence.replace(/^A new computer on /, '').split(',')[0]!;
    expect(server).toContain(serverName);
    expect(fact(d, strings['create.sum.size'])).toMatch(/^\d+ cores.*, shared$/);
    // What the rows under it choose is not repeated as a fact.
    expect(within(plate(d)).queryByText(strings['field.project'], { selector: 'dt' })).toBeNull();
    expect(fact(d, strings['create.image'])).toBe(strings['create.imageFixed']);
    expect(fact(d, strings['create.g.software'])).toBe([strings['create.hoodyKit'], strings['create.devKit'], strings['create.ai']].join(', '));
    // Ready and starting by itself, the plate has no second line.
    expect(within(plate(d)).queryByText(strings['create.sum.stays'])).toBeNull();
    expect(plate(d).querySelector('[data-verdict-mark]')).toBeNull();
  }, 40000);

  it('the plate follows More options: software switched off leaves it, and a computer that will not start says so', async () => {
    const d = await open();
    await userEvent.click(more(d));
    await userEvent.click(within(d).getByRole('switch', { name: strings['create.ai'] }));
    expect(fact(d, strings['create.g.software'])).toBe([strings['create.hoodyKit'], strings['create.devKit']].join(', '));
    await userEvent.click(within(d).getByRole('switch', { name: strings['create.autostart'] }));
    expect(within(plate(d)).getByText(strings['create.sum.stays'])).toBeInTheDocument();
    expect(more(d)).toHaveTextContent('2 options changed');
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(rec.calls).toHaveLength(1));
    expect(rec.calls[0]!.body).toMatchObject({ ai: false, autostart: false });
  }, 40000);

  it('a single project is shown and is the one sent', async () => {
    rec.mode = 'one';
    const d = await open();
    expect(within(d).getByRole('button', { name: new RegExp(`${strings['field.project']}$`) })).toHaveTextContent('Alpha');
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(rec.calls).toHaveLength(1));
    expect(rec.calls[0]!.project).toBe('pA');
  }, 40000);

  it('with no project the plate names the one thing missing and where to fix it; Get computer cannot send', async () => {
    rec.mode = 'empty';
    const d = await open();
    expect(plate(d)).toHaveTextContent(strings['create.sum.notReady']);
    const marks = plate(d).querySelectorAll('[data-verdict-mark]');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent(strings['create.sum.noProject']);
    expect(within(plate(d)).getByText(strings['create.sum.fixProject'])).toBeInTheDocument();
    expect(within(plate(d)).queryByText(strings['field.project'], { selector: 'dt' })).toBeNull();
    const projectRow = d.querySelector('[data-create-row="project"]') as HTMLElement;
    expect(within(projectRow).getByRole('button', { name: strings['create.newProject'] })).toBeInTheDocument();
    const go = within(d).getByRole('button', { name: strings['create.go'] });
    expect(go.matches(':disabled, [aria-disabled="true"]')).toBe(true);
    await userEvent.click(go);
    expect(rec.calls).toEqual([]);
  }, 40000);

  it('a copy: the plate names the computer copied, and asks for one while none is picked', async () => {
    const d = await open();
    await userEvent.click(within(within(d).getByRole('radiogroup', { name: strings['create.from'] })).getByRole('radio', { name: new RegExp(`^${strings['create.fromCopy']}`) }));
    expect(plate(d)).toHaveTextContent(strings['create.sum.copyAny']);
    expect(within(plate(d)).getByText(strings['create.sum.copyPick'])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(`${strings['create.copyFrom']}$`) }));
    const first = (await screen.findAllByRole('radio')).at(-1) as HTMLElement;
    await userEvent.click(first);
    await vi.waitFor(() => expect(plate(d)).toHaveTextContent(/A copy of .+ on .+\./));
    expect(within(plate(d)).queryByText(strings['create.sum.copyPick'])).toBeNull();
    expect(fact(d, strings['create.sum.files'])).toMatch(/^Same as .+ has now$/);
    expect(fact(d, strings['create.sum.size'])).toMatch(/, shared$/);
    // The copy's own fields are rows of the same group as Copy from.
    const group = within(d).getByRole('group', { name: strings['create.g.computer'] });
    for (const el of [within(d).getByRole('button', { name: new RegExp(`${strings['create.copyFrom']}$`) }), within(d).getByRole('textbox', { name: strings['field.name'] }), within(d).getByRole('button', { name: new RegExp(`${strings['field.server']}$`) })]) {
      expect(group).toContainElement(el);
      expect(row(el)).not.toBeNull();
    }
  }, 40000);
});
