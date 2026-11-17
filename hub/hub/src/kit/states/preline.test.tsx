// A line break written into a field or Switch description, setting help, Band text, EmptyState body,
// OutcomeBanner body, Dialog body, Disclosure description, Drawer subtitle or a list option's description shows as a new line
// (white-space: pre-line); text without one wraps exactly as before. jsdom has no layout, so the
// proof is in two parts: each surface's rule carries pre-line, and the text reaches the element holding that rule
// whole (its "\n" kept, no <br> or extra element added), so the browser breaks it there and nowhere else.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import type { ReactElement } from 'react';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Disclosure } from '../controls/Disclosure';
import { Switch, TextField } from '../forms/fields';
import { DateTimeField } from '../forms/DateTimeField';
import { RadioGroup, Select } from '../forms/more';
import { SettingGroup } from '../forms/SettingGroup';
import { SettingRow } from '../forms/SettingRow';
import { Dialog } from '../overlays/Dialog';
import { Drawer } from '../overlays/Drawer';
import { Band } from './Band';
import { EmptyState, OutcomeBanner } from './States';

const rule = (file: string, sel: string) => {
  const css = readFileSync(join(__dirname, '..', file), 'utf8');
  return css.match(new RegExp(`^\\.${sel} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
};

describe('kit text surfaces keep a written line break', () => {
  it.each([
    ['forms/fields.module.css', 'description'],
    ['forms/SettingRow.module.css', 'help'],
    ['forms/SettingGroup.module.css', 'help'],
    ['states/Band.module.css', 'text'],
    ['states/States.module.css', 'emptyBody'],
    ['states/States.module.css', 'outcomeBody'],
    ['forms/fields.module.css', 'switchDesc'],
    ['overlays/Dialog.module.css', 'body'],
    ['controls/Disclosure.module.css', 'description'],
    ['forms/more.module.css', 'optionDesc'],
    ['overlays/Drawer.module.css', 'subtitle'],
  ])('%s .%s keeps line breaks and still wraps', (file, sel) => {
    const r = rule(file, sel);
    expect(r).toMatch(/white-space:\s*pre-line;/);
    expect(r).not.toMatch(/nowrap|white-space:\s*pre;/);
  });

  // [class part, element, selector when the class part alone is not unique]
  const surfaces: [string, (text: string) => ReactElement, string?][] = [
    ['description', (text) => <TextField label="Name" description={text} />],
    ['description', (text) => <DateTimeField label="From" value={null} onChange={() => undefined} description={text} />],
    ['help', (text) => <SettingRow label="Region" help={text}>x</SettingRow>],
    ['help', (text) => <SettingGroup label="Server"><SettingRow label="Region" help={text}>x</SettingRow></SettingGroup>],
    ['switchDesc', (text) => <Switch label="Block" description={text} />],
    ['body', (text) => <Dialog isOpen onOpenChange={() => undefined} title="Turn it off?" body={text} />, 'div[id][class*="body"]'],
    ['description', (text) => <Disclosure title="Metadata" description={text}>inside</Disclosure>],
    ['optionDesc', (text) => <RadioGroup label="Pick" options={[{ value: 'a', label: 'A', description: text }]} value="a" onChange={() => undefined} />],
    ['text', (text) => <Band>{text}</Band>],
    ['emptyBody', (text) => <EmptyState title="Nothing here" body={text} />],
    ['outcomeBody', (text) => <OutcomeBanner kind="failed" title="Not saved" body={text} />],
  ];

  it.each(surfaces)('.%s: a string with a line break reaches its element whole, as two lines of one text', (cls, el, sel) => {
    render(el('First line.\nSecond line.'));
    const node = document.querySelector(sel ?? `[class*="${cls}"]`);
    expect(node).not.toBeNull();
    expect(node!.textContent).toBe('First line.\nSecond line.');
    expect(node!.querySelector('br')).toBeNull();
    expect(node!.textContent!.split('\n')).toHaveLength(2);
  });

  it.each(surfaces)('.%s: a string without one renders unchanged', (cls, el, sel) => {
    render(el('One plain sentence that wraps as before.'));
    const node = document.querySelector(sel ?? `[class*="${cls}"]`);
    expect(node!.textContent).toBe('One plain sentence that wraps as before.');
    expect(node!.textContent).not.toContain('\n');
  });

  // An option's description shows only in the open list, so open it and read the option itself.
  it.each([
    ['First line.\nSecond line.', 2],
    ['One plain sentence that wraps as before.', 1],
  ])('.optionDesc of an open Select option: %j reaches it whole', async (text, lines) => {
    render(<Select label="Plan" options={[{ value: 'a', label: 'Small', description: text }]} value="a" onChange={() => undefined} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Plan/ }));
    const node = within(screen.getByRole('option', { name: /Small/ })).getByText((_, el) => /optionDesc/.test(el?.className ?? ''));
    expect(node.textContent).toBe(text);
    expect(node.querySelector('br')).toBeNull();
    expect(node.textContent!.split('\n')).toHaveLength(lines);
  });

  // The Drawer subtitle was one line cut with an ellipsis, so a long lede lost its end.
  const LONG =
    'Paste the public key of the computer you will connect from. It is added to the account you pick, and then that computer can sign in over SSH with no password, until you remove it there.';
  const drawer = (subtitle: string) =>
    createRouter({
      routeTree: createRootRoute({
        component: () => <Drawer resizeKey="test-preline-drawer" isOpen onOpenChange={() => undefined} title="Add an SSH key" subtitle={subtitle}>body</Drawer>,
      }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
  const openDrawer = async (subtitle: string) => {
    const router = drawer(subtitle);
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    return within(screen.getByRole('dialog')).getByText((_, el) => /subtitle/.test(el?.className ?? ''));
  };

  it('Drawer .subtitle: a 185-character lede renders whole, never cut or ellipsized', async () => {
    expect(LONG).toHaveLength(185);
    const r = rule('overlays/Drawer.module.css', 'subtitle');
    expect(r).not.toMatch(/text-overflow|overflow:\s*hidden|nowrap/);
    const node = await openDrawer(LONG);
    expect(node.textContent).toBe(LONG);
  });

  it('Drawer .subtitle: a long name with no break wraps anywhere instead of overflowing the header', async () => {
    expect(rule('overlays/Drawer.module.css', 'subtitle')).toMatch(/overflow-wrap:\s*anywhere;/);
    const name = 'a'.repeat(100);
    const node = await openDrawer(`In ${name}`);
    expect(node.textContent).toBe(`In ${name}`);
  });

  it('Drawer .subtitle: a written line break reaches it whole, as two lines of one text', async () => {
    const node = await openDrawer('1. Pick a computer.\n2. Choose its realms.');
    expect(node.textContent!.split('\n')).toHaveLength(2);
    expect(node.querySelector('br')).toBeNull();
  });
});
