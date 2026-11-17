// @vitest-environment node
// A kit Section never adds its outer margin to its parent's gap: two Sections that follow each other inside a Stack are
// one --gap-between-sections apart whatever the Stack's gap (they were gap + margin: 40 px in a default Stack, 44 px at
// gap 5, against 24 px everywhere else). jsdom has no layout, so the CSS text is the contract.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'Stack.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const anatomy = readFileSync(join(import.meta.dirname, 'anatomy', 'anatomy.module.css'), 'utf8');

describe('Sections in a Stack', () => {
  it('every gap class publishes its gap as a length the Section rule can subtract (a bare 0 would void the calc)', () => {
    expect(css).toMatch(/\.g0 \{ gap: var\(--sp-0\); --form-gap: 0px; \}/);
    for (let n = 1; n <= 8; n++) expect(css).toMatch(new RegExp(`\\.g${n} \\{ gap: var\\(--sp-${n}\\); --form-gap: var\\(--sp-${n}\\); \\}`));
  });

  it('a Section after a Section keeps only what the gap leaves of the step between Sections, never less than nothing', () => {
    const body = /\.stack > :global\(\[data-hub-section=''\]\) \+ :global\(\[data-hub-section=''\]\) \{([^}]*)\}/.exec(css)?.[1];
    expect(body, 'no Section rule in Stack.module.css').toBeDefined();
    expect(body).toContain('margin-block-start: max(0px, calc(var(--gap-between-sections) - var(--form-gap, 0px)));');
  });

  it('the step it completes is the one Sections outside a Stack already use', () => {
    expect(anatomy).toMatch(/\.section \+ \.section \{\s*margin-block-start: var\(--gap-between-sections\);/);
  });
});
