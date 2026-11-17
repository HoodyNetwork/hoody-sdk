// Vitest: a ticket whose first read fails for another reason than absence (a 503 here) says it did not load
// and offers Try again and Back, never "not found"; Try again once the server answers shows the thread. A ticket the
// server says is gone (404) still says not found (control).
import { renderPage, screen, userEvent } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import kit from '@kit/strings.en.json';
import { T_LONG, requestLog } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const w = vi.hoisted(() => ({ down: true }));
vi.mock('./fixtures', async (importOriginal) => {
  const orig = (await importOriginal()) as { default: { default: string; states: Record<string, unknown[]> } };
  // Imported here: the factory runs before this file's own imports are bound.
  const { answers, reply } = await import('@core');
  const { routes } = await import('./routes');
  // The default world, with every ticket read refused 503 (support unavailable) while `w.down` holds.
  const readDown = [reply(routes.get, answers.refused(503, 'SUPPORT_UNAVAILABLE'), { when: () => w.down }), ...orig.default.states.default!];
  return { ...orig, default: { ...orig.default, states: { ...orig.default.states, readDown } } };
});

const SLOW = { timeout: 10000 };

beforeEach(() => {
  w.down = true;
  requestLog.length = 0;
});

describe('a ticket that did not load', () => {
  it('a failed first read says so with Try again and Back; Try again shows the thread once the server answers', async () => {
    await renderPage(page, { state: 'readDown', path: `/support?sel=${String(T_LONG.id)}` });
    expect(await screen.findByText(strings['thread.readFailed'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(strings['thread.notFound'])).toBeNull();
    expect(screen.getAllByRole('button', { name: strings['action.back'] }).length).toBeGreaterThan(0);
    w.down = false;
    await userEvent.click(screen.getByRole('button', { name: kit['action.retry'] }));
    expect(await screen.findByText('Message number 60 of the long thread.', undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(strings['thread.readFailed'])).toBeNull();
  });

  it('control: a ticket the server says is gone (404) still says not found', async () => {
    w.down = false;
    await renderPage(page, { state: 'readDown', path: `/support?sel=${'0'.repeat(22)}ff` });
    expect(await screen.findByText(strings['thread.notFound'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(strings['thread.readFailed'])).toBeNull();
  });
});
