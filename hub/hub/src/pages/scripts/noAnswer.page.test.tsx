// Vitest: when the only running computer did not answer, the page says so and offers Try again,
// never "No computer selected".
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

describe('scripts: a running computer that did not answer', () => {
  it('names the computer, offers Try again, and does not say no computer is selected', async () => {
    await renderPage(page, { state: 'noAnswer', path: '/scripts' });
    const title = strings['noAnswer.title'].replace('{{name}}', 'atlas');
    expect(await screen.findByText(title, undefined, { timeout: 14000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: kitStrings['action.retry'] })).toBeInTheDocument();
    expect(screen.queryByText(/No computer selected/)).toBeNull();
  });
});
