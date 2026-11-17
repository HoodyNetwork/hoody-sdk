// Playwright: a range program's per-port actions stay in the inspector's Ports table at every width, and so does each
// port's state (where Port, State and Address no longer fit side by side the table turns into two-line rows: port and
// state, then the address and alias on the meta line). A port's Start or Restart is on its row, its Stop in the row's
// ⋯ menu; a single port can be stopped from there, on a desktop and on a phone. partsactions.test.ts proves which
// request the press sends.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const portsOf = (page: Page) => page.getByRole('table', { name: 'Ports of api' });
// A Ports row's name starts with its expand button ("Show details"), then the port: rows are found by /^(Show details )?<port>\b/.

async function stopOnePort(page: Page) {
  await gotoHub(page, '/programs?sel=prog%3A2', { latency: 'slow' });
  const ports = portsOf(page);
  await expect(ports).toBeVisible();
  // Each port's own state stays beside it (the stopped one reads Stopped, the running ones Running).
  await expect(ports.getByRole('row', { name: /^(Show details )?8002\b/ }).getByText('Stopped', { exact: true })).toBeVisible();
  await expect(ports.getByRole('row', { name: /^(Show details )?8000\b/ }).getByText('Running', { exact: true })).toBeVisible();
  // Each port's main action is on its row: Restart for a running port, Start for a stopped one.
  await expect(ports.getByRole('button', { name: 'Restart port 8001 of api' })).toBeVisible();
  await expect(ports.getByRole('button', { name: 'Start port 8002 of api' })).toBeVisible();
  // Stop is in the row's menu (a later refresh can mount the row anew: every step finds its control again).
  await ports.getByRole('row', { name: /^(Show details )?8000\b/ }).getByRole('button', { name: 'Row actions' }).click();
  await page.getByRole('menuitem', { name: 'Stop port 8000 of api' }).click();
  // The press reaches the send: the program's actions, every port's included, wait while it is out.
  await expect(ports.getByRole('button', { name: 'Restart port 8001 of api' })).toBeDisabled();
  await expect(ports.getByRole('button', { name: 'Start port 8002 of api' })).toBeDisabled();
}

test.describe('per-port actions in the inspector', () => {
  test('@parts a single port stops from the Ports table at 1440', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stopOnePort(page);
  });
  test('@parts a single port stops from the Ports table at 390', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stopOnePort(page);
  });
  test('@parts a single port stops from the Ports table at 320, in two-line rows', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await stopOnePort(page);
  });
});

const CONTROLS = 'button, a[href], [role="button"]';

/**
 * Every list meta line on the page: its height, whether it holds the injected word field, and for each control in it
 * how much of the control and its focus ring every clipping ancestor inside its table cuts, measured against each
 * clip's padding box on the axes it clips. The ring's reach is read from the control's own --focus-ring (offset + blur
 * + spread of its widest shadow). `hidden` is a control wholly outside a clip on a clipped axis; `spill` is how far the
 * control reaches outside its meta field (where it would take taps meant for the row beneath); `focused` is the focused
 * element, with its focus-visible mark and drawn shadow read in the same pass. A clip-path `inset()` in px (line 2 clips
 * its start side, listmeta-wrap) is measured as a clip on all four sides. `rows` is how many lines of fields the meta
 * line wraps onto. Throws on a clip this model cannot measure (any other clip-path, overflow-clip-margin, a scaling or
 * rotating transform) anywhere above a control, page included, or on a ring it cannot read, so the approximation never
 * passes in silence.
 */
