// Vitest (faq-ai): the AI tab's questions show as a "Questions" section on the Models screen only, all seventeen, each closed.
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

const IDS = [
  'defaultModel', 'keyKept', 'claudeCode', 'agents', 'skillTrust', 'instructionsMemory', 'autoKinds', 'workflowRuns', 'rulesHooks', 'connections', 'settle',
  'autoRun', 'autoCancel', 'autoUnsure', 'autoNotSent', 'loopChange', 'forkUnconfirmed',
] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];
const a = (id: (typeof IDS)[number]) => strings[`faq.${id}.a` as const];
const SLOW = { timeout: 5000 };

// As page.test.ts: the page's own chunk loads once per file before the first visit.
beforeAll(async () => {
  await import('./tab');
}, 120_000);

describe('ai questions', () => {
  it('Models lists the seventeen questions, each closed, under the kit "Questions" heading; keyKept and settle open their answers', async () => {
    await renderPage(page, { path: '/ai/models' });
    await screen.findByRole('heading', { name: kitStrings['faq.title'] }, SLOW);
    for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) }, SLOW)).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(screen.getByRole('button', { name: q('keyKept') }));
    await waitFor(() => expect(screen.getByText(a('keyKept'))).toBeVisible());
    // The settle answer opens too, with its own words.
    await userEvent.click(screen.getByRole('button', { name: q('settle') }));
    await waitFor(() => expect(screen.getByText(a('settle'))).toBeVisible());
  });
});
