// Danger is a `tone`, never a variant. Every danger button draws the one danger plate (the grey plate in the danger ink
// and frame, never a red fill); a danger primary is marked `dangerSolid` (an armed confirm), any other danger `danger`:
// the classes and data-variant the retired variant spellings draw. A danger button never carries the end glyph. Dialog's
// primary takes `primaryTone`, ConfirmDialog and the ActionBar draw their danger through it, and FormFooter's danger
// submit too.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Button, IconButton, LinkButton, type ButtonVariant } from './Button';
import { ConfirmDialog, Dialog } from '../overlays/Overlays';
import { ActionControl } from '../layouts/anatomy/ActionBar';
import { FormFooter } from '../forms/more';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const btn = (name: string) => screen.getByRole('button', { name });
/** A button's classes, its data-variant and whether it draws the end glyph (the root marker and the mark inside go together). */
const look = (el: HTMLElement) => {
  expect(el.querySelector(':scope > [data-glyph-mark]') !== null).toBe(el.hasAttribute('data-glyph'));
  return { cls: el.className, variant: el.getAttribute('data-variant'), glyph: el.hasAttribute('data-glyph') };
};

describe('Button tone', () => {
  // Every variant but primary a caller can pair with danger, and the retired spelling it draws as.
  const PLAIN: ButtonVariant[] = ['secondary', 'ghost', 'row', 'bubble'];
  it.each(PLAIN)('variant %s with tone="danger" draws exactly what variant="danger" draws', (variant) => {
    render(
      <>
        <Button variant={variant} tone="danger">New</Button>
        <Button variant="danger">Old</Button>
      </>,
    );
    expect(look(btn('New'))).toEqual(look(btn('Old')));
    expect(look(btn('New'))).toMatchObject({ variant: 'danger', glyph: false });
  });

  it('tone="danger" on its own is the danger plate', () => {
    render(
      <>
        <Button tone="danger" size="sm">New</Button>
        <Button variant="danger" size="sm">Old</Button>
      </>,
    );
    expect(look(btn('New'))).toEqual(look(btn('Old')));
  });

  it('a primary with tone="danger" is marked dangerSolid (the retired spelling draws the same), never with the glyph', () => {
    render(
      <>
        <Button variant="primary" tone="danger">New</Button>
        <Button variant="dangerSolid">Old</Button>
      </>,
    );
    expect(look(btn('New'))).toEqual(look(btn('Old')));
    expect(look(btn('New'))).toMatchObject({ variant: 'dangerSolid', glyph: false });
  });

  it('tone="default" changes nothing: a primary keeps its look and its glyph', () => {
    render(
      <>
        <Button variant="primary" tone="default">New</Button>
        <Button variant="primary">Old</Button>
      </>,
    );
    expect(look(btn('New'))).toEqual(look(btn('Old')));
    expect(look(btn('New'))).toMatchObject({ variant: 'primary', glyph: true });
  });

  it('LinkButton takes the same tone: the danger plate, no glyph', () => {
    render(
      <>
        <LinkButton href="#/a" tone="danger">New</LinkButton>
        <LinkButton href="#/a" variant="danger">Old</LinkButton>
      </>,
    );
    const at = (name: string) => screen.getByRole('link', { name });
    expect(look(at('New'))).toEqual(look(at('Old')));
    expect(look(at('New'))).toMatchObject({ variant: 'danger', glyph: false });
  });

  it('IconButton tone="danger" is the danger look, whatever its variant', () => {
    render(
      <>
        <IconButton icon="trash" label="New" tone="danger" />
        <IconButton icon="trash" label="Old" variant="danger" />
        <IconButton icon="trash" label="Primary" variant="primary" tone="danger" />
      </>,
    );
    expect(btn('New').className).toBe(btn('Old').className);
    expect(btn('Primary').className).toBe(btn('Old').className);
  });
});

