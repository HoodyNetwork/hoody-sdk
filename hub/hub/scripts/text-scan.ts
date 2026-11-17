// The rendered-text scan, shared by the shots runner (in the browser, via page.evaluate) and the
// conformance test (happy-dom). Self-contained on purpose: page.evaluate ships only this function.

/**
 * Runs in the browser (page.evaluate): text nodes and labelling attributes that show a raw
 * string key (`nav.group.buildOn`, shown as NAV.GROUP.BUILDON under a caps style) or an unfilled
 * `{{placeholder}}`. `keys` is every dotted key of every strings*.json in hub/src.
 */
export function scanRenderedText(keys: string[], root?: Element): string[] {
  const known = new Set(keys);
  // A key missing from every file (the usual leak) is caught by its shape: dotted camelCase
  // segments whose first segment is a prefix some strings file uses (nav., col., action., …),
  // and whose last segment is not a domain or file ending (install.hoody.com, page.ts).
  const prefixes = new Set(keys.map((k) => k.split('.')[0]));
  const NOT_KEY_END = /^(com|net|org|io|dev|app|network|icu|cloud|ai|sh|ts|tsx|js|mjs|json|md|css|html|png|svg|txt|log|yaml|yml|toml|env|db|sqlite)$/;
  const keyShaped = (t: string) => {
    if (!/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_-]*)+$/.test(t)) return false;
    const parts = t.split('.');
    return prefixes.has(parts[0] ?? '') && !NOT_KEY_END.test(parts[parts.length - 1] ?? '');
  };
  const found = new Set<string>();
  const judge = (raw: string, where: string) => {
    const text = raw.trim();
    if (!text) return;
    if (/\{\{\s*[\w.]+\s*\}\}/.test(text)) found.add(`unfilled placeholder in ${where}: "${text.slice(0, 80)}"`);
    if (known.has(text) || keyShaped(text)) found.add(`raw string key in ${where}: "${text}" (t() got a key its strings file lacks)`);
  };
  const walker = document.createTreeWalker(root ?? document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest('script,style,noscript,[hidden]')) continue;
    judge(n.textContent ?? '', `<${el.tagName.toLowerCase()}>`);
  }
  for (const el of Array.from((root ?? document.body).querySelectorAll('[aria-label],[title],[placeholder],[alt],[aria-description]'))) {
    for (const a of ['aria-label', 'title', 'placeholder', 'alt', 'aria-description']) {
      const v = el.getAttribute(a);
      if (v) judge(v, `${a} of <${el.tagName.toLowerCase()}>`);
    }
  }
  return [...found];
}


/**
 * Runs in the browser after a shot (page.evaluate), also self-contained. Design rules a person
 * would otherwise catch by eye:
 *   - one accent-filled control per region: each open dialog or drawer, the detail
 *     pane, the page header, the table or grid, and the rest of the page count on their own; only
 *     controls inside the viewport count;
 *   - table header labels never clip, nor do cells of priority-1 columns when the table
 *     marks them `data-priority="1"`.
 */
