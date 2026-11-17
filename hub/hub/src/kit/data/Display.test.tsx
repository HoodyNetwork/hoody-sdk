import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextLine, Facts, Monogram, StatStrip, StatusPill, Tag } from './Display';

describe('ContextLine', () => {
  it('reads realm · computer · server, each a link when it has an href, state spoken', () => {
    render(
      <ContextLine
        realm={{ name: 'Acme client', color: 'blue', href: '/computers' }}
        computer={{ name: 'atlas', tone: 'ok', state: 'Running', href: '/computers/atlas' }}
        server={{ name: 'n12 Singapore', flag: '🇸🇬' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Acme client' })).toHaveAttribute('href', '/computers');
    expect(screen.getByRole('link', { name: 'atlas Running' })).toHaveAttribute('href', '/computers/atlas');
    expect(screen.queryByRole('link', { name: /n12/ })).toBeNull();
    expect(screen.getByText('n12 Singapore')).toBeInTheDocument();
    expect(screen.getAllByText('·')).toHaveLength(2);
  });

  it('a single part has no separator', () => {
    render(<ContextLine computer={{ name: 'atlas' }} />);
    expect(screen.queryByText('·')).toBeNull();
  });
});

describe('StatusPill', () => {
  it('shows its word and an optional dot', () => {
    const { container } = render(
      <StatusPill tone="accent" dot>
        Waiting for you
      </StatusPill>,
    );
    expect(screen.getByText('Waiting for you')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('Tag and Monogram', () => {
  it('a tag shows its text and takes a tone class', () => {
    render(
      <>
        <Tag>Included</Tag>
        <Tag tone="warn">Needs a key</Tag>
      </>,
    );
    expect(screen.getByText('Needs a key').className).not.toBe(screen.getByText('Included').className);
  });

  it('a removable tag has a remove button named with its label that calls onRemove', () => {
    let removed = 0;
    render(
      <>
        <Tag onRemove={() => (removed += 1)}>gpu</Tag>
        <Tag onRemove={() => undefined}>eu-west</Tag>
      </>,
    );
    const btn = screen.getByRole('button', { name: 'Remove gpu' });
    expect(screen.getByRole('button', { name: 'Remove eu-west' })).toBeInTheDocument();
    fireEvent.click(btn);
    expect(removed).toBe(1);
    expect(screen.getByText('gpu')).toBeInTheDocument();
  });

  it('a plain tag has no button', () => {
    render(<Tag>Included</Tag>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a monogram draws only the first letter and is hidden from assistive tech', () => {
    const { container } = render(<Monogram name="  openRouter" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.textContent).toBe('O');
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });

  it('a monogram takes the lg and xl sizes and a palette tint under its ink letter', () => {
    const { container } = render(
      <>
        <Monogram name="Gitea" size="lg" tint="green" />
        <Monogram name="?" size="xl" />
        <Monogram name="plain" />
      </>,
    );
    const [lg, xl, plain] = Array.from(container.children) as HTMLElement[];
    expect(lg!.textContent).toBe('G');
    expect(lg!.className).toMatch(/monogram_lg/);
    expect(lg!.className).toMatch(/monogramTint/);
    expect(lg!).toHaveClass('rc-green');
    expect(xl!.textContent).toBe('?');
    expect(xl!.className).toMatch(/monogram_xl/);
    expect(xl!.className).not.toMatch(/monogramTint/);
    expect(xl!.className).not.toMatch(/rc-/);
    expect(plain!.className).not.toMatch(/monogram_(md|lg|xl)|monogramTint/);
  });
});

describe('Facts', () => {
  it('masks ids, offers copy without showing a secret, and links nav values with a chevron', () => {
    const id = 'a1b2c3d4e5f6a1b2c3d4e5f6';
    render(
      <Facts
        items={[
          { label: 'Box', id },
          { label: 'Host', value: 'n12.example', copy: 'n12.example', mono: true },
          { label: 'Notes', value: 'Long text', wide: true },
        ]}
      />,
    );
    expect(document.body.textContent).not.toContain(id);
    expect(screen.getByRole('button', { name: 'Copy Host' })).toBeInTheDocument();
    expect(screen.getByText('Long text')).toBeInTheDocument();
  });

  it('the spec layout fills its columns top-down: rows = half the items, rounded up', () => {
    const { container } = render(<Facts layout="spec" items={[1, 2, 3, 4, 5].map((n) => ({ label: `L${n}`, value: n }))} />);
    const dl = container.querySelector('dl') as HTMLElement;
    expect(dl.style.getPropertyValue('--fact-rows')).toBe('3');
  });
});

describe('StatStrip', () => {
  it('shows at most five stats, numbers in ink, a status dot only where asked', () => {
    render(
      <StatStrip
        label="Summary"
        items={[
          { label: 'Computers', value: 12, detail: '7 running' },
          { label: 'Open alerts', value: 3, status: 'accent', statusLabel: 'needs you' },
          { label: 'C', value: 1 },
          { label: 'D', value: 1 },
          { label: 'E', value: 1 },
          { label: 'F', value: 1 },
        ]}
      />,
    );
    expect(screen.getByLabelText('Summary').querySelectorAll('dt')).toHaveLength(5);
    expect(screen.getByRole('img', { name: 'needs you' })).toBeInTheDocument();
    expect(screen.queryByText('F')).toBeNull();
  });
});
