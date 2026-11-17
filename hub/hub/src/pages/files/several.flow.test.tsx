// Vitest: Copy / Move several selected items to the other side, on one computer.
// Pane A shows the items' folder, pane B the destination; each runs on the fixtures' live atlas tree (resetFiles).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { errorInfo, queryClient } from '@core';
import { errorSentence } from '@kit';
import { addDir, addFile, addOdd, failListingWhile, loseListingWhile, resetFiles, seen, sentChanges } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const enc = encodeURIComponent;
const two = (ap: string, bp: string, state?: string, b = 'atlas.00a1') => ({ path: `/files?a=atlas.00a1&ap=${enc(ap)}&b=${b}&bp=${enc(bp)}`, ...(state ? { state } : {}) });
const paneA = () => screen.findByRole('region', { name: strings['pane.a'] });
const table = async () => within(await paneA()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });
const dialog = () => screen.findByRole('dialog');

async function select(...names: RegExp[]) {
  for (const n of names) await userEvent.click(within(await row(n)).getByRole('checkbox'));
}
async function bulk(how: 'copy' | 'move') {
  await userEvent.click(within(await paneA()).getByRole('button', { name: ts[how === 'copy' ? 'action.copySelected' : 'action.moveSelected'] }));
  return dialog();
}
async function press(d: HTMLElement, how: 'copy' | 'move') {
  const go = within(d).getByRole('button', { name: ts[how === 'copy' ? 'copy.primary' : 'move.primary'] });
  await waitFor(() => expect(go).toBeEnabled());
  await userEvent.click(go);
}
async function dialogReady(how: 'copy' | 'move') {
  const d = await bulk(how);
  await waitFor(() => expect(within(d).getByRole('button', { name: ts[how === 'copy' ? 'copy.primary' : 'move.primary'] })).toBeEnabled());
  return d;
}
const items = (d: HTMLElement) => within(d).getByRole('list', { name: ts['several.listLabel'] });

// The page's view loads lazily: load it once up front, so the first case's waits are not spent on that load (a cold
// transform under load takes longer than one 5 s wait).
beforeAll(async () => {
  await import('./view');
}, 120_000);
beforeEach(() => resetFiles());

