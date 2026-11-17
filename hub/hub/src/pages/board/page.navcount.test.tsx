// Vitest: the Board manifest's left-menu count: it names the Board's own count reader, and its label and tip
// read in plural form with the shell's interpolation (shell/Sidebar CountedNavItem passes {name, count} and {count}).
import { makeT } from '@kit';
import { describe, expect, it } from 'vitest';
import useBoardCounts from './navCount';
import page from './page';

describe('Board manifest navCount', () => {
  it('loads the Board count reader and nothing else', async () => {
    expect(page.navCount).toBeDefined();
    const mod = await page.navCount!.load();
    expect(mod.default).toBe(useBoardCounts);
  });

  it('names the count in the item label and tip, singular and plural', () => {
    const nc = page.navCount!;
    const t = makeT(page.strings);
    const name = t(page.nav!.label);
    expect(t(nc.label, { name, count: 1 })).toBe('Board 1 program');
    expect(t(nc.label, { name, count: 4 })).toBe('Board 4 programs');
    expect(t(nc.tip, { count: 1 })).toBe('1 program on your Boards');
    expect(t(nc.tip, { count: 12 })).toBe('12 programs on your Boards');
  });
});
