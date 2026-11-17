// Vitest: no link or text button is drawn inside an
// interactive control. The check reads what a test rendered, so a link that reaches a button in a variable, through a wrapper, in
// forwarded children or from a render prop is caught, which the source scan (kit/controls/links.surfaces.contrast-surfaces-link-text.test.ts) cannot see.
// Each row that leaves a violation unmounts it before the test ends: app/test-setup.ts checks every test's DOM after it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Button, ExtLink, Link, LinkButton, TextButton } from '@kit';
import { SHOWN_MAX, checkNesting, nestedInteractive } from './nesting';

/** Renders `ui`, reads what the check finds, then unmounts it so the test's own after-check sees a clean DOM. */
function found(ui: ReactNode) {
  const { container, unmount } = render(<>{ui}</>);
  const out = nestedInteractive(container).shown;
  let thrown = '';
  try {
    checkNesting(container);
  } catch (e) {
    thrown = (e as Error).message;
  }
  unmount();
  return { out, thrown };
}

const Wrap = ({ children }: { children: ReactNode }) => <span className="wrap">{children}</span>;
const Forward = (props: { children: ReactNode }) => <Button {...props} />;
const Slot = ({ render: draw }: { render: () => ReactNode }) => <Button>{draw()}</Button>;

describe('a link or text button inside an interactive control is found', () => {
  const link = <a href="/x">inner link</a>;
  it.each<readonly [string, ReactNode]>([
    ['a link held in a variable, in a kit Button', <Button key="v">{link}</Button>],
    ['a link through a wrapper component', <Button key="w"><Wrap>{link}</Wrap></Button>],
    ['a link in forwarded children', <Forward key="f">{link}</Forward>],
    ['a link from a render prop', <Slot key="r" render={() => link} />],
    ['a kit Link in a kit Button', <Button key="k"><Link href="/x">go</Link></Button>],
    ['a TextButton in a kit Button', <Button key="t"><TextButton>do</TextButton></Button>],
    ['a secret ExtLink in a kit Button', <Button key="se"><ExtLink url="https://docs.example.test/start?token=abc" secret name="docs" /></Button>],
    ['a kit Link to a secret address in a kit Button', <Button key="sl"><Link href="https://docs.example.test/start?token=abc">docs</Link></Button>],
    ['a link in a LinkButton', <LinkButton key="l" href="/y">{link}</LinkButton>],
    ['a link in a menu item', <div key="m" role="menuitem">{link}</div>],
    ['a text button in a tab', <div key="tb" role="tab"><span data-text-button="">do</span></div>],
    ['a link in an option', <div key="o" role="option" aria-selected="false">{link}</div>],
    ['a link in a switch', <div key="s" role="switch" aria-checked="false">{link}</div>],
    ['a link inside a link', <a key="a" href="/outer">{link}</a>],
  ])('%s', (_name, ui) => {
    const { out, thrown } = found(ui);
    expect(out.length).toBeGreaterThan(0);
    expect(thrown).toContain('kit-interactive-nesting-check');
  });
  it('names both elements briefly, never the whole markup', () => {
    const { thrown } = found(<Button aria-label="Save">{link}</Button>);
    expect(thrown).toContain('a "inner link" inside button "Save"');
    expect(thrown).not.toContain('<');
  });
  it('names at most SHOWN_MAX pairs and counts the rest, each name cut short', () => {
    const many = Array.from({ length: SHOWN_MAX + 5 }, (_, i) => (
      <a key={i} href={`/${i}`} aria-label={`link ${i} ${'y'.repeat(200)}`}>{`link ${i} ${'x'.repeat(200)}`}</a>
    ));
    const { thrown } = found(<div role="menuitem">{many}</div>);
    const lines = thrown.split('\n');
    expect(lines).toHaveLength(1 + SHOWN_MAX + 1);
    expect(lines.at(-1)).toBe('  and 5 more');
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThan(200);
  });
});

describe('what is not nesting is left alone', () => {
  it.each<readonly [string, ReactNode]>([
    ['a link beside a button', <div key="b"><Button>save</Button><a href="/x">help</a></div>],
    ['a button holding only text', <Button key="t">save</Button>],
    ['a label around a checkbox', <label key="l"><input type="checkbox" /> keep</label>],
    ['an anchor with no href inside a button', <button key="n" type="button">{createElement('a', null, 'not a link')}</button>],
    ['a link inside a list row with no role', <div key="r" className="row"><a href="/x">open</a></div>],
  ])('%s', (_name, ui) => {
    const { out, thrown } = found(ui);
    expect(out).toEqual([]);
    expect(thrown).toBe('');
  });
});

describe('app/test-setup.ts runs the check after every web test', () => {
  const SETUP = readFileSync(join(__dirname, 'test-setup.ts'), 'utf8');
  it('calls checkNesting on the whole document inside afterEach, before the DOM is cleaned up, and cleans up either way', () => {
    const after = SETUP.slice(SETUP.indexOf('afterEach('));
    const check = after.indexOf('checkNesting(document.body)');
    const clean = after.indexOf('rtl?.cleanup()');
    expect(check).toBeGreaterThan(0);
    expect(clean).toBeGreaterThan(check);
    expect(after.slice(check, clean)).toContain('finally');
  });
});
