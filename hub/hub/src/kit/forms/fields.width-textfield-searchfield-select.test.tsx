// A field's width and a Form's layout and ref are kit props, so a page
// never sizes a field or lays out a form with its own class. Without the new props every part renders as before.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { SearchField, TextField } from './fields';
import f from './fields.module.css';
import { Combobox, EntityPicker, Form, Select } from './more';
import m from './more.module.css';

beforeEach(() => {
  boot();
});

const WIDTHS = ['xs', 'sm', 'md', 'lg', 'full'] as const;
const WIDTH_CLASSES = WIDTHS.map((w) => f[`w_${w}`] as string);
const opts = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
] as const;

/** The field's root: the element that carries the kit's field (or search) class. */
const rootOf = (el: HTMLElement): HTMLElement => el.closest(`.${f.field}, .${f.search}`) as HTMLElement;
const widthClassesOn = (el: HTMLElement) => WIDTH_CLASSES.filter((c) => el.classList.contains(c));

describe('width on TextField, SearchField and Select', () => {
  it('each width has its own class', () => {
    expect(new Set(WIDTH_CLASSES).size).toBe(WIDTHS.length);
    for (const c of WIDTH_CLASSES) expect(c).toBeTruthy();
  });

  it.each(WIDTHS)('TextField width="%s" puts that class on the field root, and only that one', (w) => {
    render(<TextField label="Name" width={w} />);
    expect(widthClassesOn(rootOf(screen.getByLabelText('Name')))).toEqual([f[`w_${w}`]]);
  });

  it.each(WIDTHS)('SearchField width="%s" puts that class on the search root', (w) => {
    render(<SearchField label="Find" width={w} />);
    expect(widthClassesOn(rootOf(screen.getByRole('searchbox', { name: 'Find' })))).toEqual([f[`w_${w}`]]);
  });

  it.each(WIDTHS)('Select width="%s" puts that class on the field root', (w) => {
    render(<Select label="Pick" width={w} options={opts} value="a" onChange={() => undefined} />);
    expect(widthClassesOn(rootOf(screen.getByRole('button', { name: /Pick/ })))).toEqual([f[`w_${w}`]]);
  });

  it('no width: no width class on any of the three', () => {
    render(
      <>
        <TextField label="Name" />
        <SearchField label="Find" />
        <Select label="Pick" options={opts} value="a" onChange={() => undefined} />
      </>,
    );
    expect(widthClassesOn(rootOf(screen.getByLabelText('Name')))).toEqual([]);
    expect(widthClassesOn(rootOf(screen.getByRole('searchbox', { name: 'Find' })))).toEqual([]);
    expect(widthClassesOn(rootOf(screen.getByRole('button', { name: /Pick/ })))).toEqual([]);
  });
});

describe('width on Combobox and EntityPicker', () => {
  it.each(WIDTHS)('both put width="%s" on the field root', (w) => {
    const none = () => undefined;
    render(
      <>
        <Combobox label="C" options={opts} value={undefined} onChange={none} width={w} />
        <EntityPicker label="E" options={opts} value={undefined} onChange={none} width={w} />
      </>,
    );
    for (const name of ['C', 'E']) expect(widthClassesOn(rootOf(screen.getByRole('combobox', { name })))).toEqual([f[`w_${w}`]]);
  });
});