async function metaLines(page: Page) {
  return page.evaluate((sel) => {
    const reachOf = (el: HTMLElement) => {
      const ring = getComputedStyle(el).getPropertyValue('--focus-ring');
      // Each shadow's lengths (x, y, blur, spread; zero may be unitless); commas inside a colour's parentheses are not shadows.
      const shadows = ring.split(/,(?![^(]*\))/).map((x) => x.trim().split(/\s+/).filter((t) => /^-?[\d.]+(px)?$/.test(t)).map((t) => Number.parseFloat(t)));
      if (!shadows.length || shadows.some((l) => l.length < 2)) throw new Error(`metaLines: no focus ring to measure on ${el.outerHTML.slice(0, 80)}: "${ring}"`);
      return Math.max(...shadows.map(([x = 0, y = 0, blur = 0, spread = 0]) => Math.max(Math.abs(x), Math.abs(y)) + blur + spread));
    };
    // A clip-path inset(top right bottom left) of px lengths (1 to 4 values, no round): the four insets, else null.
    const insetOf = (v: string) => {
      const m = /^inset\(([^)]*)\)$/.exec(v.trim());
      const parts = m?.[1]?.trim().split(/\s+/) ?? [];
      if (!m || parts.length < 1 || parts.length > 4 || parts.some((x) => !/^-?[\d.]+(px)?$/.test(x))) return null;
      const [a = 0, b = a, c = a, d = b] = parts.map((x) => Number.parseFloat(x));
      return { top: a, right: b, bottom: c, left: d };
    };
    const unmeasured = (c: Element) => {
      const st = getComputedStyle(c);
      const m = /^matrix\(([^)]*)\)$/.exec(st.transform);
      const [a, b, cc, d] = m?.[1]?.split(',').map(Number) ?? [];
      if (st.transform !== 'none' && !(a === 1 && b === 0 && cc === 0 && d === 1)) return `transform ${st.transform}`;
      if (st.scale !== 'none' || st.rotate !== 'none') return `scale ${st.scale} rotate ${st.rotate}`;
      if (st.clipPath !== 'none' && insetOf(st.clipPath) === null) return `clip-path ${st.clipPath}`;
      if (st.overflowClipMargin && st.overflowClipMargin !== '0px') return `overflow-clip-margin ${st.overflowClipMargin}`;
      return null;
    };
    const cutOf = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const reach = reachOf(el);
      const box = { top: r.top - reach, bottom: r.bottom + reach, left: r.left - reach, right: r.right + reach };
      let cut = 0;
      let hidden = false;
      let spill = 0;
      for (let c: Element | null = el; c; c = c.parentElement) {
        const why = unmeasured(c);
        if (why) throw new Error(`metaLines: a clip this check cannot measure on ${c.tagName}.${c.className}: ${why}`);
      }
      // Cuts up to the table: the page's own scrollers cut by scroll position, not by the row's layout.
      for (let c = el.parentElement; c && c.tagName !== 'TABLE'; c = c.parentElement) {
        const st = getComputedStyle(c);
        const b = c.getBoundingClientRect();
        if (c.parentElement?.matches('[class*="listMeta"]')) spill = Math.max(0, b.left - r.left) + Math.max(0, r.right - b.right) + Math.max(0, b.top - r.top) + Math.max(0, r.bottom - b.bottom);
        const k = { top: b.top + c.clientTop, left: b.left + c.clientLeft, bottom: b.top + c.clientTop + c.clientHeight, right: b.left + c.clientLeft + c.clientWidth };
        // A clip-path inset clips on both axes at the border box moved in by its insets (a negative inset reaches out).
        const ins = st.clipPath === 'none' ? null : insetOf(st.clipPath);
        if (ins) {
          const q = { top: b.top + ins.top, left: b.left + ins.left, bottom: b.bottom - ins.bottom, right: b.right - ins.right };
          if (r.bottom <= q.top || r.top >= q.bottom || r.right <= q.left || r.left >= q.right) hidden = true;
          cut += Math.max(0, q.top - box.top) + Math.max(0, box.bottom - q.bottom) + Math.max(0, q.left - box.left) + Math.max(0, box.right - q.right);
        }
        // Paint containment clips like overflow, on both axes.
        const paint = /paint|strict|content/.test(st.contain);
        if (paint || st.overflowY !== 'visible') {
          if (r.bottom <= k.top || r.top >= k.bottom) hidden = true;
          cut += Math.max(0, k.top - box.top) + Math.max(0, box.bottom - k.bottom);
        }
        if (paint || st.overflowX !== 'visible') {
          if (r.right <= k.left || r.left >= k.right) hidden = true;
          cut += Math.max(0, k.left - box.left) + Math.max(0, box.right - k.right);
        }
      }
      const focused = el === document.activeElement;
      return {
        name: el.getAttribute('aria-label') ?? el.textContent ?? '',
        h: Math.round(r.height),
        cut: Math.round(cut),
        hidden,
        spill: Math.round(spill),
        focused,
        // The focus-visible mark: a kit button's data-focus-visible, or the browser's own :focus-visible for the kit's
        // secret address button (Link.module.css .extButton:focus-visible draws its ring; it sets no data attribute).
        ring: focused ? `${el.dataset.focusVisible ?? (el.matches(':focus-visible') ? 'true' : '')}|${getComputedStyle(el).boxShadow}` : '',
      };
    };
    return [...document.querySelectorAll<HTMLElement>('[class*="listMeta"]')]
      .filter((m) => m.getClientRects().length > 0)
      .map((m) => {
        const fields = [...m.children].filter((f) => f.matches('[class*="listItem"]') && f.getClientRects().length > 0);
        const rows = new Set(fields.map((f) => Math.round(f.getBoundingClientRect().top))).size;
        return { h: Math.round(m.getBoundingClientRect().height), rows, words: m.querySelector('[data-words]') !== null, controls: [...m.querySelectorAll<HTMLElement>(sel)].map(cutOf) };
      });
  }, CONTROLS);
}

