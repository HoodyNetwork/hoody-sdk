// Playwright: every kit part that draws its keyboard focus as a box-shadow ring keeps a
// visible focus in forced-colors mode (Windows high contrast), which drops box-shadow: a solid Highlight outline there,
// and with colours on the kit ring and no outline, as before. The kit's own CSS with its source class names, so a part
// is measured as its stylesheet draws it, not through a page.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Run from the API tree or from hub (Playwright's cwd), as the other kit specs that read sources.
const KIT = [resolve('hub/src/kit'), resolve('src/kit')].find((d) => existsSync(join(d, 'tokens.css'))) ?? resolve('hub/src/kit');
const read = (f: string) => readFileSync(join(KIT, f), 'utf8');

/** A part: its stylesheet, the markup of the element that draws the focus (id="t"), how its focus shows (an attribute React
 *  Aria sets, or real :focus-visible), the element that holds focus when it is not #t, and where the ring is drawn when
 *  not on #t. forcedOnly: a part that keeps the global focus outline (base.css), so forced colours already show it; it
 *  is guarded here only in forced colours, its colours-on look being its own. */
type Part = { name: string; css: string; html: string; attr?: 'data-focus-visible'; shadowOn?: string; focus?: string; forcedOnly?: boolean };
const PARTS: Part[] = [
  { name: 'Disclosure trigger', css: 'controls/Disclosure.module.css', html: '<button id="t" class="trigger">More</button>', attr: 'data-focus-visible' },
  { name: 'Link', css: 'controls/Link.module.css', html: '<a id="t" class="link" href="#x">Docs</a>', attr: 'data-focus-visible' },
  { name: 'Link external button', css: 'controls/Link.module.css', html: '<button id="t" class="extButton">Open</button>' },
  { name: 'SectionMenu item', css: 'layouts/SectionMenu.module.css', html: '<a id="t" class="item" href="#x">General</a>' },
  { name: 'SectionMenu current item', css: 'layouts/SectionMenu.module.css', html: '<a id="t" class="item current" href="#x">General</a>' },
  { name: 'Faq title', css: 'layouts/Faq.module.css', html: '<button id="t" class="title">Why?</button>' },
  { name: 'SettingGroup reveal', css: 'forms/SettingGroup.module.css', html: '<button id="t" class="reveal">Show</button>' },
  { name: 'InfoTip icon', css: 'overlays/InfoTip.module.css', html: '<button id="t" class="icon">i</button>' },
  { name: 'InfoTip term', css: 'overlays/InfoTip.module.css', html: '<button id="t" class="term">term</button>' },
  { name: 'DataTable chip', css: 'data/DataTable.module.css', html: '<button id="t" class="chip">Running</button>', attr: 'data-focus-visible' },
  { name: 'DataTable chip remove', css: 'data/DataTable.module.css', html: '<button id="t" class="chipX">x</button>', attr: 'data-focus-visible' },
  { name: 'DataTable row', css: 'data/DataTable.module.css', html: '<table><tbody><tr id="t" class="tr" tabindex="0"><td>web</td></tr></tbody></table>', shadowOn: 'td' },
  { name: 'Dialog type input', css: 'overlays/Dialog.module.css', html: '<input id="t" class="typeInput" />', attr: 'data-focus-visible' },
  { name: 'field box', css: 'forms/fieldBox.module.css', html: '<button id="t" class="box">Pick</button>', attr: 'data-focus-visible' },
  { name: 'slot field', css: 'forms/fields.module.css', html: '<div id="t" class="slotBox"><input id="f" class="boxInput" /></div>', focus: '#f' },
  { name: 'Select search', css: 'forms/more.module.css', html: '<input id="t" class="searchInput" />' },
  { name: 'code cell', css: 'forms/OtpField.module.css', html: '<div class="cells"><div id="t" class="cell active"></div><input id="f" class="input" /></div>', focus: '#f' },
  { name: 'View all', css: 'layouts/Layouts.module.css', html: '<a id="t" class="viewAll" href="#x">View all</a>', attr: 'data-focus-visible' },
  { name: 'step button', css: 'layouts/Layouts.module.css', html: '<button id="t" class="stepBtn">2</button>' },
  { name: 'crumb link', css: 'layouts/PageHeader.module.css', html: '<a id="t" class="crumbLink" href="#x">Bots</a>', attr: 'data-focus-visible' },
  { name: 'crumb back', css: 'layouts/PageHeader.module.css', html: '<a id="t" class="crumbBack" href="#x">Back</a>', attr: 'data-focus-visible' },
  { name: 'model chooser title', css: 'pickers/ModelChooser.module.css', html: '<button id="t" class="title">Model</button>' },
  { name: 'model chooser option', css: 'pickers/ModelChooser.module.css', html: '<div id="t" class="option" tabindex="0">Opus</div>' },
  { name: 'picker fold', css: 'pickers/PickerPanel.module.css', html: '<button id="t" class="foldToggle">More</button>' },
  { name: 'date cell', css: 'forms/DatePickButton.module.css', html: '<div id="t" class="cell" tabindex="0">12</div>', attr: 'data-focus-visible' },
  { name: 'tab panel', css: 'controls/Tabs.module.css', html: '<div id="t" class="panel" tabindex="0">Panel</div>', attr: 'data-focus-visible' },
  { name: 'switch', css: 'forms/fields.module.css', html: '<label id="t" class="switch"><input /><span class="track"></span></label>', attr: 'data-focus-visible', focus: '#t input', shadowOn: '.track', forcedOnly: true },
  { name: 'checkbox', css: 'forms/fields.module.css', html: '<label id="t" class="checkbox"><input /><span class="box"></span></label>', attr: 'data-focus-visible', focus: '#t input', shadowOn: '.box', forcedOnly: true },
  { name: 'radio', css: 'forms/more.module.css', html: '<label id="t" class="radio"><input /><span class="radioDot"></span></label>', attr: 'data-focus-visible', focus: '#t input', shadowOn: '.radioDot', forcedOnly: true },
  { name: 'page title', css: 'layouts/PageHeader.module.css', html: '<h1 id="t" class="title" tabindex="-1">Bots</h1>', forcedOnly: true },
  { name: 'detail title', css: 'layouts/ListDetailPage.module.css', html: '<h2 id="t" class="detailTitle" tabindex="-1">web</h2>', forcedOnly: true },
  { name: 'splitter', css: 'layouts/Splitter.module.css', html: '<div id="t" class="splitter" tabindex="0" role="separator"></div>' },
  { name: 'anatomy item open', css: 'layouts/anatomy/anatomy.module.css', html: '<button id="t" class="itemOpen">Open</button>', attr: 'data-focus-visible', forcedOnly: true },
  { name: 'dialog outcome', css: 'overlays/Dialog.module.css', html: '<div id="t" class="outcomeSlot" tabindex="-1">Done</div>' },
  { name: 'toast', css: 'states/Toast.module.css', html: '<div id="t" class="toast" tabindex="0">Saved</div>', attr: 'data-focus-visible' },
  { name: 'pick card', css: 'pickers/PickCard.module.css', html: '<div id="t" class="card" tabindex="0">Plan</div>', attr: 'data-focus-visible', forcedOnly: true },
  { name: 'picker row', css: 'pickers/PickerPanel.module.css', html: '<div id="t" class="row" tabindex="0">web</div>' },
];

