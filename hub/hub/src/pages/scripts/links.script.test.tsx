// Vitest: links.script is the address other pages use to open one script selected here: ?sel= with the
// computer's handle and the path inside its folder, ?exec= for a folder other than 1, and no address at all when it could
// not select a script. The address it builds opens that script selected on this page.
import { computerHandle, fixtureWorld } from '@core';
import { renderPage, screen, waitFor } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { links } from './links';
import page from './page';

describe('links.script', () => {
  it.each([
    ['folder 1', 'atlas.00a1', 'default/1/jobs/a.ts', '/scripts?sel=atlas.00a1~jobs%2Fa.ts'],
    ['folder 3 adds its folder', 'atlas.00a1', 'default/3/jobs/a.ts', '/scripts?sel=atlas.00a1~jobs%2Fa.ts&exec=3'],
    ['a path in no folder', 'atlas.00a1', 'jobs/a.ts', null],
    ['the folder itself', 'atlas.00a1', 'default/1/', null],
    ['no handle', '', 'default/1/jobs/a.ts', null],
    ['a file the page does not list as a script', 'atlas.00a1', 'default/1/readme.txt', null],
    ['a script under a reserved folder', 'atlas.00a1', 'default/1/node_modules/job.ts', null],
  ])('%s', (_name, h, rel, want) => {
    expect(links.script(h, rel)).toBe(want);
  });

  it('the address it builds opens that script selected on the Scripts page', async () => {
    const handle = computerHandle({ id: fixtureWorld.current.id, name: fixtureWorld.current.name });
    const href = links.script(handle, 'default/1/daily-digest.ts');
    expect(href).toBe(`/scripts?sel=${encodeURIComponent(`${handle}~daily-digest.ts`)}`);
    const { container } = await renderPage(page, { state: 'default', path: href! });
    // Under a loaded host the page can sit on its skeleton past a short find: wait for it to leave first.
    await waitFor(() => expect(container.querySelector('[data-skeleton]')).toBeNull(), { timeout: 20000 });
    expect((await screen.findAllByRole('heading', { name: 'Daily digest' }, { timeout: 8000 })).length).toBeGreaterThan(0);
  }, 40000);
});
