// Vitest: a text preview is coloured by its kind (JSON, JavaScript, YAML, shell) with
// the kit CodeBlock's own colouring, and a plain text file stays plain. Nothing here sends a change.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const A = '/files?a=atlas.00a1';
const at = (p: string) => `${A}&ap=${encodeURIComponent(p)}`;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Opens the preview of `name` in `folder` and returns its code block once the text shows. */
async function preview(folder: string, name: string, shows: string) {
  await renderPage(page, { path: at(folder) });
  const pane = await screen.findByRole('region', { name: strings['pane.a'] });
  const table = await within(pane).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
  const row = await within(table).findByRole('row', { name: new RegExp(esc(name)) });
  await userEvent.click(within(row).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp('^' + esc(strings['action.preview'])) }));
  const block = await screen.findByRole('figure', { name: fill(strings['preview.textLabel'], { name }) });
  await waitFor(() => expect(block.textContent).toContain(shows));
  return block;
}

const coloured = (block: HTMLElement, sel: string) => [...block.querySelectorAll(sel)].map((e) => e.textContent);

describe('preview colours', () => {
  it('colours a JSON file: its keys and values', async () => {
    const block = await preview('/srv/app', 'package.json', '1.4.2');
    expect(coloured(block, '[class*="hl_key"]')).toContain('"version"');
    expect(coloured(block, '[class*="hl_str"]')).toContain('"1.4.2"');
  });

  it('colours a JavaScript file: its keywords', async () => {
    const block = await preview('/srv/app', 'server.js', 'listen');
    expect(coloured(block, '[class*="hl_kw"]')).toContain('const');
  });

  it('colours a YAML file: its keys', async () => {
    const block = await preview('/home/ada/projects/site', 'config.yaml', 'port');
    expect(coloured(block, '[class*="hl_key"]').join(' ')).toMatch(/port/);
  });

  it('colours a shell script: its commands, flags and variables (found by its extension)', async () => {
    const block = await preview('/home/ada/projects/site', 'deploy.sh', 'rsync');
    expect(coloured(block, '[class*="sh_cmd"]')).toContain('rsync');
    expect(coloured(block, '[class*="sh_flag"]')).toContain('-a');
    expect(coloured(block, '[class*="sh_var"]').join(' ')).toMatch(/\$HOME/);
  });

  it('leaves a plain text file plain', async () => {
    const block = await preview('/home/ada', 'notes.txt', 'notes.txt');
    expect(block.querySelector('[class*="hl_"], [class*="sh_"]')).toBeNull();
  });
});
