// The inline options panel (the form shown inside a dialog's own panel): its structure.
//
// | # | Structure | Test |
// |---|---|---|
// | 1 | The title is a heading drawn as a group heading, a step above the field labels under it | 'the title is a group heading' |
// | 2 | Open and Cancel close the form under a rule: the last block, after every field | 'the actions close the form under a rule' |
// | 3 | The variables' help stands under their control (the rows and Add), as the other fields' help does | 'the help of every field stands under its control' |
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@app/testing';
import type { Item } from '../logic';
import strings from '../strings.en.json';
import { OptionsPanel } from './OptionsDrawer';
import s from './parts.module.css';

const CSS = fs.readFileSync(path.join(__dirname, 'parts.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? '';
const item = { id: 'jupyterlab', name: 'JupyterLab', opensIn: 'web' } as unknown as Item;
const title = strings['opt.title'].replace('{{name}}', 'JupyterLab');
const draw = () => render(<OptionsPanel item={item} onClose={vi.fn()} onOpen={vi.fn()} />);
const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('Options for an app, inline', () => {
  it('the title is a group heading', () => {
    draw();
    const h = screen.getByRole('heading', { level: 3, name: title });
    expect(h.className).toContain(s.panelTitle);
    expect(rule('.panelTitle')).toMatch(/font:\s*var\(--t-group\)/);
  });

  it('the actions close the form under a rule', () => {
    const { container } = draw();
    const foot = container.querySelector('[data-panel-foot]') as HTMLElement;
    expect(foot.className).toContain(s.panelFoot);
    expect(rule('.panelFoot')).toMatch(/border-block-start:\s*var\(--bw\) solid var\(--hx-line\)/);
    const open = screen.getByRole('button', { name: strings['opt.open'] });
    expect(foot.contains(open)).toBe(true);
    // Every field comes before the closing row, and nothing comes after it.
    for (const field of [screen.getByRole('textbox', { name: strings['opt.args'] }), screen.getByRole('group', { name: strings['opt.env'] }), screen.getByRole('radiogroup', { name: strings['opt.opens'] })]) expect(after(field, foot)).toBe(true);
    expect(foot.parentElement?.lastElementChild).toBe(foot);
  });

  it('the help of every field stands under its control', () => {
    draw();
    const env = screen.getByRole('group', { name: strings['opt.env'] });
    expect(after(screen.getByRole('button', { name: strings['opt.add'] }), screen.getByText(strings['opt.envHelp']))).toBe(true);
    expect(env.contains(screen.getByText(strings['opt.envHelp']))).toBe(true);
    expect(after(screen.getByRole('textbox', { name: strings['opt.args'] }), screen.getByText(strings['opt.argsHelp']))).toBe(true);
  });
});
