// Jump to leaves out the AI page's Models places with no computer shown: /models
// then draws the shared pick-a-computer state, not its sections, settings or questions. Read against the real deep
// index, and through the reader the shell loads (manifest searchHide) in the page's own context.
import { renderPage, screen } from '@app/testing';
import { hidesTail } from '@kit';
import { DEEP } from 'virtual:hub-search-index';
import { describe, expect, it } from 'vitest';
import page from './page';
import useAiSearchHide, { aiHide, opensInsideModels } from './searchHide';

const mine = DEEP.filter((e) => e.page === 'ai');

describe('AI in Jump to', () => {
  it('no computer shown: none of the Models places, and every other AI place', () => {
    const models = mine.filter((e) => e.to.startsWith('/models'));
    expect(models.length).toBeGreaterThan(10);
    const h = aiHide({ computer: false, read: undefined });
    expect(mine.filter((e) => !hidesTail(h, e.to))).toEqual(mine.filter((e) => !e.to.startsWith('/models')));
  });

  it('no computer shown: the commands into a Models place (connect, Claude Code, spending) go too, the page links stay', () => {
    const named = aiHide({ computer: false })?.commands ?? [];
    const cmds = page.commands ?? [];
    // Spelled out, not the reader's own rule again: a new command into Models must be judged here by hand.
    expect(named).toEqual(['connect', 'openai', 'anthropic', 'google', 'mimo', 'claude', 'spending']);
    for (const kept of ['open', 'models', 'model']) expect(named).not.toContain(kept);
    expect(cmds.map((c) => c.id).sort()).toEqual([...named, 'open', 'models', 'model'].sort());
  });

  it.each([
    ['/ai/models?pick=helper', false],
    ['/ai/models', false],
    [undefined, false],
    ['/ai', false],
    ['/ai/keys?section=claude', false],
    ['/ai/models?connect=new', true],
    ['/ai/models?section=claude', true],
    ['/ai/models?autopick=helper', true],
    ['/ai/models?x=pick=helper', true],
    ['/ai/models?connect=openai&pick=helper', true],
    ['/ai/models?pick=helper#faq-x', false],
    // Read as URL params: an encoded key, a repeated or bare pick, an empty query, a hash before the query, a second ?
    // (part of the pick's value) all leave a link with nothing but a pick; a key in another case, or a second key, does not.
    ['/ai/models?%70ick=helper', false],
    ['/ai/models?pick=a&pick=b', false],
    ['/ai/models?pick', false],
    ['/ai/models?', false],
    ['/ai/models#x?section=claude', false],
    ['/ai/models?pick=x?section=claude', false],
    ['/ai/models?Pick=helper', true],
    ['/ai/models?pick=&connect', true],
  ] as const)('opensInsideModels(%s) = %s: only a link to a Models place goes, a link with nothing but a pick stays', (to, goes) => {
    expect(opensInsideModels(to)).toBe(goes);
  });

  it('a computer shown, or a computer list still read or not known: every place', () => {
    for (const s of [{ computer: true }, { computer: false, read: 'loading' as const }, { computer: false, read: 'unknown' as const }]) {
      expect(aiHide(s), JSON.stringify(s)).toBeNull();
    }
  });

  const Probe = () => <output>{JSON.stringify(useAiSearchHide())}</output>;
  const probe = { ...page, load: async () => ({ default: Probe }) };
  it.each([
    [false, JSON.stringify({ hide: ['/models'], commands: ['connect', 'openai', 'anthropic', 'google', 'mimo', 'claude', 'spending'] })],
    [true, 'null'],
  ])('the reader with a computer shown %s: %s', async (computer, want) => {
    await renderPage(probe, computer ? {} : { computer: false });
    expect(await screen.findByText(want, {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
