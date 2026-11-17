// A search where some places did not answer never says every place was searched.
import { describe, expect, it } from 'vitest';
import { interpolate } from '@kit';
import { renderPage, screen, userEvent } from '@app/testing';
import { harness as page } from './launch/harness';
import strings from './strings.en.json';

const search = async (state: string) => {
  await renderPage(page, { path: '/apps?launch=1', state });
  await userEvent.type(await screen.findByRole('searchbox', { name: strings['launch.search'] }), 'zzzzzz');
  return screen.findByText(/^Nothing found for “zzzzzz”/, undefined, { timeout: 8000 });
};

describe('Launch an app: nothing found when places failed', () => {
  it('every place failed: "Nothing found" never claims they were all searched', async () => {
    await search('search-down');
    expect(screen.queryByText(strings['find.noneBody'])).toBeNull();
    expect(screen.getByText(strings['find.noneSomeFailed'])).toBeInTheDocument();
    // the title is scoped to the places that answered, never a whole "Nothing found"
    expect(screen.queryByText(interpolate(strings['find.noneTitle'], { q: 'zzzzzz' }))).toBeNull();
  }, 30000);

  it('every place answered with nothing: the whole-search words stay', async () => {
    await search('search-none');
    expect(screen.getByText(strings['find.noneBody'])).toBeInTheDocument();
    expect(screen.queryByText(strings['find.noneSomeFailed'] ?? '\u0000never')).toBeNull();
  }, 30000);

  it('words typed after a finished search are "Looking…" until they are sent, never "Nothing found" for them', async () => {
    await search('search-none');
    await userEvent.type(screen.getByRole('searchbox', { name: strings['launch.search'] }), 'q');
    expect(screen.queryByText(interpolate(strings['find.noneTitle'], { q: 'zzzzzzq' }))).toBeNull();
    expect(screen.getByText(strings['find.looking'])).toBeInTheDocument();
    expect(await screen.findByText(interpolate(strings['find.noneTitle'], { q: 'zzzzzzq' }), undefined, { timeout: 8000 })).toBeInTheDocument();
  }, 30000);

  it('long words edited down to short ones are "Looking…" until sent, never "No program ready to install matches" for them', async () => {
    await search('search-none');
    const box = screen.getByRole('searchbox', { name: strings['launch.search'] });
    await userEvent.clear(box);
    await userEvent.type(box, 'f');
    expect(screen.queryByText(interpolate(strings['find.shortTitle'], { q: 'f' }))).toBeNull();
    expect(screen.getByText(strings['find.looking'])).toBeInTheDocument();
  }, 30000);
});