describe('copy several items', () => {
  it('sends each item once, in the order shown, and closes when every one is done', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('copy');
    expect(within(d).getByRole('heading', { name: fill(ts['several.copyTitle'], { count: '2' }) })).toBeInTheDocument();
    await press(d, 'copy');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt', 'copy:/home/ada/report.pdf>/tmp/report.pdf']);
  });

  it('a taken name gets the Keep-both name by default, shown before the press; nothing is replaced', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'copyTaken'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('copy');
    expect(await within(d).findByText('notes.txt → notes-1.txt')).toBeInTheDocument();
    expect(within(d).getByRole('radio', { name: ts['several.keepBoth'] })).toBeChecked();
    await press(d, 'copy');
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes-1.txt', 'copy:/home/ada/report.pdf>/tmp/report.pdf']));
  });

  it('with Skip, a taken name is left out and said so; the others go and the dialog stays with the count', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'copyTaken'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('copy');
    await userEvent.click(await within(d).findByRole('radio', { name: ts['several.skip'] }));
    expect(within(items(d)).getByText(fill(ts['several.skipTaken'], { name: 'notes.txt' }))).toBeInTheDocument();
    await press(d, 'copy');
    expect(await within(d).findByText([fill(ts['several.sumCopied'], { count: '1' }), fill(ts['several.sumLeftOut'], { count: '1' })].join(' '))).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/report.pdf>/tmp/report.pdf']);
  });

  it('stops at the first unknown outcome: nothing after it is sent, it stays held, the rest say not sent', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'secondLost'));
    await select(/hosts-link/, /notes\.txt/, /report\.pdf/);
    const d = await bulk('copy');
    await press(d, 'copy');
    const sum = await within(d).findByText([fill(ts['several.sumCopied'], { count: '1' }), fill(ts['several.sumPending'], { name: 'notes.txt' }), fill(ts['several.sumNotSent'], { count: '1' })].join(' '));
    // The summary is the run's Verdict plate; the items are an "Items" section; no loose status lines.
    expect(within(d).getByRole('group', { name: ts['plate.copy'] })).toContainElement(sum);
    expect(within(d).getByRole('region', { name: ts['several.listLabel'] })).toContainElement(items(d));
    expect(d.querySelectorAll('p[class*="note"]')).toHaveLength(0);
    expect(sentChanges).toEqual(['copy:/home/ada/hosts-link>/tmp/hosts-link', 'copy:/home/ada/notes.txt>/tmp/notes.txt']);
    expect(within(items(d)).getByText(ts['several.pending'])).toBeInTheDocument();
    expect(within(items(d)).getByText(ts['several.notSent'])).toBeInTheDocument();
    // The held band names it too. The dialog's Check again only reads: proved made, the item reads as copied.
    expect(await screen.findAllByText(fill(ts['held.copy'], { name: 'notes.txt', dest: '/tmp/notes.txt' }))).not.toHaveLength(0);
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(within(items(d)).getAllByText(ts['several.copied'])).toHaveLength(2));
    expect(within(d).getByText([fill(ts['several.sumCopied'], { count: '2' }), fill(ts['several.sumStopped'], { name: 'notes.txt' }), fill(ts['several.sumNotSent'], { count: '1' })].join(' '))).toBeInTheDocument();
    expect(within(items(d)).queryByText(ts['several.pending'])).toBeNull();
    await waitFor(() => expect(screen.queryAllByText(fill(ts['held.copy'], { name: 'notes.txt', dest: '/tmp/notes.txt' }))).toHaveLength(0));
    expect(sentChanges).toHaveLength(2);
  });

  it('a held item a read proves NOT made says what the read found; nothing is sent again', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'transferNone'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('copy');
    await press(d, 'copy');
    // Core's own read-back after the lost answer settles it: nothing there.
    expect(await within(items(d)).findByText(fill(ts['verdict.copyNone'], { folder: '/tmp' }))).toBeInTheDocument();
    expect(within(items(d)).getByText(ts['several.notSent'])).toBeInTheDocument();
    expect(within(d).getByText([fill(ts['several.sumCopied'], { count: '0' }), fill(ts['several.sumStopped'], { name: 'notes.txt' }), fill(ts['several.sumNotSent'], { count: '1' })].join(' '))).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  });

  it('a refusal stops the run too, in its own words; nothing after it is sent', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await select(/hosts-link/, /notes\.txt/, /report\.pdf/);
    const d = await bulk('copy');
    await within(d).findByText('notes.txt');
    // Another writer puts notes.txt there after the plan was read: the program refuses it (create-only).
    addFile('/tmp/notes.txt');
    await press(d, 'copy');
    expect(await within(items(d)).findByText(fill(ts.exists, { name: 'notes.txt', folder: '/tmp' }))).toBeInTheDocument();
    expect(within(d).getByText([fill(ts['several.sumCopied'], { count: '1' }), fill(ts['several.sumFailed'], { name: 'notes.txt' }), fill(ts['several.sumNotSent'], { count: '1' })].join(' '))).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/hosts-link>/tmp/hosts-link', 'copy:/home/ada/notes.txt>/tmp/notes.txt']);
  });

  it('folders are walked first, as a single folder copy is, then sent with the files', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await select(/projects/, /notes\.txt/);
    const d = await bulk('copy');
    await press(d, 'copy');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects', 'copy:/home/ada/notes.txt>/tmp/notes.txt']);
  });

  it('a folder copied with pipes left out says how many on its line; the dialog stays', async () => {
    addOdd('/home/ada/projects/site', [], ['run.pipe']);
    await renderPage(page, two('/home/ada', '/tmp'));
    await select(/projects/, /notes\.txt/);
    const d = await bulk('copy');
    await press(d, 'copy');
    expect(await within(items(d)).findByText(fill(ts['several.copiedLeft'], { count: '1' }))).toBeInTheDocument();
    expect(await within(d).findByText(fill(ts['several.sumCopied'], { count: '2' }))).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects', 'copy:/home/ada/notes.txt>/tmp/notes.txt']);
  });

  it('a folder copy whose answer is lost and proved made by a read still says what its walk found left out', async () => {
    addOdd('/home/ada/projects/site', [], ['run.pipe']);
    await renderPage(page, two('/home/ada', '/tmp', 'transferLost'));
    await select(/projects/, /notes\.txt/);
    const d = await bulk('copy');
    expect(await within(items(d)).findByText(fill(ts['several.willLeave_one'], { count: '1' }))).toBeInTheDocument();
    await press(d, 'copy');
    await within(items(d)).findByText(ts['several.pending']);
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    expect(await within(items(d)).findByText(fill(ts['several.copiedLeft'], { count: '1' }))).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects']);
  });

  it('a refusal reads in the shared words for its code and status, never a bare "not done"', async () => {
    addFile('/home/ada/busy');
    await renderPage(page, two('/home/ada', '/tmp'));
    await select(/busy/, /notes\.txt/);
    const d = await bulk('copy');
    await press(d, 'copy');
    const words = errorSentence(errorInfo({ outcome: 'failed', status: 409, code: 'FILE_PATH_BUSY' }), { program: true });
    expect(await within(items(d)).findByText(words)).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/busy>/tmp/busy']);
  });

  it('a walk counts only towards the name planned now: a new Keep-both name waits for its own walk', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'siteSlowAgain'));
    await select(/projects/);
    const d = await dialogReady('copy');
    // Another writer makes /tmp/projects; the other side's names are read again, so projects goes to projects-1.
    addDir('/tmp/projects');
    await queryClient.invalidateQueries();
    expect(await within(items(d)).findByText('projects → projects-1')).toBeInTheDocument();
    expect(await within(d).findByText(ts['several.walking'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(sentChanges).toEqual([]);
  });

  it('a double press sends each item once', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await dialogReady('copy');
    await userEvent.dblClick(within(d).getByRole('button', { name: ts['copy.primary'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt', 'copy:/home/ada/report.pdf>/tmp/report.pdf']);
  });

  it('a folder that can\'t be read in full is left out with the walk\'s words; the files still go', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'siteFails'));
    await select(/projects/, /notes\.txt/);
    const d = await bulk('copy');
    expect(await within(items(d)).findByText(fill(ts['walk.failed'], { name: 'projects' }))).toBeInTheDocument();
    await press(d, 'copy');
    expect(await within(d).findByText([fill(ts['several.sumCopied'], { count: '1' }), fill(ts['several.sumLeftOut'], { count: '1' })].join(' '))).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  });

  it('the press waits for every folder\'s walk: one still reading keeps it off', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'siteSlow'));
    await select(/projects/, /notes\.txt/);
    const d = await bulk('copy');
    expect(await within(d).findByText(ts['several.walking'])).toBeInTheDocument();
    await within(items(d)).findByText('notes.txt');
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(sentChanges).toEqual([]);
  });

  it('Stop after this one: the item being sent finishes, nothing after it is sent', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'firstSlow'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('copy');
    await press(d, 'copy');
    // While the first is in flight, the second is waiting, not "not sent".
    expect(await within(d).findByText(fill(ts['several.sumCopied'], { count: '0' }))).toBeInTheDocument();
    expect(within(items(d)).getAllByText(ts['several.waiting'])).toHaveLength(2);
    await userEvent.click(await within(d).findByRole('button', { name: ts['several.stop'] }));
    expect(within(d).getByText(ts['several.stopping'])).toBeInTheDocument();
    expect(await within(d).findByText([fill(ts['several.sumCopied'], { count: '1' }), fill(ts['several.sumNotSent'], { count: '1' })].join(' '), {}, { timeout: 5000 })).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, 15_000);
});

