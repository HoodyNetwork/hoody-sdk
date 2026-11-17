// Vitest: the first changes on one computer: New folder, Rename, and Delete through the one planner
// (create, rename, copy, move, delete). Each runs on the fixtures' live atlas tree (fixtures.ts resetFiles).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetFiles, sentChanges } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const ADA = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const paneA = () => screen.getByRole('region', { name: strings['pane.a'] });
const table = async () => within(await screen.findByRole('region', { name: strings['pane.a'] })).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });
const dialog = () => screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));

async function rowAction(name: RegExp, action: string) {
  const r = await row(name);
  await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: action }));
}

// Load the page's view once before the first test, so that test is not timed on the import.
beforeAll(async () => {
  await import('./view');
}, 120_000);
beforeEach(() => resetFiles());

describe('new folder', () => {
  it('makes a folder in the folder the pane shows', async () => {
    await renderPage(page, { path: ADA });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.newFolder'] }));
    const d = await dialog();
    await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), 'drafts');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
    expect(await row(/drafts/)).toBeInTheDocument();
  });

  it('says why a name cannot be used and keeps Create off', async () => {
    await renderPage(page, { path: ADA });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.newFolder'] }));
    const d = await dialog();
    const field = within(d).getByRole('textbox', { name: strings['name.label'] });
    await userEvent.type(field, 'a/b');
    expect(within(d).getByText(strings['name.chars'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: strings['action.create'] })).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, 'notes.txt');
    expect(within(d).getByText(strings['name.taken'])).toBeInTheDocument();
  });

  it('opens with Shift+N from the list', async () => {
    await renderPage(page, { path: ADA });
    (await row(/projects/)).focus();
    await userEvent.keyboard('{Shift>}N{/Shift}');
    expect(within(await dialog()).getByRole('textbox', { name: strings['name.label'] })).toBeInTheDocument();
  });

  it('a lost answer may have gone through: Check again reads, and proves it from the listing', async () => {
    await renderPage(page, { path: ADA });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.newFolder'] }));
    const d = await dialog();
    await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), 'lost');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
    expect(await screen.findAllByText(/may have gone through/i)).not.toHaveLength(0);
    // Never sent twice: while it may have gone through, Create is gone or off.
    const again = within(d).queryByRole('button', { name: strings['action.create'] });
    expect(again === null || again.hasAttribute('disabled') || again.getAttribute('aria-disabled') === 'true').toBe(true);
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await waitFor(() => expect(screen.queryAllByText(/may have gone through/i)).toHaveLength(0));
    expect(await row(/\blost\b/)).toBeInTheDocument();
  });
});

