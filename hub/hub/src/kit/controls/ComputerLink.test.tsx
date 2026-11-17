// ComputerLink: a computer's name goes to that computer's page, by its handle; plain text where there is nowhere to go.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computerHandle, computerHref } from '@core';
import { PagesProvider } from '../../shell/pageLinks';
import { ComputerLink } from './ComputerLink';

const served = (ui: React.ReactElement) => render(<PagesProvider pages={[{ id: 'computers', path: '/computers' }] as never}>{ui}</PagesProvider>);
const ID = 'a1b2c3d4e5f60718293a4b5c';

describe('ComputerLink', () => {
  it('links the name to the computer by its handle', () => {
    served(<ComputerLink name="daring-mint-walrus" handle="daring-mint-walrus.4b5c" />);
    expect(screen.getByRole('link', { name: 'daring-mint-walrus' })).toHaveAttribute('href', '/computers?sel=daring-mint-walrus.4b5c');
  });
  it('made from the id and name, the handle is the same one core makes, and the id is never shown', () => {
    const { container } = served(<ComputerLink id={ID} name="atlas" />);
    const a = screen.getByRole('link', { name: 'atlas' });
    expect(a).toHaveAttribute('href', computerHref(computerHandle({ id: ID, name: 'atlas' })));
    expect(container.innerHTML).not.toContain(ID);
  });
  it('a handle with characters a URL needs is encoded', () => {
    served(<ComputerLink name="a b" handle="a b.1234" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/computers?sel=a%20b.1234');
  });
  it('no handle and no id (unknown or deleted) keeps the name as text', () => {
    const { container } = served(<ComputerLink name="gone-box" />);
    expect(container.textContent).toBe('gone-box');
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('a load that does not serve Computers keeps the name as text', () => {
    const { container } = render(<PagesProvider pages={[{ id: 'keys', path: '/keys' }] as never}><ComputerLink name="atlas" handle="atlas.4b5c" /></PagesProvider>);
    expect(container.textContent).toBe('atlas');
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('plain keeps the name as text even where Computers is served (inside a button or another link)', () => {
    const { container } = served(<ComputerLink name="atlas" handle="atlas.4b5c" plain />);
    expect(container.textContent).toBe('atlas');
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('cut: the link itself is the one-line box that cuts (no wrapper to clip its focus ring); the text form cuts the same way', () => {
    const { container } = served(<ComputerLink name="atlas" handle="atlas.4b5c" cut />);
    const a = screen.getByRole('link', { name: 'atlas' });
    expect(a.parentElement).toBe(container);
    const plainCut = served(<ComputerLink name="atlas" cut />).container.firstElementChild as HTMLElement;
    expect(plainCut.tagName).toBe('SPAN');
    expect(plainCut.textContent).toBe('atlas');
    // The same cut class on both: the link carries it alongside the link's own classes.
    expect(plainCut.className).not.toBe('');
    expect(a.classList.contains(plainCut.className)).toBe(true);
    const { container: uncut } = served(<ComputerLink name="b" handle="b.2222" />);
    expect(uncut.querySelector('a')?.classList.contains(plainCut.className)).toBe(false);
  });
  it('the variant reaches the link', () => {
    const { container } = served(<><ComputerLink name="a" handle="a.1111" /><ComputerLink name="b" handle="b.2222" variant="nav" /></>);
    const [a, b] = [...container.querySelectorAll('a')];
    expect(a?.className).not.toBe(b?.className);
  });
});