export function scanRenderedLayout(): string[] {
  const found: string[] = [];
  const probe = document.createElement('div');
  probe.style.background = 'var(--hx-acc)';
  document.body.appendChild(probe);
  const accent = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const label = (el: Element) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (accent && accent !== 'rgba(0, 0, 0, 0)') {
    // Regions: each dialog/drawer, each ListDetail detail, the page header, the main
    // table or list, and the rest of the page. Each may hold one accent; regions are not compared.
    const regionOf = (el: Element): [Element | null, string] => {
      const dlg = el.closest('[role="dialog"], [role="alertdialog"]');
      if (dlg) return [dlg, 'one overlay'];
      const detail = el.closest('section[aria-label="Details"], section[class*="detail" i]');
      if (detail) return [detail, 'the detail'];
      const head = el.closest('#hub-main header');
      if (head && !el.closest('table, [role="grid"], [role="table"]')) return [head, 'the page header'];
      const table = el.closest('table, [role="grid"], [role="table"]');
      if (table) return [table, 'the table'];
      return [null, 'the page'];
    };
    const regions = new Map<Element | null, { where: string; names: string[] }>();
    for (const el of Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"]'))) {
      if (getComputedStyle(el).backgroundColor !== accent || !visible(el)) continue;
      const [region, where] = regionOf(el);
      const r = regions.get(region) ?? { where, names: [] };
      r.names.push(label(el));
      regions.set(region, r);
    }
    for (const { where, names } of regions.values()) {
      if (names.length > 1) found.push(`${names.length} accent buttons in ${where} (one primary per region): ${names.map((n) => `"${n}"`).join(', ')}`);
    }
  }
  // The page title sits inside the content gutter (>= 12 px from #hub-main's edge), never flush.
  const mainEl = document.querySelector('#hub-main');
  const title = mainEl?.querySelector('header h1, h1');
  if (mainEl && title && visible(title)) {
    const gap = title.getBoundingClientRect().left - mainEl.getBoundingClientRect().left;
    if (gap < 12) found.push(`page title "${label(title)}" is ${Math.round(gap)} px from the content edge: the PageHeader must sit in the gutter`);
  }
  // A link in a table cell is navigation chrome (ink or muted, › on hover), never link blue,
  // unless it sits in a sentence (a <p>) inside the cell.
  const linkProbe = document.createElement('span');
  linkProbe.style.color = 'var(--hx-link, var(--hx-blue-text))';
  document.body.appendChild(linkProbe);
  const linkColor = getComputedStyle(linkProbe).color;
  linkProbe.remove();
  if (linkColor && linkColor !== getComputedStyle(document.body).color) {
    const blue = Array.from(document.querySelectorAll('td a[href], [role="cell"] a[href], [role="gridcell"] a[href]'))
      .filter((a) => !a.closest('p') && visible(a) && getComputedStyle(a).color === linkColor)
      .slice(0, 3);
    for (const a of blue) found.push(`link-blue table cell "${label(a)}": a cell that opens a page is nav chrome (ink or muted, underline + › on hover)`);
  }
  const clipped = (el: Element) => {
    for (const n of [el, ...Array.from(el.querySelectorAll('*'))]) {
      const h = n as HTMLElement;
      const cs = getComputedStyle(h);
      // Visually hidden labels (1 px boxes, clip, clip-path) are meant to be cut.
      if (h.getBoundingClientRect().width <= 2 || cs.clip !== 'auto' || cs.clipPath !== 'none') continue;
      if (h.scrollWidth > h.clientWidth + 1 && cs.overflowX !== 'visible') return true;
    }
    return false;
  };
  // A header whose only text is a visually hidden label (the row-actions column) shows nothing to clip.
  const hiddenBox = (h: HTMLElement) => {
    const cs = getComputedStyle(h);
    return h.getBoundingClientRect().width <= 2 || cs.clip !== 'auto' || cs.clipPath !== 'none';
  };
  const showsText = (el: Element) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim()) continue;
      let hidden = false;
      for (let p = n.parentElement; p && p !== el.parentElement; p = p.parentElement) if (hiddenBox(p)) hidden = true;
      if (!hidden) return true;
    }
    return false;
  };
  for (const th of Array.from(document.querySelectorAll('th, [role="columnheader"]'))) {
    if (visible(th) && label(th) && showsText(th) && clipped(th)) found.push(`table header clipped: "${label(th)}" (give the column a min width that fits its header)`);
  }
  for (const td of Array.from(document.querySelectorAll('td[data-priority="1"], [role="cell"][data-priority="1"]')).slice(0, 400)) {
    if (visible(td) && clipped(td)) {
      found.push(`priority-1 cell clipped: "${label(td)}" (lower-priority columns must drop first)`);
      break;
    }
  }
  return found;
}
