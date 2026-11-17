// HoodyLoader: the Hoody mark as a busy mark. A status named by its label or holding the page's line, decorative without
// either; the mark is the `logo` icon's own shape; still (reduced motion, performance mode, a still frame) it is the plain
// mark; currentColor and tokens only; no inline style.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Icon } from '../icons';
import { HoodyLoader } from './HoodyLoader';

const css = readFileSync(join(__dirname, 'HoodyLoader.module.css'), 'utf8');
const rule = (sel: string, from = 0) => {
  const i = css.indexOf(`${sel} {`, from);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

beforeEach(() => {
  boot();
});

describe('HoodyLoader', () => {
  it('CSS: in a row its line never wraps word by word (one line, an ellipsis when tight); lg wraps under the mark', () => {
    const row = rule('.loader:not(.lg) .text');
    expect(row).toMatch(/white-space: nowrap;/);
    expect(row).toMatch(/text-overflow: ellipsis;/);
    expect(row).toMatch(/overflow: hidden;/);
    expect(rule('.loader')).toMatch(/max-inline-size: 100%;/);
    // As a flex item of a row it must shrink below its text, or the nowrap line overflows the row uncut.
    expect(rule('.loader')).toMatch(/min-inline-size: 0;/);
  });

  it('with a label it is a status named by it, as Spinner', () => {
    render(<HoodyLoader label="Working" />);
    expect(screen.getByRole('status', { name: 'Working' })).toBeTruthy();
  });

  it('with the page\'s line it is a status whose content is that line, drawn after the mark', () => {
    render(<HoodyLoader text="Waiting for the computer" />);
    const st = screen.getByRole('status');
    expect(st).toHaveTextContent('Waiting for the computer');
    expect(st).not.toHaveAttribute('aria-label');
    expect(st.lastElementChild?.textContent).toBe('Waiting for the computer');
  });

  it('lg: a page section\'s loader, the same status with its line', () => {
    const { container } = render(<HoodyLoader size="lg" text="Waiting for the computer" />);
    const st = screen.getByRole('status');
    expect(st.className).toMatch(/lg/);
    expect(st).toHaveTextContent('Waiting for the computer');
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('without either it is decorative', () => {
    const { container } = render(<HoodyLoader />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the logo icon\'s own shape plus its three parts, with no inline style', () => {
    const { container } = render(
      <>
        <HoodyLoader size="md" />
        <Icon name="logo" />
      </>,
    );
    const [loader, icon] = [...container.querySelectorAll('svg')];
    const paths = loader!.querySelectorAll('path');
    expect(paths).toHaveLength(4);
    expect(paths[0]!.getAttribute('d')).toBe(icon!.querySelector('path')!.getAttribute('d'));
    expect(paths[0]).toHaveAttribute('fill-rule', 'evenodd');
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('CSS: parts rest unlit and stop under reduced motion and in performance mode; currentColor; sizes from the icon tokens', () => {
    expect(rule('.part')).toMatch(/opacity: 0;/);
    expect(rule('.part')).toMatch(/var\(--dur-pulse\)/);
    expect(rule('  .part', css.indexOf('@media (prefers-reduced-motion: reduce)'))).toMatch(/animation: none;/);
    expect(rule(':root[data-hx-perf] .part')).toMatch(/animation: none;/);
    expect(rule('.mark')).toMatch(/fill: currentcolor;/);
    expect(rule('.mark')).toMatch(/width: var\(--icon-sm\);/);
    expect(rule('.md .mark')).toMatch(/width: var\(--icon-md\);/);
    // A page section's loader: the mark at the large-region size (Spinner lg's frame), the line centred under it.
    expect(rule('.lg .mark')).toMatch(/width: var\(--sp-10\);/);
    expect(rule('.lg')).toMatch(/flex-direction: column;/);
    // The keyframes never leave a part lit at rest: the cycle starts and ends unlit.
    expect(css).not.toMatch(/(^|\s)(0%|100%|from|to) \{\s*opacity: 0\.[1-9]/m);
  });
});