/**
 * Puts a test field, built like the line's own fields, at the front of the first meta line in `table` that holds a
 * control (replacing an earlier one): `wide`, words as wide as the line; `probe`, a word to select and an input.
 * False when there is no such line.
 */
async function inject(table: Locator, kind: 'wide' | 'probe') {
  return table.evaluate((t, k) => {
    const meta = [...t.querySelectorAll<HTMLElement>('[class*="listMeta"]')].find((x) => x.querySelector('button, a[href]'));
    const item = meta?.querySelector<HTMLElement>(':scope > [class*="listItem"]:not([data-words])');
    if (!meta || !item) return false;
    meta.querySelector('[data-words]')?.remove();
    const field = item.cloneNode(false) as HTMLElement;
    field.dataset.words = '';
    // A plain words field: the clone of a listWraps field (the address) must not carry its wrap mark.
    delete field.dataset.metaWraps;
    const value = document.createElement('span');
    value.className = [...(item.querySelector('[class*="listValue"]')?.classList ?? [])].join(' ');
    if (k === 'wide') {
      field.style.flex = '0 0 100%';
      value.textContent = 'x'.repeat(200);
    } else {
      const text = document.createElement('span');
      text.textContent = 'Selectable';
      text.dataset.text = '';
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'Meta input');
      input.style.width = '3rem';
      value.append(text, ' ', input);
    }
    field.append(value);
    meta.prepend(field);
    return true;
  }, kind);
}

