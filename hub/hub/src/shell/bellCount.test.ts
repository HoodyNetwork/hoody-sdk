// The top bar's unread count sits on the bell's top end corner and leaves the bell whole: 5 px out on
// both sides, 14 px tall, at least 14 wide, 3 px sides, 10 px digits, no clicks. The bell's button keeps the count in
// its name; the sidebar's count keeps its own placement.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (css: string, sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.>*]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('the bell count', () => {
  const css = read('TopBar.module.css');
  const tsx = read('TopBar.tsx').replace(/\s+/g, ' ');

  it('the bell places its count with its own class, and its button names the count', () => {
    expect(tsx).toMatch(/<CountMark n=\{unread\} capped=\{!!data\.unreadCapped\} tone="accent" className=\{s\.bellCount\} \/>/);
    expect(tsx).toMatch(/<IconButton icon="bell" label=\{unread > 0 \? t\('top\.notificationsCount'/);
  });

  it('sits 5 px out of the button on the top and end sides and takes no clicks', () => {
    const r = rule(css, '.bellCount');
    expect(r).toMatch(/position:\s*absolute;/);
    expect(r).toMatch(/inset-block-start:\s*-5px;/);
    expect(r).toMatch(/inset-inline-end:\s*-5px;/);
    expect(r).toMatch(/pointer-events:\s*none;/);
  });

  it('is a 14 px box, at least 14 wide, with 3 px sides and 10 px digits', () => {
    const r = rule(css, '.bellCount > *');
    expect(r).toMatch(/block-size:\s*14px;/);
    expect(r).toMatch(/min-inline-size:\s*14px;/);
    expect(r).toMatch(/padding-inline:\s*calc\(var\(--sp-half\) \+ var\(--bw\)\);/);
    expect(r).toMatch(/font-size:\s*10px;/);
  });

  it('the sidebar count is not moved', () => {
    expect(read('Sidebar.tsx').replace(/\s+/g, ' ')).toContain('className={s.count} />');
  });
});