describe('the danger plate, in the Button CSS', () => {
  const css = readFileSync(join(import.meta.dirname, 'Button.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = (sel: string) => {
    const at = css.indexOf(`${sel} {`);
    expect(at, sel).toBeGreaterThanOrEqual(0);
    return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  };
  const decls = (sel: string) => body(sel).split(';').map((d) => d.trim()).filter(Boolean);

  it('both spellings are one rule: the danger ink and frame on the grey plate, never a fill of their own', () => {
    expect(decls('.danger,\n.dangerSolid')).toEqual(['--plate-line: var(--hx-danger)', 'color: var(--hx-danger)']);
    expect(css).not.toMatch(/--hx-danger-fill/);
    // Its icon-only form takes the same ink.
    expect(decls('.iconOnly:is(.danger, .dangerSolid)')).toEqual(['color: var(--hx-danger)']);
  });

  it('hover and pressed share one step: the darkest plate that keeps the danger ink readable, the frame still danger', () => {
    expect(decls('.danger:is([data-hovered], [data-pressed]),\n.dangerSolid:is([data-hovered], [data-pressed])')).toEqual(['--plate: var(--hx-btn-danger-hover)', '--plate-line: var(--hx-danger)']);
    // After the family's hover and pressed steps, at their weight, so the full-ink frame never replaces the danger one.
    expect(css.indexOf('.danger:is([data-hovered], [data-pressed])')).toBeGreaterThan(css.indexOf('.button[data-pressed] {'));
  });
});

describe('Dialog primaryTone', () => {
  const primary = () => document.querySelector('[data-dialog-primary]') as HTMLElement;

  it('a danger primary in a default dialog: the danger plate, no glyph', () => {
    render(<Dialog isOpen onOpenChange={() => undefined} title="Close boards" primaryLabel="Close all" primaryTone="danger" onPrimary={() => undefined} />);
    expect(look(primary())).toMatchObject({ variant: 'danger', glyph: false });
  });

  it('a danger dialog with no primaryTone keeps its danger primary', () => {
    render(<Dialog isOpen onOpenChange={() => undefined} title="Delete" tone="danger" primaryLabel="Delete" onPrimary={() => undefined} />);
    expect(look(primary())).toMatchObject({ variant: 'danger', glyph: false });
  });

  it('ConfirmDialog: a typed danger confirm is `danger` until armed, then `dangerSolid`; a default confirm is the primary with its glyph', () => {
    const { unmount } = render(<ConfirmDialog isOpen onOpenChange={() => undefined} title="Delete" tone="danger" typed confirmDisabled onConfirm={() => undefined} />);
    expect(look(primary())).toMatchObject({ variant: 'danger', glyph: false });
    unmount();
    const armed = render(<ConfirmDialog isOpen onOpenChange={() => undefined} title="Delete" tone="danger" typed onConfirm={() => undefined} />);
    expect(look(primary())).toMatchObject({ variant: 'dangerSolid', glyph: false });
    armed.unmount();
    render(<ConfirmDialog isOpen onOpenChange={() => undefined} title="Restart" onConfirm={() => undefined} />);
    expect(look(primary())).toMatchObject({ variant: 'primary', glyph: true });
  });
});

describe('FormFooter danger', () => {
  it('a danger submit is the danger plate, a default one the primary with its glyph', () => {
    render(
      <>
        <FormFooter dirty tone="danger" submitLabel="Wipe" onSubmit={() => undefined} />
        <FormFooter dirty submitLabel="Save" onSubmit={() => undefined} />
      </>,
    );
    expect(look(btn('Wipe'))).toMatchObject({ variant: 'danger', glyph: false });
    expect(look(btn('Save'))).toMatchObject({ variant: 'primary', glyph: true });
  });
});

describe('ActionBar danger', () => {
  const action = { id: 'del', label: 'Delete', tone: 'danger' as const, onPress: () => undefined };
  it('a danger primary action is marked dangerSolid, a danger secondary danger', () => {
    render(
      <>
        <ActionControl action={action} variant="primary" />
        <ActionControl action={{ ...action, id: 'rm', label: 'Remove' }} variant="secondary" />
      </>,
    );
    expect(look(btn('Delete'))).toMatchObject({ variant: 'dangerSolid', glyph: false });
    expect(look(btn('Remove'))).toMatchObject({ variant: 'danger', glyph: false });
  });
});