// In two-line rows each port's address link sits on the meta line (in this table
// the actions are the kit row actions, measured by the kit's own specs). A line holding controls clips none of them
// or their focus rings; fields wrap whole onto more lines, all in sight; a text-only
// meta line is one 20 px line per row of fields, a line with controls one hit height + 8 per row.
for (const [width, height, touch] of [[320, 640, false], [320, 640, true], [360, 740, true]] as const) {
  test.describe(`two-line rows at ${width}${touch ? ' on a touch screen' : ''}`, () => {
    test.use({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    test(`@parts the address links on the meta line are whole and meta lines are one line height per row at ${width}${touch ? ' touch' : ''}`, async ({ page }) => {
      await gotoHub(page, '/programs?sel=prog%3A2', { latency: 'slow' });
      const parts = portsOf(page);
      // The address is secret by shape: its kit Link is a button named for its words and the new tab it opens.
      const OPEN = 'Open port 8000 (opens in a new tab)';
      const stop = parts.getByRole('button', { name: OPEN });
      // The ports' states have landed; a later refresh can still mount the actions anew, so each read below is retried
      // whole on fresh elements.
      await expect(parts.getByRole('row', { name: /^(Show details )?8002\b/ }).getByText('Stopped', { exact: true })).toBeAttached();
      await expect(parts.getByRole('row', { name: /^(Show details )?8000\b/ }).getByText('Running', { exact: true })).toBeAttached();
      const hit = touch ? 44 : 32; // a small control's height: an IconButton sm is 32 (it was --icon-hit, 28)
      await expect
        .poll(async () => {
          const withControls = (await metaLines(page)).filter((l) => l.controls.length > 0);
          const shown = withControls.some((l) => l.controls.some((c) => c.name === OPEN && !c.hidden));
          return shown && withControls.every((l) => l.controls.every((c) => c.hidden || (c.cut === 0 && (!touch || c.h >= 44))));
        }, { message: `every control on a meta line is whole, focus ring included, at ${width}` })
        .toBe(true);
      // No shown action reaches outside its meta field: the line lets taps through outside its fields, so a control
      // hanging past its field would take taps meant for the row beneath (DataTable.module.css: control fields do not clip).
      await expect
        .poll(async () => (await metaLines(page)).flatMap((l) => l.controls).filter((c) => !c.hidden && c.spill > 0), {
          message: `no action on a meta line reaches outside its field at ${width}`,
        })
        .toEqual([]);
      await expect
        .poll(async () => (await metaLines(page)).some((l) => l.controls.some((c) => !c.hidden)), { message: 'the spill check saw a shown action' })
        .toBe(true);
      // Its keyboard focus ring is drawn and clear of every clip: mark, shadow and geometry read from one pass over the
      // button that has focus, so a render in between cannot mix two buttons.
      await expect(async () => {
        await page.keyboard.press('Shift');
        await stop.focus();
        const focused = (await metaLines(page)).flatMap((l) => l.controls).filter((c) => c.focused);
        expect(focused.map((c) => c.name)).toEqual([OPEN]);
        const [ring] = focused;
        expect(ring?.ring.startsWith('true|'), ring?.ring).toBe(true);
        expect(ring?.ring.endsWith('|none'), ring?.ring).toBe(false);
        expect(ring?.cut, JSON.stringify(ring)).toBe(0);
      }, { message: 'the address link focus ring is drawn and clear of every clip' }).toPass();
      // A field as wide as the line before the actions: they wrap onto the next line, whole and in sight, rings included.
      await expect(async () => {
        expect(await inject(parts, 'wide')).toBe(true);
        // The injected line, its controls and their clip state, all from one measurement.
        const lines = (await metaLines(page)).filter((l) => l.words);
        expect(lines.length).toBe(1);
        const [line] = lines;
        expect(line?.controls.length, JSON.stringify(line)).toBeGreaterThan(0);
        expect(line?.rows, JSON.stringify(line)).toBeGreaterThan(1);
        for (const c of line?.controls ?? []) expect(!c.hidden && c.cut === 0, JSON.stringify(c)).toBe(true);
        expect(line?.h, JSON.stringify(line)).toBe((line?.rows ?? 0) * (hit + 8));
      }, { message: 'actions after a field as wide as the line wrap onto the next line, whole' }).toPass();
      // Words and an input on a line that holds controls keep the pointer: the words select, the input takes a click.
      // The ring room above a control lets a tap through to what lies beneath the line.
      await expect(async () => {
        expect(await inject(parts, 'probe')).toBe(true);
        // Each operation is its own step, so a failure names the one that did not reach its target.
        await test.step('a double-click selects the injected word', async () => {
          const text = parts.locator('[data-words] [data-text]'); // CSS: injected test text has no role
          await text.dblclick({ timeout: 5_000 });
          expect(await page.evaluate(() => window.getSelection()?.toString().trim())).toBe('Selectable');
        });
        await test.step('the injected input takes a click and focus', async () => {
          await parts.getByRole('textbox', { name: 'Meta input' }).click({ timeout: 5_000 });
          await expect(parts.getByRole('textbox', { name: 'Meta input' })).toBeFocused();
        });
        // Just above and below the field lies only the ring room (or the gap to the next line); the field takes the tap.
        await test.step('taps above and below the field pass through, its middle hits it', async () => {
          const taps = await parts.evaluate((t) => {
            const field = t.querySelector<HTMLElement>('[data-words]');
            const meta = field?.parentElement;
            if (!field || !meta) return 'no line';
            const f = field.getBoundingClientRect();
            const m = meta.getBoundingClientRect();
            const x = f.left + Math.min(f.width / 2, 20);
            const at = (y: number) => {
              const hit = document.elementFromPoint(x, y);
              return hit && field.contains(hit) ? 'field' : hit && meta.contains(hit) ? 'line' : 'through';
            };
            if (f.top - 3 < m.top) return 'no ring room above';
            return [at(f.top - 3), at(f.top + f.height / 2), at(Math.min(f.bottom + 3, m.bottom - 1))].join(' ');
          });
          expect(taps).toBe('through field through');
        });
      }, { message: 'words select, an input takes a click, and the ring room lets taps through' }).toPass();
      // The programs list: its meta lines hold text only, one 20 px line per row of fields.
      await gotoHub(page, '/programs', { latency: 'slow' });
      // CSS: the kit list meta line has no role; a line whose fields are all empty takes no height, so wait for a shown one.
      await page.locator('[class*="listMeta"]:visible').first().waitFor();
      const lines = await metaLines(page);
      const textOnly = lines.filter((l) => l.controls.length === 0);
      expect(textOnly.length, JSON.stringify(lines)).toBeGreaterThan(0);
      for (const l of textOnly) expect(l.h, JSON.stringify(l)).toBe(20 * l.rows);
      for (const l of lines.filter((m) => m.controls.length > 0)) expect(l.h, JSON.stringify(l)).toBe(l.rows * (hit + 8));
    });
  });
}
