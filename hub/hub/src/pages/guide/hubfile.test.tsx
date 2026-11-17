// Vitest: the Guide's "Build your own" section ends with "The Hub as one file" where the served page says its Hoody has
// the file (<html data-hub-file="1">, core hubFileUrl): one sentence saying what the file is, and a Download action
// that saves /auth/hoody-hub.html through a link with `download`. Without the mark the part is not drawn, so the Guide
// never offers a download that would not be found.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const text = strings as Record<string, string>;
// The first render of a file loads the page cold: up to 30 s for it to appear (the cold load can be slow on a busy machine).
const drawn = () => screen.findByRole('heading', { level: 2, name: strings['look.title'] }, { timeout: 30_000 });
const subTitles = () =>
  [...(document.getElementById('guide-build') as HTMLElement).querySelectorAll('[data-hub-section="sub"]')].map((s) => s.querySelector('[data-hub-heading]')?.textContent);

afterEach(() => {
  document.documentElement.removeAttribute('data-hub-file');
  vi.restoreAllMocks();
});

describe('Guide: the Hub as one file', () => {
  it('with the file on this Hoody: the last part of Build says what it is and Download saves it', async () => {
    document.documentElement.setAttribute('data-hub-file', '1');
    const saved: [string | null, string][] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push([this.getAttribute('href'), this.download]);
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page);
    await drawn();
    expect(text['build.file']).toBe('The Hub as one file');
    expect(subTitles()).toEqual([strings['build.see'], strings['build.same'], strings['build.dashboard'], text['build.file']]);
    const build = screen.getByRole('region', { name: strings['build.title'] });
    expect(build.textContent).toContain(text['build.fileBody']);
    await userEvent.setup().click(within(build).getByRole('button', { name: text['build.fileGetName'] as string }));
    expect(saved).toEqual([['/auth/hoody-hub.html', 'hoody-hub.html']]);
    expect(open).not.toHaveBeenCalled();
  }, 45_000);

  it('without the page mark: Build keeps its three parts and offers no download', async () => {
    await renderPage(page);
    await drawn();
    expect(subTitles()).toEqual([strings['build.see'], strings['build.same'], strings['build.dashboard']]);
    expect(screen.queryByRole('button', { name: /Download the Hub/ })).toBeNull();
    // The sentence exists for the part above: it says where the file runs and what it hands back to this Hub.
    expect(text['build.fileBody']).toMatch(/one HTML file/);
    expect(text['build.fileBody']).toMatch(/payments/);
  }, 45_000);
});
