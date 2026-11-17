// Vitest: on the Bots page a task row's title is a chat link only when this load serves the AI page and
// the chat reference is one a link may carry; otherwise the title is plain text and the row still says where the task runs.
import { cleanup, screen } from '@testing-library/react';
import { renderPage, within } from '@app/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import page from './page';
import S from './strings.en.json';

const served = vi.hoisted(() => ({ ai: true, refuse: false }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  const real = kit.usePageLink as (id: string) => unknown;
  return { ...kit, usePageLink: (id: string) => (id === 'ai' && !served.ai ? null : real(id)) };
});
vi.mock('../ai/links', async (orig) => {
  const links = await orig<Record<string, unknown>>();
  const real = links.chatLink as (r: unknown) => string;
  return { ...links, chatLink: (r: unknown) => (served.refuse ? '' : real(r)) };
});

beforeAll(async () => {
  await import('./view');
}, 30000);
afterEach(() => {
  cleanup();
  served.ai = true;
  served.refuse = false;
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const NAME = "Read deploy log: open the task's chat";

async function taskRows() {
  await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
  const log = within(await screen.findByRole('list', { name: S['activity.title'] }));
  // "· on atlas" is the place the delegate join adds; the fixture's own text ("started on atlas.") has no such mark.
  const rows = await log.findAllByText(/· on atlas/);
  return { log, rows };
}

describe('a task row with no chat link', () => {
  it('with the AI page served and a usable reference, the title links (control)', async () => {
    const { log } = await taskRows();
    expect((await log.findAllByRole('link', { name: NAME })).length).toBeGreaterThan(0);
  });

  it('this load does not serve the AI page: the title is plain text, the place still shows', async () => {
    served.ai = false;
    const { log, rows } = await taskRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const el of rows) expect(el.textContent).toContain('Read deploy log · on atlas');
    expect(log.queryAllByRole('link', { name: /open the task's chat/ })).toHaveLength(0);
  });

  it('the chat reference is refused: the title is plain text, the place still shows', async () => {
    served.refuse = true;
    const { log, rows } = await taskRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const el of rows) expect(el.textContent).toContain('Read deploy log · on atlas');
    expect(log.queryAllByRole('link', { name: /open the task's chat/ })).toHaveLength(0);
  });
});
