// Playwright: the search proofs' own behaviour (app/e2e-search.ts), on the demo page with the built-in `page`,
// never the shared pages. Each fault is a page-level write injected from here (page.evaluate: a history write, a link
// added to the DOM), never app code; each case states the exact error the helper must give, never a timeout.
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub } from '@app/e2e';
import { withSampler } from '@app/e2e-search';
import strings from '../../pages/demo/strings.en.json';

const TEXT = 'kestrel';
const rows = (page: Page) => page.getByRole('table', { name: strings.title }).locator('tbody tr');
const box = (page: Page) => page.getByRole('searchbox');
const view = (page: Page) => ({ param: '', box: box(page) });
// Ten demo rows are named kestrel-1 … kestrel-10 (fixtures.ts: 120 rows over 12 names).
const searched = (page: Page) => async () => {
  await expect(rows(page)).toHaveCount(10);
  for (const r of await rows(page).all()) await expect(r).toContainText(TEXT);
};

/** After the user's next keystroke in the search box, run `fault` in the page (once). */
async function onTyping(page: Page, fault: string, delay = 0): Promise<void> {
  await page.evaluate(
    ([src, ms]) => {
      document.addEventListener('input', () => setTimeout(() => new Function(src as string)(), ms as number), { once: true, capture: true });
    },
    [fault, delay] as const,
  );
}
const withQ = (key: string) => `const u = new URL(location.href); u.hash += (u.hash.includes('?') ? '&' : '?') + '${key}=${TEXT}'; history.replaceState(history.state, '', u.href);`;
const addLink = (where: string, mark = '') => `const a = document.createElement('a'); a.href = '#/demo?q=${TEXT}'; a.textContent = 'x'; ${mark ? `a.dataset.${mark} = '';` : ''} ${where}.append(a);`;

test.describe('expectSearchStaysOutOfUrl', () => {
  test('passes on the demo page: the typed search stays off every surface', async ({ page }) => {
    await gotoHub(page, '/demo');
    await expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: searched(page) });
  });

  test('the search written under another key fails, naming that key', async ({ page }) => {
    await gotoHub(page, '/demo');
    await onTyping(page, withQ('zq'), 50);
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: searched(page) })).rejects.toThrow(`leak: "${TEXT}" appeared on the zq key after`);
  });

  test('the text in history state fails as a leak on history state', async ({ page }) => {
    await gotoHub(page, '/demo');
    await onTyping(page, `history.replaceState({ ...history.state, t: '${TEXT}' }, '');`, 50);
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: searched(page) })).rejects.toThrow(`leak: "${TEXT}" appeared on history state after`);
  });

  test('the text percent-encoded in history state fails as a leak on history state', async ({ page }) => {
    await gotoHub(page, '/demo');
    const enc = [...TEXT].map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).join('');
    await onTyping(page, `history.replaceState({ ...history.state, t: '${enc}' }, '');`, 50);
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: searched(page) })).rejects.toThrow(`leak: "${TEXT}" appeared on history state after`);
  });

  test('a row link that carries the search fails as a leak on a link', async ({ page }) => {
    await gotoHub(page, '/demo');
    await onTyping(page, addLink("document.querySelector('#hub-main tbody td')"), 50);
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: searched(page) })).rejects.toThrow(`leak: "${TEXT}" appeared on a link`);
  });

  test('links drawn 500 ms after the rows, waited for by searched, fail as a leak on a link (never a timeout)', async ({ page }) => {
    await gotoHub(page, '/demo');
    await onTyping(page, addLink("document.querySelector('#hub-main tbody td')", 'late'), 500);
    const late = async () => {
      await searched(page)();
      await expect(page.locator('a[data-late]')).toHaveCount(1);
    };
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: late })).rejects.toThrow(`leak: "${TEXT}" appeared on a link`);
  });

  test('a leaking link in a portal outside #hub-main fails too (the scan is page-wide)', async ({ page }) => {
    await gotoHub(page, '/demo');
    await onTyping(page, addLink('document.body'), 50);
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: searched(page) })).rejects.toThrow(`leak: "${TEXT}" appeared on a link`);
  });

  // An outside write of the view's own q is adopted by the view at once (it reads like a link), so the faults below use
  // another key; the view writing its own q back is the caller-integration mutant (a DataTableView source mutant).
  test('a URL write 400 ms after the search, undone 150 ms later, is caught by the sampler', async ({ page }) => {
    await gotoHub(page, '/demo');
    await onTyping(page, `${withQ('zq')} setTimeout(() => { const u = new URL(location.href); u.hash = u.hash.replace(/[?&]zq=${TEXT}/, ''); history.replaceState(history.state, '', u.href); }, 150);`, 400);
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: searched(page) })).rejects.toThrow(`leak: "${TEXT}" appeared on the zq key after`);
    // Undone: the final scan alone would have passed.
    expect(page.url()).not.toContain(`zq=${TEXT}`);
  });

  test('precondition: the text already on a link fails before typing, as a test error', async ({ page }) => {
    await gotoHub(page, '/demo');
    await page.evaluate(addLink('document.body'));
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: searched(page) })).rejects.toThrow(`precondition: "${TEXT}" is already on a link`);
    await expect(box(page)).toHaveValue('');
  });

  test('precondition: a searched that already holds before the search fails', async ({ page }) => {
    await gotoHub(page, '/demo');
    const weak = async () => {
      await expect(rows(page).first()).toBeVisible();
    };
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: weak })).rejects.toThrow('precondition: searched already holds');
  });

  test('a text shorter than 4 characters is refused', async ({ page }) => {
    await gotoHub(page, '/demo');
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: 'kes', searched: searched(page) })).rejects.toThrow('at least 4 characters');
  });
});

