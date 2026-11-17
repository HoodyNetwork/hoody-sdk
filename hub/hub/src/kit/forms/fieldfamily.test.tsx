// The one field box. Every copy in the family carries .box from forms/fieldBox.module.css, every look comes from
// its rules on the field tokens, and each field hands a page its own input or trigger (inputRef, triggerRef) and takes a `width`.
// The computed looks, in each theme, pointer and density, are in fieldfamily.field-family-theme.spec.ts and controls/controls.matrix.spec.ts.
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DateField } from './DateField';
import b from './fieldBox.module.css';
import f from './fields.module.css';
import { TextField, SearchField } from './fields';
import { Combobox, NumberField, Select } from './more';
import { OtpField } from './OtpField';
import { PickerTrigger } from '../pickers/ComputerPicker';
import { SrOnly } from '../data/Display';
import { SR_ONLY } from '../controls/SrOnly';

const here = dirname(fileURLToPath(import.meta.url));
const css = (file: string) => readFileSync(join(here, file), 'utf8');
const opts = [{ value: 'a', label: 'A' }];

describe('the field box has one home', () => {
  const boxOf = (el: Element | null) => el?.classList.contains(String(b.box)) ?? false;
  it('every copy carries .box', () => {
    render(
      <>
        <TextField label="Plain" />
        <TextField label="Slotted" prefix="https://" />
        <SearchField label="Find" />
        <NumberField label="Count" />
        <Select label="Pick" options={opts} value="a" onChange={() => undefined} />
        <Combobox label="Combo" options={opts} value="a" onChange={() => undefined} />
        <PickerTrigger label="Trig" text="Pick" />
        <OtpField value="" onChange={() => undefined} length={1} label="Code" />
      </>,
    );
    expect(boxOf(screen.getByRole('textbox', { name: 'Plain' }))).toBe(true);
    expect(boxOf(screen.getByRole('textbox', { name: 'Slotted' }).parentElement)).toBe(true);
    expect(boxOf(screen.getByRole('textbox', { name: 'Slotted' }))).toBe(false);
    expect(boxOf(screen.getByRole('searchbox', { name: 'Find' }))).toBe(true);
    expect(boxOf(screen.getByRole('textbox', { name: 'Count' }).closest('[role="group"]'))).toBe(true);
    expect(boxOf(screen.getByRole('button', { name: /Pick$/ }))).toBe(true);
    expect(boxOf(screen.getByRole('combobox', { name: 'Combo' }))).toBe(true);
    expect(boxOf(screen.getByRole('button', { name: /Trig/ }))).toBe(true);
    expect(boxOf(screen.getByRole('textbox', { name: 'Code' }).previousElementSibling)).toBe(true);
  });

  it.each([
    ['fields.module.css', 'input'],
    ['fields.module.css', 'slotBox'],
    ['fields.module.css', 'searchInput'],
    ['more.module.css', 'number'],
    ['more.module.css', 'selectBtn'],
    ['more.module.css', 'searchInput'],
    ['OtpField.module.css', 'cell'],
    ['../pickers/ComputerPicker.module.css', 'trigger'],
  ])('%s .%s draws no box of its own', (file, cls) => {
    const body = new RegExp(`^\\.${cls} \\{([^}]*)\\}`, 'm').exec(css(file))?.[1] ?? '';
    expect(body).not.toBe('');
    expect(body).not.toMatch(/\b(border|border-radius|background|color|font-size|height):/);
  });

  it('no copy keeps a state rule of its own', () => {
    expect(css('fields.module.css')).not.toMatch(/\.(input|searchInput)\[data-/);
    // A state rule of the box itself; a part inside it (Select's chosen value following the box's disabled ink) is not one.
    expect(css('more.module.css')).not.toMatch(/\.(number|selectBtn)\[data-[^\]]*\]\s*[,{]|\[data-invalid\] > \.selectBtn/);
    expect(css('../pickers/ComputerPicker.module.css')).not.toMatch(/\.trigger\[data-/);
  });

  it('a field that changes what the box sets does it with two classes, so the load order cannot undo it', () => {
    expect(css('fields.module.css')).toMatch(/\.input\.textarea \{\s*height: auto;/);
    expect(css('fields.module.css')).toMatch(/\.field \.slotBox \{\s*height: auto;/);
    expect(css('fields.module.css')).toMatch(/\.input\.mono \{/);
    expect(css('OtpField.module.css')).toMatch(/\.cells \.cell \{\s*height: var\(--field-otp-h\);\s*font-size:/);
  });
});

describe('a page reaches the field itself', () => {
  it.each([
    ['TextField', (r: React.Ref<HTMLInputElement>) => <TextField label="F" inputRef={r} />, 'INPUT'],
    ['SearchField', (r: React.Ref<HTMLInputElement>) => <SearchField label="F" inputRef={r} />, 'INPUT'],
    ['NumberField', (r: React.Ref<HTMLInputElement>) => <NumberField label="F" inputRef={r} />, 'INPUT'],
    ['Combobox', (r: React.Ref<HTMLInputElement>) => <Combobox label="F" options={opts} value="a" onChange={() => undefined} inputRef={r} />, 'INPUT'],
    ['DateField', (r: React.Ref<HTMLInputElement>) => <DateField label="F" value="" onChange={() => undefined} inputRef={r} />, 'INPUT'],
    ['OtpField', (r: React.Ref<HTMLInputElement>) => <OtpField value="" onChange={() => undefined} inputRef={r} />, 'INPUT'],
  ])('%s inputRef', (_name, make, tag) => {
    const r = createRef<HTMLInputElement>();
    render(make(r));
    expect(r.current?.tagName).toBe(tag);
  });

  it('a multiline TextField hands over its textarea', () => {
    const r = createRef<HTMLTextAreaElement>();
    render(<TextField label="F" multiline inputRef={r} />);
    expect(r.current?.tagName).toBe('TEXTAREA');
  });

  it('focusOnError still focuses the input when a page holds the ref too', () => {
    const r = createRef<HTMLInputElement>();
    const { rerender } = render(<TextField label="F" focusOnError inputRef={r} />);
    rerender(<TextField label="F" focusOnError inputRef={r} errorMessage="No" />);
    expect(document.activeElement).toBe(r.current);
  });

  it('Select and PickerTrigger hand over their button', () => {
    const a = createRef<HTMLButtonElement>();
    const b = createRef<HTMLButtonElement>();
    render(
      <>
        <Select label="F" options={opts} value="a" onChange={() => undefined} triggerRef={a} />
        <PickerTrigger label="G" text="Pick" triggerRef={b} />
      </>,
    );
    expect(a.current?.tagName).toBe('BUTTON');
    expect(b.current?.tagName).toBe('BUTTON');
  });
});

describe('width', () => {
  it.each([
    ['NumberField', <NumberField key="n" label="F" width="sm" />],
    ['Combobox', <Combobox key="c" label="F" options={opts} value="a" onChange={() => undefined} width="sm" />],
    ['DateField', <DateField key="d" label="F" value="" onChange={() => undefined} width="sm" />],
  ])('%s draws the width class on the field root', (_name, el) => {
    render(el);
    const input = screen.queryAllByRole('textbox').concat(screen.queryAllByRole('combobox'))[0] as HTMLElement;
    expect(input.closest(`.${f.field}`)?.className).toMatch(/w_sm/);
  });

  it('PickerTrigger draws it on the button', () => {
    render(<PickerTrigger label="G" text="Pick" width="sm" />);
    expect(screen.getByRole('button').className).toMatch(/w_sm/);
  });
});

describe('SearchField sizes', () => {
  it('toolbar sets the toolbar class on the root, md sets none', () => {
    const { container, rerender } = render(<SearchField label="F" size="toolbar" />);
    expect((container.firstElementChild as HTMLElement).className).toMatch(/search_toolbar/);
    rerender(<SearchField label="F" />);
    expect((container.firstElementChild as HTMLElement).className).not.toMatch(/search_toolbar/);
  });
});

describe('SrOnly', () => {
  it('is read by name and uses the kit rule that takes no visual space', () => {
    render(<button type="button"><SrOnly>Failed</SrOnly></button>);
    expect(screen.getByRole('button', { name: 'Failed' })).toBeTruthy();
    // The one visually-hidden rule lives in kit/base.css (.hxSrOnly, the SR_ONLY class SrOnly renders).
    expect(screen.getByText('Failed')).toHaveClass(SR_ONLY);
    const rule = /^\.hxSrOnly \{([^}]*)\}/m.exec(css('../base.css'))?.[1] ?? '';
    expect(rule).toMatch(/position: absolute/);
    expect(rule).toMatch(/clip-path: inset\(50%\)/);
  });
});
