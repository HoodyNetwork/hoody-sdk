// Vitest: Copy / Move to the other side with both sides on ONE computer.
// Pane A shows the item's folder, pane B the destination; each runs on the fixtures' live atlas tree (resetFiles).
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { addOdd, finishCopy, oldListingWhile, removeItem, resetFiles, rewriteFile, sentChanges } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const enc = encodeURIComponent;
const two = (ap: string, bp: string, b = 'atlas.00a1', state?: string) => ({ path: `/files?a=atlas.00a1&ap=${enc(ap)}&b=${b}&bp=${enc(bp)}`, ...(state ? { state } : {}) });
// The page's first render waits up to 30 s: on a busy machine it can take longer than the 5 s default, and that is load,
// not a failure. Each test's own time limit leaves room for that first wait.
const FIRST = { timeout: 30_000 } as const;
const LIMIT = 60_000;
const paneA = () => screen.findByRole('region', { name: strings['pane.a'] }, FIRST);
const table = async () => within(await paneA()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });
const dialog = () => screen.findByRole('dialog');

async function openMenu(name: RegExp) {
  const r = await row(name);
  await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
}
async function rowAction(name: RegExp, action: string) {
  await openMenu(name);
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${action}`) }));
}
const where = (path: string) => fill(ts.where, { computer: 'atlas', path });

beforeEach(() => resetFiles());

describe('copy to the other side', { timeout: LIMIT }, () => {
  it('shows From and To in full and copies the file to the other side\'s folder', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await rowAction(/notes\.txt/, ts['action.copy']);
    const d = await dialog();
    expect(within(d).getByText(where('/home/ada/notes.txt'))).toBeInTheDocument();
    expect(await within(d).findByText(where('/tmp/notes.txt'))).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: ts['copy.primary'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
    expect(await row(/notes\.txt/)).toBeInTheDocument();
  });

  it('a taken name is never replaced: the copy gets the Keep-both name, shown before the press', async () => {
    await renderPage(page, two('/home/ada', '/home/ada/projects'));
    await rowAction(/notes\.txt/, ts['action.copy']);
    let d = await dialog();
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await rowAction(/notes\.txt/, ts['action.copy']);
    d = await dialog();
    expect(await within(d).findByText(fill(ts['copy.taken'], { name: 'notes.txt', folder: '/home/ada/projects', newName: 'notes-1.txt' }))).toBeInTheDocument();
    expect(within(d).getByText(where('/home/ada/projects/notes-1.txt'))).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: ts['copy.primary'] }));
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/home/ada/projects/notes.txt', 'copy:/home/ada/notes.txt>/home/ada/projects/notes-1.txt']));
  });

  it('a lost answer may have gone through: never sent twice, Check again proves it by both SHA-256 reads', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'transferLost'));
    await rowAction(/notes\.txt/, ts['action.copy']);
    const d = await dialog();
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    // The band names it; a second copy of the same item is refused while it is held.
    expect(await screen.findAllByText(fill(ts['held.copy'], { name: 'notes.txt', dest: '/tmp/notes.txt' }))).not.toHaveLength(0);
    await rowAction(/notes\.txt/, ts['action.copy']);
    const again = await dialog();
    expect(await within(again).findByText(strings['changes.overlap'])).toBeInTheDocument();
    expect(within(again).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    await userEvent.click(within(again).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    // So is any other item's copy on this computer: changes there go one at a time.
    await rowAction(/report\.pdf/, ts['action.copy']);
    const another = await dialog();
    expect(await within(another).findByText(strings['changes.overlap'])).toBeInTheDocument();
    expect(within(another).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    await userEvent.click(within(another).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await waitFor(() => expect(screen.queryAllByText(fill(ts['held.copy'], { name: 'notes.txt', dest: '/tmp/notes.txt' }))).toHaveLength(0));
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, LIMIT);

  it('a file that became a folder before the copy ran: the items left out are listed and the dialog stays', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'copyBecameFolder'));
    await rowAction(/notes\.txt/, ts['action.copy']);
    const d = await dialog();
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    const words = { name: 'notes.txt', folder: '/tmp', count: '22' };
    expect(await within(d).findByText(fill(ts['skipped.title'], words))).toBeInTheDocument();
    // The program's own reasons become fixed words; 20 lines at most, then how many more.
    expect(within(d).getByText(fill(ts['skipped.notRegular'], { path: '/tmp/notes.txt/pipe' }))).toBeInTheDocument();
    expect(within(d).getByText(fill(ts['skipped.outside'], { path: '/tmp/notes.txt/out' }))).toBeInTheDocument();
    expect(within(d).getByText(fill(ts['skipped.other'], { path: '/tmp/notes.txt/odd-18' }))).toBeInTheDocument();
    expect(within(d).queryByText(fill(ts['skipped.other'], { path: '/tmp/notes.txt/odd-19' }))).toBeNull();
    expect(within(d).getAllByRole('listitem')).toHaveLength(20);
    expect(within(d).getByText(fill(ts['skipped.more'], { count: '2' }))).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(d);
    expect(within(d).queryByRole('button', { name: ts['copy.primary'] })).toBeNull();
    expect(within(d).getByRole('button', { name: (n, el) => n === ts.close && !el.hasAttribute('data-dialog-close') })).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, LIMIT);

  it('a file that became a folder and whose copy stopped part way stays held: a folder there proves nothing', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'copyBecameFolderCut'));
    await rowAction(/notes\.txt/, ts['action.copy']);
    const d = await dialog();
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(within(d).getByRole('button', { name: /check again/i })).toBeEnabled());
    expect(within(d).getByText(/may have gone through/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(d);
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, LIMIT);

  it('two presses in one moment send once, and the outcome shown is that one send\'s', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'transferLost'));
    await rowAction(/notes\.txt/, ts['action.copy']);
    const d = await dialog();
    const go = await within(d).findByRole('button', { name: ts['copy.primary'] });
    act(() => { fireEvent.click(go); fireEvent.click(go); });
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    expect(within(d).queryByText(/earlier change|not sent|wasn't sent|already/i)).toBeNull();
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, LIMIT);

  it('a success answer that names another destination proves nothing: the copy stays held until a read proves it', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'transferOdd'));
    await rowAction(/notes\.txt/, ts['action.copy']);
    const d = await dialog();
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    expect(await screen.findAllByText(fill(ts['held.copy'], { name: 'notes.txt', dest: '/tmp/notes.txt' }))).not.toHaveLength(0);
    // The copy was made: the band's Check again reads it there and lets it go.
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await waitFor(() => expect(screen.queryAllByText(fill(ts['held.copy'], { name: 'notes.txt', dest: '/tmp/notes.txt' }))).toHaveLength(0));
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, LIMIT);

  it('a held copy stays shown under the destination it was sent to, even once that name reads as taken', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'transferHeld'));
    await rowAction(/notes\.txt/, ts['action.copy']);
    const d = await dialog();
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    // The read-back re-read /tmp: it now lists notes.txt, so a fresh dialog would offer notes-1.txt.
    expect(await within(await screen.findByRole('region', { name: strings['pane.b'] })).findByText('notes.txt')).toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.getByRole('dialog')).toBe(d);
    expect(within(d).getByText(/may have gone through/i)).toBeInTheDocument();
    expect(within(d).getByText(where('/tmp/notes.txt'))).toBeInTheDocument();
    expect(within(d).queryByText(where('/tmp/notes-1.txt'))).toBeNull();
  }, LIMIT);

  it('a lost copy whose destination now holds other bytes is settled as not this copy, never as done', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'transferLost'));
    await rowAction(/report\.pdf/, ts['action.copy']);
    const d = await dialog();
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    rewriteFile('/tmp/report.pdf');
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    // Proved not this copy: the dialog stays and says another item has the name, never replaced, never done.
    expect(await within(d).findByText(fill(ts['verdict.copyOther'], { name: 'report.pdf', folder: '/tmp' }))).toBeInTheDocument();
    expect(within(d).queryByText(/may have gone through/i)).toBeNull();
    expect(within(d).queryByRole('button', { name: ts['copy.primary'] })).toBeNull();
    expect(sentChanges).toEqual(['copy:/home/ada/report.pdf>/tmp/report.pdf']);
  }, LIMIT);

  it('a lost copy that was not made: the read-back finds nothing there and says so; nothing is sent again', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'transferNone'));
    await rowAction(/notes\.txt/, ts['action.copy']);
    const d = await dialog();
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    expect(await within(d).findByText(fill(ts['verdict.copyNone'], { folder: '/tmp' }))).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: ts['copy.primary'] })).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === ts.close && !el.hasAttribute('data-dialog-close') }));
    expect(screen.queryAllByText(/may have gone through/i)).toHaveLength(0);
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, LIMIT);

  it('a held change\'s band line names the whole destination; Check again that proves it was not made leaves a note', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'transferNoneFlaky'));
    await rowAction(/notes\.txt/, ts['action.copy']);
    const d = await dialog();
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    const line = fill(ts['held.copy'], { name: 'notes.txt', dest: '/tmp/notes.txt' });
    expect(await screen.findAllByText(line)).not.toHaveLength(0);
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    expect(await screen.findAllByText(fill(ts['verdict.copyNone'], { folder: '/tmp' }))).not.toHaveLength(0);
    await waitFor(() => expect(screen.queryAllByText(line)).toHaveLength(0));
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, LIMIT);
});

describe('move to the other side', { timeout: LIMIT }, () => {
  it('moves a file in one step: gone from here, sent once', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await rowAction(/report\.pdf/, ts['action.move']);
    const d = await dialog();
    const go = within(d).getByRole('button', { name: ts['move.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sentChanges).toEqual(['move:/home/ada/report.pdf>/tmp/report.pdf']);
    await waitFor(async () => expect(within(await table()).queryByRole('row', { name: /report\.pdf/ })).toBeNull());
  });

  it('between a storage and this computer\'s disk: refused before sending, with Copy instead', async () => {
    await renderPage(page, two('/srv/media', '/tmp'));
    await rowAction(/photo-001\.jpg/, ts['action.move']);
    const d = await dialog();
    expect(await within(d).findByText(fill(ts['move.places'], { from: 'Photos', to: 'atlas' }))).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['move.primary'] })).toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: ts.copyInstead }));
    const go = await within(d).findByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual(['copy:/srv/media/photo-001.jpg>/tmp/photo-001.jpg']));
  });

  it('the program\'s own refusal across disks gets the same words and Copy instead; nothing moved', async () => {
    await renderPage(page, two('/srv/app', '/tmp'));
    await rowAction(/server\.js/, ts['action.move']);
    const d = await dialog();
    const go = within(d).getByRole('button', { name: ts['move.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await within(d).findByText(ts['move.crosses'])).toBeInTheDocument();
    expect(within(d).queryByText(/may have gone through/i)).toBeNull();
    expect(within(d).getByRole('button', { name: ts.copyInstead })).toBeInTheDocument();
    expect(await row(/server\.js/)).toBeInTheDocument();
  });

  it('a folder refused between places gets Copy instead too: the copy walks it first', async () => {
    await renderPage(page, two('/home/ada', '/srv/media'));
    await rowAction(/projects/, ts['action.move']);
    const d = await dialog();
    expect(await within(d).findByText(fill(ts['move.places'], { from: 'atlas', to: 'Photos' }))).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['move.primary'] })).toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: ts.copyInstead }));
    expect(await within(d).findByText(fill(ts['walk.plan'], { name: 'projects', count: '4' }))).toBeInTheDocument();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/projects>/srv/media/projects']));
  });

  it('a folder the program refuses across disks gets the same words and Copy instead; nothing moved', async () => {
    await renderPage(page, two('/srv/app', '/tmp'));
    await rowAction(/public/, ts['action.move']);
    const d = await dialog();
    const go = within(d).getByRole('button', { name: ts['move.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await within(d).findByText(ts['move.crosses'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts.copyInstead })).toBeInTheDocument();
    expect(sentChanges).toEqual(['move:/srv/app/public>/tmp/public']);
  });

  it('a folder holding an open storage is never moved', async () => {
    await renderPage(page, two('/', '/tmp'));
    await rowAction(/\bsrv\b/, ts['action.move']);
    const d = await dialog();
    expect(await within(d).findByText(fill(ts['move.holdsMount'], { name: 'Photos' }))).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['move.primary'] })).toBeDisabled();
  });

  it('while the open storages cannot be read, no folder is moved', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'mountsDown'));
    await rowAction(/projects/, ts['action.move']);
    const d = await dialog();
    expect(await within(d).findByText(ts['move.mountsUnknown'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['move.primary'] })).toBeDisabled();
  });

  it('a link that resolves into a system folder moves only after its name is typed', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await rowAction(/hosts-link/, ts['action.move']);
    const d = await dialog();
    const typed = await within(d).findByRole('textbox', { name: fill(ts['move.typeName'], { name: 'hosts-link' }) });
    const go = within(d).getByRole('button', { name: ts['move.primary'] });
    expect(go).toBeDisabled();
    await userEvent.type(typed, 'hosts-link');
    expect(go).toBeEnabled();
  });

  it('a lost move that was not made: the read-back finds it still here and says so', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'transferNone'));
    await rowAction(/report\.pdf/, ts['action.move']);
    const d = await dialog();
    const go = within(d).getByRole('button', { name: ts['move.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await within(d).findByText(fill(ts['verdict.moveNone'], { name: 'report.pdf', folder: '/home/ada' }))).toBeInTheDocument();
    expect(sentChanges).toEqual(['move:/home/ada/report.pdf>/tmp/report.pdf']);
    expect(await row(/report\.pdf/)).toBeInTheDocument();
  }, LIMIT);

  it('a lost move is proved from both folders by the read-back, never sent twice', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'transferLost'));
    await rowAction(/report\.pdf/, ts['action.move']);
    const d = await dialog();
    const go = within(d).getByRole('button', { name: ts['move.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    // The read-back finds the approved version at the destination and none here: settled, the dialog closes.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryAllByText(/may have gone through/i)).toHaveLength(0);
    expect(sentChanges).toEqual(['move:/home/ada/report.pdf>/tmp/report.pdf']);
    await waitFor(async () => expect(within(await table()).queryByRole('row', { name: /report\.pdf/ })).toBeNull());
  }, LIMIT);
});

describe('when it is not offered', { timeout: LIMIT }, () => {
  const reasonFor = async (setup: ReturnType<typeof two>, item: RegExp, text: string, action = ts['action.copy']) => {
    await renderPage(page, setup);
    await openMenu(item);
    const copy = await screen.findByRole('menuitem', { name: new RegExp(`^${action}`) });
    expect(copy).toHaveAttribute('aria-disabled', 'true');
    // The menu says a reason on the item or once as its group's note; either way the item names it.
    expect(copy).toHaveAccessibleDescription(expect.stringContaining(text));
  };
  it('another computer on the other side', () => reasonFor(two('/home/ada', '/', 'cedar.00c3'), /notes\.txt/, ts['block.otherComputer']));
  it('the same folder on the other side', () => reasonFor(two('/home/ada', '/home/ada'), /notes\.txt/, ts['block.sameFolder']));
  it('a folder into itself', () => reasonFor(two('/home/ada', '/home/ada/projects/site'), /projects/, ts['block.intoItself'], ts['action.move']));
  it('changes turned off in this session', () => reasonFor({ ...two('/home/ada', '/tmp'), state: 'tokenRead' }, /notes\.txt/, strings['changes.off']));
});

describe('copy a folder', { timeout: LIMIT }, () => {
  const held = fill(ts['held.copy'], { name: 'projects', dest: '/tmp/projects' });
  async function copyProjects(state?: string) {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', state));
    await rowAction(/projects/, ts['action.copy']);
    return dialog();
  }

  it('walks the folder first, says what goes, and copies it once the whole tree is read', async () => {
    const d = await copyProjects();
    expect(await within(d).findByText(fill(ts['walk.plan'], { name: 'projects', count: '4' }))).toBeInTheDocument();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects']);
  });

  it('an older files program (no skipped list, no entry types): its folders are not read at all, so nothing can be copied', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'atlas.00a1', 'oldFiles'));
    const pane = await paneA();
    expect(await within(pane).findByText(strings['pr.unreadable'])).toBeInTheDocument();
    expect(within(pane).getByText(strings['pr.unreadableBody'])).toBeInTheDocument();
    expect(within(pane).queryByRole('row', { name: /projects/ })).toBeNull();
    expect(sentChanges).toEqual([]);
  });

  it('a folder inside a readable one answered as an older files program does (no skipped list, no types): the walk cannot read it, Copy stays off, nothing sent', async () => {
    const stop = oldListingWhile('/home/ada/projects');
    const d = await copyProjects();
    expect(await within(d).findByText(fill(ts['walk.failed'], { name: 'projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(within(d).queryByText(fill(ts['walk.plan'], { name: 'projects', count: '4' }))).toBeNull();
    stop();
    expect(sentChanges).toEqual([]);
  });

  it('over 2,000 items: too big for one copy from the Hub, refused before sending', async () => {
    const d = await copyProjects('bigFolder');
    expect(await within(d).findByText(fill(ts['walk.big'], { name: 'projects', entries: '2,000', folders: '200' }))).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(sentChanges).toEqual([]);
  });

  it('links stay links, and pipes are listed as left out before the press and after it; the dialog stays', async () => {
    addOdd('/home/ada/projects/site', ['latest'], ['run.pipe']);
    const d = await copyProjects();
    expect(await within(d).findByText(fill(ts['walk.plan'], { name: 'projects', count: '5' }))).toBeInTheDocument();
    expect(within(d).getByText(ts['walk.links'])).toBeInTheDocument();
    expect(within(d).getByText(ts['walk.left'])).toBeInTheDocument();
    expect(within(d).getByText('site/run.pipe')).toBeInTheDocument();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await within(d).findByText(fill(ts['skipped.folderOne'], { name: 'projects', folder: '/tmp' }))).toBeInTheDocument();
    expect(within(d).getByText(fill(ts['skipped.notRegular'], { path: '/home/ada/projects/site/run.pipe' }))).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: (n, el) => n === ts.close && !el.hasAttribute('data-dialog-close') })).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects']);
  });

  it('the press waits for the whole tree, read now: an answer cached from an earlier opening does not arm it', async () => {
    let d = await copyProjects('siteSlowAgain');
    await waitFor(() => expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeEnabled());
    await userEvent.click(within(d).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await rowAction(/projects/, ts['action.copy']);
    d = await dialog();
    expect(await within(d).findByText(fill(ts['walk.reading'], { name: 'projects' }))).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(within(d).queryByText(fill(ts['walk.plan'], { name: 'projects', count: '4' }))).toBeNull();
    expect(sentChanges).toEqual([]);
  });

  it('a folder in it that cannot be read: said so, nothing sent', async () => {
    const d = await copyProjects('siteFails');
    expect(await within(d).findByText(fill(ts['walk.failed'], { name: 'projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(sentChanges).toEqual([]);
  }, LIMIT);

  it('judged where it goes too: a destination that puts its files deeper than the Hub reads refuses it', async () => {
    await renderPage(page, two('/home/ada', '/srv/a/b/c/d/e', 'atlas.00a1'));
    await rowAction(/projects/, ts['action.copy']);
    const d = await dialog();
    expect(await within(d).findByText(fill(ts['walk.deep'], { name: 'projects' }))).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(sentChanges).toEqual([]);
  });

  it('links whose exact target the Hub cannot read are copied, and it says before the press that the copy cannot be checked', async () => {
    addOdd('/home/ada/projects/site', ['out=>[external]', 'abs=>/etc/hosts'], []);
    const d = await copyProjects();
    expect(await within(d).findByText(fill(ts['walk.planUnchecked'], { name: 'projects', count: '6' }))).toBeInTheDocument();
    expect(within(d).queryByText(fill(ts['walk.plan'], { name: 'projects', count: '6' }))).toBeNull();
    expect(within(d).getByText(ts['walk.links'])).toBeInTheDocument();
    expect(within(d).getByText(ts['walk.opaque'])).toBeInTheDocument();
    await waitFor(() => expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeEnabled());
  });

  it('a lost answer: both trees compared, read now, are equal: done, never sent twice', async () => {
    const d = await copyProjects('transferLost');
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 10_000 });
    await waitFor(() => expect(screen.queryAllByText(held)).toHaveLength(0));
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects']);
  }, LIMIT);

  it('cut part way (409 COPY_INCOMPLETE): stays held with the count, blocks other changes, and is done once the copy finishes', async () => {
    const d = await copyProjects('folderCut');
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    // site and its two files are missing; README.md was copied whole. It may still be running: held, never "not made".
    const part = fill(ts['held.copyPart'], { count: '3', dest: '/tmp/projects' });
    expect(await within(d).findByText(part, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).getByText(/may have gone through/i)).toBeInTheDocument();
    expect(within(d).queryByText(/didn.t go through/i)).toBeNull();
    expect(screen.getAllByText(held, { exact: false }).length).toBeGreaterThan(0);
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    // Another change on this computer stays refused while it is held.
    await rowAction(/notes\.txt/, ts['action.copy']);
    const other = await dialog();
    expect(await within(other).findByText(strings['changes.overlap'])).toBeInTheDocument();
    expect(within(other).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    await userEvent.click(within(other).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    // The copy kept going and finished: Check again (reads only) proves it made.
    finishCopy('/home/ada/projects', '/tmp/projects');
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await waitFor(() => expect(screen.queryAllByText(held, { exact: false })).toHaveLength(0), { timeout: 10_000 });
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects']);
  }, LIMIT);

  it('cut with its answer lost: the held band compares by itself and shows the count, still held', async () => {
    const d = await copyProjects('folderCutLost');
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    const part = fill(ts['held.copyPart'], { count: '3', dest: '/tmp/projects' });
    expect(await screen.findAllByText(`${held} ${part}`, {}, { timeout: 10_000 })).not.toHaveLength(0);
    finishCopy('/home/ada/projects', '/tmp/projects');
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await waitFor(() => expect(screen.queryAllByText(held, { exact: false })).toHaveLength(0), { timeout: 10_000 });
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects']);
  }, LIMIT);

  it('a closed dialog\'s folder reads are not part of another copy\'s check: its folder deleted since fails nothing', async () => {
    let d = await copyProjects('transferLost');
    await waitFor(() => expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeEnabled());
    await userEvent.click(within(d).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    removeItem('/home/ada/projects');
    await rowAction(/notes\.txt/, ts['action.copy']);
    d = await dialog();
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    // Check again: the lost file copy is proved by its own reads (both SHA-256) and closes.
    await userEvent.click(await within(d).findByRole('button', { name: /check again/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 10_000 });
    await waitFor(() => expect(screen.queryAllByText(fill(ts['held.copy'], { name: 'notes.txt', dest: '/tmp/notes.txt' }))).toHaveLength(0), { timeout: 10_000 });
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, LIMIT);

  it('a lost folder copy that was not made: nothing at the name, said so', async () => {
    const d = await copyProjects('transferNone');
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await within(d).findByText(fill(ts['verdict.copyNone'], { folder: '/tmp' }))).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects']);
  }, LIMIT);
});

describe('partWords', () => {
  it('a held folder copy found part made says how many items, one in its own words', async () => {
    const { partWords } = await import('./Transfer');
    const t = (k: string, v: Record<string, string>) => fill((ts as Record<string, string>)[k]!, v);
    expect(partWords(t, '/tmp/projects', 1)).toBe(fill(ts['held.copyPartOne'], { dest: '/tmp/projects' }));
    expect(partWords(t, '/tmp/projects', 2)).toBe(fill(ts['held.copyPart'], { count: '2', dest: '/tmp/projects' }));
  });
});

describe('skippedOf', () => {
  it('reads the program\'s skipped list: paths kept, the larger count wins, nothing left out → none', async () => {
    const { skippedOf } = await import('./Transfer');
    expect(skippedOf({ skipped_count: 3, skipped: [{ path: '/a', reason: 'x' }, { reason: 'no path' }, 7] })).toEqual({ list: [{ path: '/a', reason: 'x' }], count: 3 });
    expect(skippedOf({ skipped_count: 0, skipped: [{ path: '/a' }] })).toEqual({ list: [{ path: '/a', reason: '' }], count: 1 });
    expect(skippedOf({ skipped_count: 0, skipped: [] })).toBeUndefined();
    expect(skippedOf(null)).toBeUndefined();
  });
});