test.describe('expectLinkSearchDroppedOnReload', () => {
  // Status active: 72 rows, page 2 holds 51-72; six of them are kestrel rows (page 2 of one is shown as its last page).
  const proof = (page: Page) => ({
    text: TEXT,
    path: '/demo?status=active',
    keep: { sort: 'name', page: '2' },
    searched: async () => {
      await expect(rows(page)).toHaveCount(6);
      for (const r of await rows(page).all()) await expect(r).toContainText(TEXT);
    },
    unsearched: async () => {
      await expect(rows(page)).toHaveCount(22);
    },
    after: async () => {
      await expect(page.getByRole('navigation', { name: 'Pages' })).toContainText('51');
    },
  });

  test('passes on the demo page: adopted, out of the URL, gone after the reload, sort and page kept', async ({ page }) => {
    await expectLinkSearchDroppedOnReload(page, view(page), proof(page));
  });

  test('a history write of the text while the link is adopted, undone 200 ms later, is caught', async ({ page }) => {
    // In every Hub document of this test: when the address first carries q=<text> (the link: a same-document move, so
    // popstate), put the text in history state at once and keep it there until 200 ms after the page is free to run
    // timers again (the router's adoption work comes first and replaces the state), then take it out.
    await page.addInitScript((text) => {
      let done = false;
      const start = () => {
        if (done || !location.hash.includes(`q=${text}`)) return;
        done = true;
        const hold = () => {
          const st = (history.state ?? {}) as Record<string, unknown>;
          if (st.t !== text) history.replaceState({ ...st, t: text }, '');
        };
        hold();
        let until = 0;
        const iv = setInterval(() => {
          until ||= Date.now() + 200;
          if (Date.now() <= until) return hold();
          clearInterval(iv);
          const { t: _t, ...rest } = (history.state ?? {}) as Record<string, unknown>;
          history.replaceState(rest, '');
        }, 5);
      };
      addEventListener('popstate', start);
      addEventListener('hashchange', start);
      start();
    }, TEXT);
    await expect(expectLinkSearchDroppedOnReload(page, view(page), proof(page))).rejects.toThrow(`leak: "${TEXT}" appeared on history state after the link`);
  });

  test('a search the view drops on its own before the reload fails', async ({ page }) => {
    // Once the adoption checks have passed, while the settle window runs, the box is emptied.
    const drop = async () => {
      setTimeout(() => void box(page).fill('').catch(() => {}), 300);
    };
    await expect(expectLinkSearchDroppedOnReload(page, view(page), { ...proof(page), before: drop })).rejects.toThrow(`the box no longer holds "${TEXT}" before the reload`);
  });

  test('a keep without page is refused before anything opens', async ({ page }) => {
    await expect(expectLinkSearchDroppedOnReload(page, view(page), { ...proof(page), keep: { sort: 'name' } })).rejects.toThrow('required keep key page missing for a list view');
    expect(page.url()).toBe('about:blank');
  });

  test('the text on a kept value is a precondition error', async ({ page }) => {
    await expect(expectLinkSearchDroppedOnReload(page, view(page), { ...proof(page), keep: { sort: 'name', page: '2', sel: `${TEXT}-1` } })).rejects.toThrow(`precondition: "${TEXT}" is already on keep sel`);
  });
});

test.describe('the sampler', () => {
  test('a searched that throws: the helper throws that error and reads nothing after it', async ({ page }) => {
    await gotoHub(page, '/demo');
    await page.evaluate(() => {
      const d = Object.getOwnPropertyDescriptor(History.prototype, 'state')!;
      const w = window as unknown as { reads: number };
      w.reads = 0;
      Object.defineProperty(history, 'state', { configurable: true, get() { w.reads++; return d.get!.call(this); } });
    });
    let calls = 0;
    const boom = async () => {
      calls++;
      if (calls === 1) throw new Error('not yet'); // the baseline run
      await searched(page)();
      throw new Error('boom from searched');
    };
    await expect(expectSearchStaysOutOfUrl(page, view(page), { text: TEXT, searched: boom })).rejects.toThrow('boom from searched');
    const reads = () => page.evaluate(() => (window as unknown as { reads: number }).reads);
    const a = await reads();
    expect(a).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    expect(await reads()).toBe(a);
  });

  test('a navigation in the middle of sampling: the loop goes on after the destroyed context, and stops at the end', async ({ page }) => {
    await gotoHub(page, '/demo');
    let samples: readonly unknown[] = [];
    await withSampler(page, TEXT, '', false, async (s) => {
      samples = s.samples;
      await expect.poll(() => s.samples.length).toBeGreaterThan(1);
      await page.reload();
      await page.locator('#hub-main').waitFor();
      const n = s.samples.length;
      await expect.poll(() => s.samples.length).toBeGreaterThan(n + 2);
    });
    const ended = samples.length;
    await page.waitForTimeout(300);
    expect(samples.length).toBe(ended);
  });
});