describe('Form layout and ref', () => {
  it('the ref receives the form element', () => {
    const ref = createRef<HTMLFormElement>();
    render(
      <Form onSubmit={() => undefined} ref={ref}>
        <TextField label="Name" />
      </Form>,
    );
    expect(ref.current).toBeInstanceOf(HTMLFormElement);
    expect(ref.current).toBe(screen.getByLabelText('Name').closest('form'));
  });

  it('a form with a ref still submits once on Enter and never reloads', async () => {
    const onSubmit = vi.fn();
    const ref = createRef<HTMLFormElement>();
    render(
      <Form onSubmit={onSubmit} ref={ref}>
        <TextField label="Name" />
      </Form>,
    );
    await userEvent.type(screen.getByLabelText('Name'), 'x{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('stack (the default) is today\'s form: the same classes with or without layout="stack"', () => {
    const { container: a } = render(<Form onSubmit={() => undefined}>x</Form>);
    const { container: b } = render(<Form onSubmit={() => undefined} layout="stack">x</Form>);
    const fa = a.querySelector('form') as HTMLFormElement;
    const fb = b.querySelector('form') as HTMLFormElement;
    expect([...fa.classList]).toEqual([m.form]);
    expect([...fb.classList]).toEqual([m.form]);
  });

  it.each(['inline', 'bare'] as const)('layout="%s" adds its own class beside the form class', (layout) => {
    const { container } = render(<Form onSubmit={() => undefined} layout={layout}>x</Form>);
    const form = container.querySelector('form') as HTMLFormElement;
    expect([...form.classList]).toEqual([m.form, m[`form_${layout}`]]);
    expect(m[`form_${layout}`]).toBeTruthy();
  });
});

// The rules behind the classes, read from source (jsdom draws no layout).
const SRC = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the one top-level rule whose selector list is exactly `sel`. */
function body(css: string, sel: string): string {
  let depth = 0;
  let start = 0;
  const found: string[] = [];
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0 && css.slice(start, i).trim() === sel) found.push(css.slice(i + 1, css.indexOf('}', i)));
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) start = i + 1;
    }
  }
  expect(found, `one rule ${sel}`).toHaveLength(1);
  return found[0] as string;
}
const prop = (b: string, name: string) => b.match(new RegExp(`(?:^|[;\\s])${name}\\s*:\\s*([^;]+)`))?.[1]?.trim();
/** Top-level selectors in source order. */
const selectors = (css: string) => {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) out.push(css.slice(start, i).trim());
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) start = i + 1;
    }
  }
  return out;
};

describe('the width and layout rules', () => {
  const fields = read('kit/forms/fields.module.css');
  const more = read('kit/forms/more.module.css');
  const tokens = read('kit/tokens.css');

  it.each([
    ['xs', '8rem'],
    ['sm', '15rem'],
    ['md', '22.5rem'],
    ['lg', '30rem'],
  ])('the %s width reads its --field-w token, %s', (w, value) => {
    expect(tokens).toMatch(new RegExp(`--field-w-${w}\\s*:\\s*${value.replace('.', '\\.')}\\s*;`));
    expect(prop(body(fields, `.w_${w}`), 'inline-size')).toBe(`var(--field-w-${w})`);
  });

  it('a fixed width never grows, may shrink below its size and never passes its container', () => {
    const b = body(fields, '.w_xs,\n.w_sm,\n.w_md,\n.w_lg');
    expect(prop(b, 'flex')).toBe('0 1 auto');
    expect(prop(b, 'min-inline-size')).toBe('0');
    expect(prop(b, 'max-inline-size')).toBe('100%');
  });

  it('full takes the whole line, takes a row\'s shortfall first down to the xs width, and does not grow along a column', () => {
    const b = body(fields, '.w_full');
    expect(prop(b, 'inline-size')).toBe('100%');
    expect(prop(b, 'flex')).toBe('0 1000 auto');
    expect(prop(b, 'min-inline-size')).toBe('min(var(--field-w-xs), 100%)');
    expect(prop(b, 'max-inline-size')).toBe('none');
  });

  it('the width rules come after the search rule, so a width beats its min-width, max-width and flex', () => {
    const order = selectors(fields);
    const search = order.indexOf('.search');
    expect(search).toBeGreaterThan(-1);
    for (const sel of ['.w_xs,\n.w_sm,\n.w_md,\n.w_lg', '.w_full']) expect(order.indexOf(sel)).toBeGreaterThan(search);
  });

  it('stack stays today\'s column; inline is one wrapping row; bare adds no gap and no cap', () => {
    const stack = body(more, '.form');
    expect([prop(stack, 'display'), prop(stack, 'flex-direction'), prop(stack, 'gap'), prop(stack, 'max-width')]).toEqual(['flex', 'column', 'var(--sp-4)', 'var(--form-max)']);
    const inline = body(more, '.form_inline');
    expect([prop(inline, 'flex-direction'), prop(inline, 'flex-wrap'), prop(inline, 'gap'), prop(inline, 'max-width')]).toEqual(['row', 'wrap', 'var(--sp-3)', 'none']);
    const bare = body(more, '.form_bare');
    expect([prop(bare, 'display'), prop(bare, 'max-width')]).toEqual(['block', 'none']);
    expect(selectors(more).indexOf('.form_inline')).toBeGreaterThan(selectors(more).indexOf('.form'));
    expect(selectors(more).indexOf('.form_bare')).toBeGreaterThan(selectors(more).indexOf('.form'));
  });
});