async function focusPart(page: Page, p: Part) {
  // tokens, the global base (its own focus outline included: a part that keeps it needs nothing more), then the part.
  await page.setContent(`<!doctype html><html><head><style>${read('tokens.css')}\n${read('base.css')}\n${read(p.css)}</style></head><body><button>Before</button>${p.html}</body></html>`);
  // Keyboard modality first, so :focus-visible matches the element focused next.
  await page.keyboard.press('Tab');
  await page.locator(p.focus ?? '#t').focus();
  if (p.attr) await page.locator('#t').evaluate((el, a) => el.setAttribute(a, ''), p.attr);
  // A row draws its ring on its cells; every other part on itself.
  return page.locator('#t').evaluate((el, on) => {
    const c = getComputedStyle(el);
    const ring = on ? getComputedStyle(el.querySelector(on)!) : c;
    return { style: c.outlineStyle, width: parseFloat(c.outlineWidth), color: c.outlineColor, shadow: ring.boxShadow };
  }, p.shadowOn);
}

for (const p of PARTS) {
  test(`forced colors: a focused ${p.name} draws a solid outline, which forced colors keep`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    const f = await focusPart(page, p);
    expect(f.style, JSON.stringify(f)).toBe('solid');
    expect(f.width, JSON.stringify(f)).toBeGreaterThanOrEqual(2);
    expect(f.color, JSON.stringify(f)).not.toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
  });

  if (p.forcedOnly) continue;
  test(`colours on: a focused ${p.name} keeps the kit ring and draws no outline`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
    const f = await focusPart(page, p);
    expect(f.shadow, JSON.stringify(f)).not.toBe('none');
    expect(f.style === 'none' || /rgba\(\d+, \d+, \d+, 0\)|transparent/.test(f.color), JSON.stringify(f)).toBe(true);
  });
}