describe('rename', () => {
  it('renames a file from its row menu', async () => {
    await renderPage(page, { path: ADA });
    await rowAction(/notes\.txt/, strings['action.rename']);
    const d = await dialog();
    const field = within(d).getByRole('textbox', { name: strings['name.label'] });
    expect(field).toHaveValue('notes.txt');
    await userEvent.clear(field);
    await userEvent.type(field, 'todo.txt');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.rename'] }));
    expect(await row(/todo\.txt/)).toBeInTheDocument();
    expect(within(await table()).queryByRole('row', { name: /notes\.txt/ })).toBeNull();
  });

  it('opens with F2 on the focused row', async () => {
    await renderPage(page, { path: ADA });
    (await row(/report\.pdf/)).focus();
    await userEvent.keyboard('{F2}');
    expect(within(await dialog()).getByRole('textbox', { name: strings['name.label'] })).toHaveValue('report.pdf');
  });

  it('a name that resolves into a protected folder is renamed only after it is typed', async () => {
    await renderPage(page, { path: ADA });
    await rowAction(/hosts-link/, strings['action.rename']);
    const d = await dialog();
    const field = within(d).getByRole('textbox', { name: strings['name.label'] });
    await userEvent.clear(field);
    await userEvent.type(field, 'hosts-old');
    const typed = await within(d).findByRole('textbox', { name: fill(strings['typeName'], { name: 'hosts-link' }) });
    const go = within(d).getByRole('button', { name: strings['action.rename'] });
    expect(go).toBeDisabled();
    await userEvent.type(typed, 'hosts-link');
    expect(go).toBeEnabled();
  });

  it('a folder holding an open storage is refused like a delete, and Rename stays off', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1' });
    await rowAction(/\bsrv\b/, strings['action.rename']);
    const d = await dialog();
    expect(await within(d).findByText(fill(strings['rename.holdsMount'], { name: 'Photos' }))).toBeInTheDocument();
    const field = within(d).getByRole('textbox', { name: strings['name.label'] });
    await userEvent.clear(field);
    await userEvent.type(field, 'srv2');
    expect(within(d).getByRole('button', { name: strings['action.rename'] })).toBeDisabled();
  });

  it('while the open storages cannot be read, no folder is renamed', async () => {
    await renderPage(page, { path: ADA, state: 'mountsDown' });
    await rowAction(/projects/, strings['action.rename']);
    const d = await dialog();
    expect(await within(d).findByText(strings['rename.mountsUnknown'])).toBeInTheDocument();
    const field = within(d).getByRole('textbox', { name: strings['name.label'] });
    await userEvent.clear(field);
    await userEvent.type(field, 'projects2');
    expect(within(d).getByRole('button', { name: strings['action.rename'] })).toBeDisabled();
  });

  it('a pending rename keeps its outcome: the fields freeze, and a reopened dialog shows it again', async () => {
    await renderPage(page, { path: ADA, state: 'heldSlow' });
    await rowAction(/notes\.txt/, strings['action.rename']);
    let d = await dialog();
    const field = within(d).getByRole('textbox', { name: strings['name.label'] });
    await userEvent.clear(field);
    await userEvent.type(field, 'lost');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.rename'] }));
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    expect(within(d).getByRole('textbox', { name: strings['name.label'] })).toBeDisabled();
    await userEvent.click(within(d).getAllByRole('button', { name: /^(cancel|close)$/i })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await rowAction(/notes\.txt/, strings['action.rename']);
    d = await dialog();
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    expect(within(d).getByRole('textbox', { name: strings['name.label'] })).toBeDisabled();
    expect(within(d).getByRole('button', { name: strings['action.rename'] })).toBeDisabled();
  }, 20_000);

  it('a refusal before anything changed says so, and the file keeps its name', async () => {
    await renderPage(page, { path: ADA });
    await rowAction(/notes\.txt/, strings['action.rename']);
    const d = await dialog();
    const field = within(d).getByRole('textbox', { name: strings['name.label'] });
    await userEvent.clear(field);
    await userEvent.type(field, 'busy');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.rename'] }));
    expect(await within(d).findByText(/didn't go through|wasn't changed|refused/i)).toBeInTheDocument();
    expect(screen.queryByText(/may have gone through/i)).toBeNull();
  });
});

