// The Agents view's own CSS. The table and the detail are ListDetailPage's panes (it stacks them on a narrow
// page itself), so this file holds no grid of its own and no size container: a second narrowing rule would fight the layout's.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'agents.module.css'), 'utf8');
const rule = (sel: string) => css.match(new RegExp(`^\\${sel} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

describe('agents.module.css', () => {
  it('has no index grid and no size container: ListDetailPage owns the two panes and their narrowing', () => {
    expect(css).not.toMatch(/container-type/);
    expect(css).not.toMatch(/@container/);
    expect(css).not.toMatch(/grid-template-columns/);
  });
  it('the name cell keeps its icon, name and Default tag on one line and may shrink', () => {
    expect(rule('.nameCell')).toMatch(/display:\s*inline-flex/);
    expect(rule('.nameCell')).toMatch(/min-inline-size:\s*0/);
  });
  it('the detail stacks the overview, tools and file with room between them', () => {
    expect(rule('.detail')).toMatch(/flex-direction:\s*column/);
  });
});