describe('when several items are not sent', () => {
  it('another change on this computer may have gone through: refused before the press', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'secondLost'));
    await select(/notes\.txt/, /report\.pdf/);
    let d = await bulk('copy');
    await press(d, 'copy');
    await within(d).findByText(ts['several.pending']);
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === ts.close && !el.hasAttribute('data-dialog-close') }));
    d = await bulk('copy');
    expect(await within(d).findByText(strings['changes.overlap'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(sentChanges).toHaveLength(2);
  });

  it('more than 5 folders to copy in one press: refused, said with the bound, nothing walked or sent', async () => {
    for (let i = 0; i < 6; i++) addDir(`/tmp/dir-${i}`);
    await renderPage(page, two('/tmp', '/home/ada'));
    await userEvent.click(within(await table()).getByRole('checkbox', { name: 'Select all rows' }));
    const d = await bulk('copy');
    expect(await within(d).findByText(fill(ts['several.tooManyFolders'], { max: '5' }))).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    // Refused before any walk: none of the six folders is read.
    await new Promise((r) => setTimeout(r, 300));
    expect(seen.filter((x) => x.includes('/tmp/dir-'))).toEqual([]);
    expect(sentChanges).toEqual([]);
  });

  it('the other side\'s folder is not listed (its read failed): said so, nothing sent', async () => {
    await renderPage(page, two('/home/ada', '/home/ada/projects/site', 'siteFails'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('copy');
    expect(within(d).getByText(ts['block.otherUnlisted'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(sentChanges).toEqual([]);
  });

  // A destination read that failed is said so, kept names or not, never "Reading…" forever; one nothing
  // answered says the computer isn't reachable. Each retry reads the same folder again; nothing is sent.
  const site = '/home/ada/projects/site';
  const prefix = (x: string) => new RegExp(x.slice(0, x.indexOf('{{')));
  const destRead = async (lose: () => () => void, how: 'reset' | 'refetch') => {
    await renderPage(page, two('/home/ada', site));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await dialogReady('copy');
    const stop = lose();
    const predicate = (q: { queryKey: readonly unknown[] }) => JSON.stringify(q.queryKey).includes(site);
    await act(() => (how === 'reset' ? queryClient.resetQueries({ predicate }) : queryClient.refetchQueries({ predicate })));
    return { d, stop };
  };
  const recovers = async (d: HTMLElement, stop: () => void, retry: string | RegExp) => {
    expect(within(d).queryByText(prefix(ts['several.reading']))).toBeNull();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    stop();
    await userEvent.click(within(d).getByRole('button', { name: retry }));
    await waitFor(() => expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeEnabled());
    expect(sentChanges).toEqual([]);
  };
  it('the destination\'s own read fails with nothing kept: said so with Read again, nothing sent; Read again plans', async () => {
    const { d, stop } = await destRead(() => failListingWhile(site), 'reset');
    try {
      const failed = await within(d).findByText(prefix(ts['several.readFailed']));
      expect(failed.closest('[role="alert"]')).not.toBeNull();
      await recovers(d, stop, ts['several.readAgain']);
    } finally { stop(); }
  });
  it('the destination\'s read fails again while its names are kept: said so too, never "Reading…" forever', async () => {
    const { d, stop } = await destRead(() => failListingWhile(site), 'refetch');
    try {
      expect(await within(d).findByText(prefix(ts['several.readFailed']))).toBeInTheDocument();
      await recovers(d, stop, ts['several.readAgain']);
    } finally { stop(); }
  });
  it('nothing answers the destination\'s read: the computer isn\'t reachable, with Try again; never a plain failure', async () => {
    const { d, stop } = await destRead(() => loseListingWhile(site), 'refetch');
    try {
      expect(await within(d).findByText(/atlas isn't reachable right now/)).toBeInTheDocument();
      expect(within(d).queryByText(prefix(ts['several.readFailed']))).toBeNull();
      await recovers(d, stop, /try again/i);
    } finally { stop(); }
  });

  it('the other side shows this same folder: said so, nothing read or sent', async () => {
    await renderPage(page, two('/home/ada', '/home/ada'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('copy');
    expect(within(d).getByText(ts['block.sameFolder'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(sentChanges).toEqual([]);
  });

  it('another computer on the other side: said so', async () => {
    await renderPage(page, two('/home/ada', '/', undefined, 'cedar.00c3'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('move');
    expect(within(d).getByText(ts['block.otherComputer'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['move.primary'] })).toBeDisabled();
  });

  it('a folder into itself is left out; the others go', async () => {
    await renderPage(page, two('/home/ada', '/home/ada/projects'));
    await select(/projects/, /notes\.txt/);
    const d = await bulk('copy');
    expect(await within(items(d)).findByText(fill(ts['several.intoItself'], { name: 'projects' }))).toBeInTheDocument();
    await press(d, 'copy');
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/home/ada/projects/notes.txt']));
  });
});

describe('move several items', () => {
  it('moves each item once, judged where it resolves, and closes', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('move');
    await press(d, 'move');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sentChanges).toEqual(['move:/home/ada/notes.txt>/tmp/notes.txt', 'move:/home/ada/report.pdf>/tmp/report.pdf']);
  });

  it('a system path is left out, to be moved on its own (where its name is typed); the others go', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await select(/notes\.txt/, /hosts-link/);
    const d = await bulk('move');
    expect(await within(items(d)).findByText(fill(ts['several.move.protected'], { name: 'hosts-link' }))).toBeInTheDocument();
    await press(d, 'move');
    expect(await within(d).findByText([fill(ts['several.sumMoved'], { count: '1' }), fill(ts['several.sumLeftOut'], { count: '1' })].join(' '))).toBeInTheDocument();
    expect(sentChanges).toEqual(['move:/home/ada/notes.txt>/tmp/notes.txt']);
  });

  it('a folder holding an open storage is left out; nothing of it is moved', async () => {
    await renderPage(page, two('/', '/tmp'));
    await select(/\bsrv\b/, /\bhome\b/);
    const d = await bulk('move');
    expect(await within(items(d)).findByText(fill(ts['several.move.holdsMount'], { name: 'srv' }))).toBeInTheDocument();
  });

  it('while the open storages cannot be read, folders are left out; files can still go', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'mountsDown'));
    await select(/projects/, /notes\.txt/);
    const d = await bulk('move');
    expect(await within(items(d)).findByText(ts['several.move.mountsUnknown'])).toBeInTheDocument();
    expect(within(items(d)).getAllByText(/^Left out/)).toHaveLength(1);
    await waitFor(() => expect(within(d).getByRole('button', { name: ts['move.primary'] })).toBeEnabled());
  });

  it('a system folder as the destination leaves every item out (each is moved on its own, its name typed)', async () => {
    await renderPage(page, two('/home/ada', '/etc'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('move');
    await waitFor(() => expect(within(items(d)).getAllByText(ts['several.move.protected'])).toHaveLength(2));
    expect(within(d).getByText(ts['several.nothing'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['move.primary'] })).toBeDisabled();
  });

  it('where the items are can\'t be read: refused, nothing sent', async () => {
    await renderPage(page, two('/home/ada', '/tmp', 'realFails'));
    await select(/notes\.txt/, /report\.pdf/);
    const d = await bulk('move');
    expect(await within(d).findByText(ts['move.checkFailed'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['move.primary'] })).toBeDisabled();
    expect(sentChanges).toEqual([]);
  });

  it('an item on another place than the destination is left out, to be copied on its own', async () => {
    await renderPage(page, two('/home/ada', '/srv/media'));
    await select(/projects/, /notes\.txt/);
    const d = await bulk('move');
    await waitFor(() => expect(within(items(d)).getAllByText(ts['several.move.places'])).toHaveLength(2));
    expect(await within(d).findByText(ts['several.nothing'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['move.primary'] })).toBeDisabled();
  });
});