describe('delete: the one planner', () => {
  it('a file in a home folder: a plain confirm that says there is no trash', async () => {
    await renderPage(page, { path: ADA });
    await rowAction(/notes\.txt/, strings['action.delete']);
    const d = await dialog();
    expect(within(d).getByText(strings['delete.noTrash'])).toBeInTheDocument();
    expect(within(d).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: strings['action.delete'] }));
    await waitFor(async () => expect(within(await table()).queryByRole('row', { name: /notes\.txt/ })).toBeNull());
  });

  it('a folder asks for its name, since its count is not known', async () => {
    await renderPage(page, { path: ADA });
    await rowAction(/projects/, strings['action.delete']);
    const d = await dialog();
    const go = await within(d).findByRole('button', { name: strings['action.delete'] });
    expect(go).toBeDisabled();
    expect(within(d).getByText(strings['delete.countUnknown'])).toBeInTheDocument();
    await userEvent.type(within(d).getByRole('textbox'), 'projects');
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(async () => expect(within(await table()).queryByRole('row', { name: /projects/ })).toBeNull());
  });

  it('a link into /etc is judged where it resolves, and asks for its name', async () => {
    await renderPage(page, { path: ADA });
    await rowAction(/hosts-link/, strings['action.delete']);
    const d = await dialog();
    expect(await within(d).findByText(strings['delete.protected'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: strings['action.delete'] })).toBeDisabled();
  });

  it('refuses a folder that holds an open storage, and sends nothing', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1' });
    await rowAction(/\bsrv\b/, strings['action.delete']);
    const d = await dialog();
    expect(await within(d).findByText(fill(strings['delete.holdsMount'], { name: 'Photos' }))).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['action.delete'] })).toBeNull();
  });

  it('while the open storages cannot be read, a folder is refused and a file is typed', async () => {
    await renderPage(page, { path: ADA, state: 'mountsDown' });
    await rowAction(/projects/, strings['action.delete']);
    expect(await within(await dialog()).findByText(strings['delete.mountsUnknown'])).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await rowAction(/notes\.txt/, strings['action.delete']);
    const d = await dialog();
    expect(await within(d).findByRole('textbox')).toBeInTheDocument();
  });

  it('a reopened planner waits for its own fresh reads: a cached answer never arms Delete', async () => {
    await renderPage(page, { path: ADA, state: 'realSlowAgain' });
    await rowAction(/notes\.txt/, strings['action.delete']);
    let d = await dialog();
    expect(await within(d).findByRole('button', { name: strings['action.delete'] })).toBeEnabled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await rowAction(/notes\.txt/, strings['action.delete']);
    d = await dialog();
    expect(within(d).getByText(strings['delete.checking'])).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['action.delete'] })).toBeNull();
  });

  it('a reopened planner waits for its own fresh storage list too', async () => {
    await renderPage(page, { path: ADA, state: 'mountsSlowAgain' });
    await rowAction(/notes\.txt/, strings['action.delete']);
    let d = await dialog();
    expect(await within(d).findByRole('button', { name: strings['action.delete'] })).toBeEnabled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await rowAction(/notes\.txt/, strings['action.delete']);
    d = await dialog();
    expect(within(d).getByText(strings['delete.checking'])).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['action.delete'] })).toBeNull();
  });

  it('the typed words must match exactly: no trimming', async () => {
    await renderPage(page, { path: ADA });
    await rowAction(/projects/, strings['action.delete']);
    const d = await dialog();
    const go = await within(d).findByRole('button', { name: strings['action.delete'] });
    await userEvent.type(within(d).getByRole('textbox'), ' projects ');
    expect(go).toBeDisabled();
    await userEvent.clear(within(d).getByRole('textbox'));
    await userEvent.type(within(d).getByRole('textbox'), 'projects');
    expect(go).toBeEnabled();
  });

  it('several plain files are typed too: their count, exactly', async () => {
    await renderPage(page, { path: ADA });
    await userEvent.click(within(await row(/notes\.txt/)).getByRole('checkbox'));
    await userEvent.click(within(await row(/report\.pdf/)).getByRole('checkbox'));
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.deleteSelected'] }));
    const d = await dialog();
    const go = await within(d).findByRole('button', { name: strings['action.delete'] });
    expect(go).toBeDisabled();
    await userEvent.type(within(d).getByRole('textbox', { name: /\b2 items\b/ }), '2 items');
    expect(go).toBeEnabled();
  });

  it('several selected items go through the same planner, typed when one needs it', async () => {
    await renderPage(page, { path: ADA });
    const t = await table();
    await userEvent.click(within(await row(/notes\.txt/)).getByRole('checkbox'));
    await userEvent.click(within(await row(/projects/)).getByRole('checkbox'));
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.deleteSelected'] }));
    const d = await dialog();
    // The folder makes it typed; several items type their count.
    expect(await within(d).findByRole('textbox')).toBeInTheDocument();
    expect(within(d).getByRole('textbox', { name: /\b2 items\b/ })).toBeInTheDocument();
    void t;
  });

  it('several items stop at the first that may have gone through: the rest are not sent', async () => {
    await renderPage(page, { path: ADA });
    await table();
    await rowAction(/notes\.txt/, strings['action.rename']);
    let d = await dialog();
    await userEvent.clear(within(d).getByRole('textbox', { name: strings['name.label'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), 'lost');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.rename'] }));
    await userEvent.click((await screen.findAllByRole('button', { name: /check again/i }))[0]!);
    await waitFor(() => expect(screen.queryAllByText(/may have gone through/i)).toHaveLength(0));
    await userEvent.click(within(await row(/\blost\b/)).getByRole('checkbox'));
    await userEvent.click(within(await row(/report\.pdf/)).getByRole('checkbox'));
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.deleteSelected'] }));
    d = await dialog();
    sentChanges.length = 0;
    await userEvent.type(within(d).getByRole('textbox'), '2 items');
    await userEvent.click(await within(d).findByRole('button', { name: strings['action.delete'] }));
    // It ends on the unknown (until a fresh listing proves it), never on a later item's refusal, and only the first
    // item was sent.
    expect(await screen.findAllByText(/may have gone through/i)).not.toHaveLength(0);
    expect(screen.queryByText(/didn't go through/i)).toBeNull();
    expect(sentChanges.filter((x) => x.startsWith('delete:'))).toEqual(['delete:/home/ada/lost']);
    expect(await row(/report\.pdf/)).toBeInTheDocument();
    // The sent plan stays frozen: Delete is off for good and the typed words cannot be edited.
    expect(within(d).getByRole('button', { name: strings['action.delete'] })).toBeDisabled();
    expect(within(d).getByRole('textbox')).toBeDisabled();
  }, 40_000);

  it('the Delete key on a focused row opens the planner', async () => {
    await renderPage(page, { path: ADA });
    (await row(/report\.pdf/)).focus();
    await userEvent.keyboard('{Delete}');
    expect(within(await dialog()).getByText(strings['delete.noTrash'])).toBeInTheDocument();
  });

  it('a lost answer may have gone through; Check again reads, and the file is gone', async () => {
    await renderPage(page, { path: ADA });
    await table();
    // Make a file named lost, then delete it: its answer is lost.
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.newFolder'] }));
    let d = await dialog();
    await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), 'lostdir');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
    await row(/lostdir/);
    await rowAction(/notes\.txt/, strings['action.rename']);
    d = await dialog();
    await userEvent.clear(within(d).getByRole('textbox', { name: strings['name.label'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), 'lost');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.rename'] }));
    await userEvent.click((await screen.findAllByRole('button', { name: /check again/i }))[0]!);
    await waitFor(() => expect(screen.queryAllByText(/may have gone through/i)).toHaveLength(0));
    await rowAction(/\blost\b/, strings['action.delete']);
    d = await dialog();
    await userEvent.click(within(d).getByRole('button', { name: strings['action.delete'] }));
    // The dialog keeps the plan it confirmed: its re-reads after the send (the item may be gone) never swap the
    // outcome for a "couldn't check" view.
    expect(await within(d).findAllByText(/may have gone through/i)).not.toHaveLength(0);
    expect(within(d).queryByText(strings['delete.checkFailed'])).toBeNull();
    // Core's own refresh may already have proven it; otherwise Check again reads.
    const check = screen.queryAllByRole('button', { name: /check again/i })[0];
    if (check) await userEvent.click(check);
    await waitFor(() => expect(screen.queryAllByText(/may have gone through/i)).toHaveLength(0));
    expect(within(await table()).queryByRole('row', { name: /\blost\b/ })).toBeNull();
  }, 40_000);
});

describe('changes off', () => {
  it('a token session without exec keeps the buttons, off, and says why', async () => {
    await renderPage(page, { path: ADA, state: 'tokenRead' });
    await table();
    const b = within(paneA()).getByRole('button', { name: strings['action.newFolder'] });
    // Off with its reason on the button itself (a soft-disabled control stays focusable and names why).
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription(strings['changes.off']);
    // The pane's own line says it too (the buttons' reason tips are hidden until asked for).
    expect(within(paneA()).getAllByText(strings['changes.off']).filter((el) => !el.closest('[hidden]'))).toHaveLength(1);
  });
});

describe('conformance', () => {
  it('only the delete planner sends a delete', () => {
    const dir = __dirname;
    const src = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.(test|spec)\./.test(f) && f !== 'fixtures.ts');
    const users = src.filter((f) => readFileSync(join(dir, f), 'utf8').includes("useFilesChange('delete')"));
    // DeletePlanner.pure.ts is the planner's own Check again hook (read-only), split out for the terminal build.
    expect(users.sort()).toEqual(['DeletePlanner.pure.ts', 'DeletePlanner.tsx']);
    const routeUsers = src.filter((f) => /\bdeleteRoute\b/.test(readFileSync(join(dir, f), 'utf8')));
    expect(routeUsers.sort()).toEqual(['data.ts', 'routes.ts']);
  });
});
