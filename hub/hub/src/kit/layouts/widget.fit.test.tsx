// A Widget with `fit` is as high as its content (a one-line handoff card); without it the body keeps its
// usual minimum height. Pages ask for it instead of reaching into the card (layout.cssReach).
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Widget } from './Layouts';

const css = readFileSync(join(__dirname, 'Layouts.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => css.match(new RegExp(`^${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
const body = () => document.querySelector('section > div:last-child')!;

describe('Widget fit', () => {
  it('keeps the usual body without fit', () => {
    render(<Widget>x</Widget>);
    expect(body().className).not.toMatch(/widgetFit/);
  });

  it('marks the body with fit', () => {
    render(<Widget fit>x</Widget>);
    expect(body().className).toMatch(/widgetFit/);
  });

  it('drops the minimum height for a fitted body', () => {
    expect(rule('.widgetFit')).toMatch(/min-height:\s*0;/);
  });
});
