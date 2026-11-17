// A copy the shown realm refuses (403 INSUFFICIENT_PERMISSIONS, "Project is not in requested realm")
// says what to change, never a bare "Didn't go through"; in All realms the same code keeps the kit's permission words.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers, copySends } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';

const c = computers[0];
if (!c) throw new Error('fixture computer');

async function copyOnce(realm?: string) {
  await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c!))}&tab=ports`, state: 'copyRealmRefused', ...(realm ? { realm } : {}) });
  // The first render of a run also loads the page's parts; on a busy host that alone can pass 8 s.
  await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', c!.name) }, { timeout: 30000 }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
  const dlg = await screen.findByRole('dialog');
  const go = within(dlg).getByRole('button', { name: strings['copyd.go'] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(go);
  return dlg;
}

beforeEach(() => {
  copySends.length = 0;
});

describe('computers: a copy the realm refuses', () => {
  it('in a realm: the kit\'s refusal line stays and the note names the realm\'s rules; not held, sent once', async () => {
    const dlg = await copyOnce();
    expect(await within(dlg).findByText(strings['copyd.realmRefused'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(dlg).getByText(/You don't have permission to do this/)).toBeInTheDocument();
    expect(within(dlg).queryByText(/may already have been made|may have gone through/i)).toBeNull();
    expect(copySends).toHaveLength(1);
  }, 60000);

  it('in All realms: the kit\'s permission sentence, not the realm one', async () => {
    const dlg = await copyOnce('all');
    expect(await within(dlg).findByText(/You don't have permission to do this/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(dlg).queryByText(strings['copyd.realmRefused'])).toBeNull();
    expect(copySends).toHaveLength(1);
  }, 60000);
});
