// The kit "At a glance": one section, its title,
// and the words for a fact not read yet, not read whole, or read only in part, all from the kit, never a page copy.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Glance, type GlanceFact } from '@kit';

describe('Glance', () => {
  it('is a section titled At a glance, its facts named by that title', () => {
    render(<Glance id="g" items={[{ label: 'Kept', value: '3 of 10' }]} />);
    const section = document.getElementById('g')!;
    expect(within(section).getByRole('heading', { name: 'At a glance' })).toBeTruthy();
    const list = within(section).getByLabelText('At a glance');
    expect(list.tagName).toBe('DL');
    expect(within(list).getByText('Kept')).toBeTruthy();
    expect(within(list).getByText('3 of 10')).toBeTruthy();
  });

  it('a fact not read says Reading…, one not read whole says Can’t tell, whatever value it holds', () => {
    render(
      <Glance
        id="g"
        items={[
          { label: 'A', value: 'guess', read: 'reading' },
          { label: 'B', value: 'guess', read: 'unknown' },
        ]}
      />,
    );
    expect(screen.queryByText('guess')).toBeNull();
    expect(screen.getByText('Reading…')).toBeTruthy();
    expect(screen.getByText("Can't tell")).toBeTruthy();
  });

  it('the section read sets every fact', () => {
    render(<Glance id="g" read="unknown" items={[{ label: 'A', value: '1' }, { label: 'B', value: '2' }]} />);
    expect(screen.getAllByText("Can't tell")).toHaveLength(2);
    expect(screen.queryByText('1')).toBeNull();
  });

  it('a floor reads At least, and a tip makes the value an InfoTip', () => {
    render(<Glance id="g" items={[{ label: 'Files', value: '40', atLeast: true }, { label: 'Access', value: 'Allowed', tip: 'Who can reach the internet from this computer.' }]} />);
    expect(screen.getByText('At least 40')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Access|Allowed/ })).toBeTruthy();
  });

  it('a limit shows its words, then a Meter named whole; not while the fact is unread', () => {
    const { rerender } = render(<Glance id="g" items={[{ label: 'Kept', value: '3 of 10', meter: { value: 30, label: '3 of 10 backups kept' } }]} />);
    expect(screen.getByText('3 of 10')).toBeTruthy();
    expect(screen.getByRole('meter', { name: '3 of 10 backups kept' })).toBeTruthy();
    rerender(<Glance id="g" read="reading" items={[{ label: 'Kept', value: '3 of 10', meter: { value: 30, label: '3 of 10 backups kept' } }]} />);
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('an unread fact shows no tip, by its own read or the section read', () => {
    const fact = { label: 'Access', value: 'Allowed', tip: 'Allowed for 10.0.0.4 only.' };
    const { rerender } = render(<Glance id="g" items={[{ ...fact, read: 'unknown' }]} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<Glance id="g" read="reading" items={[fact]} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Reading…')).toBeTruthy();
  });

  it('a fact with a tip and a meter keeps the meter outside the tip button', () => {
    render(<Glance id="g" items={[{ label: 'Rules', value: '4 of 10', tip: 'Firewall rules on this computer, of the most it takes.', meter: { value: 40, label: '4 of 10 rules' } }]} />);
    const meter = screen.getByRole('meter', { name: '4 of 10 rules' });
    expect(meter.closest('button')).toBeNull();
    expect(screen.getByRole('button').textContent).toContain('4 of 10');
  });

  it('a wide fact passed untyped still lands in the one named list', () => {
    const fact = { label: 'Address', value: 'files.example', wide: true };
    render(<Glance id="g" items={[fact as unknown as GlanceFact]} />);
    const lists = document.getElementById('g')!.querySelectorAll('dl');
    expect(lists).toHaveLength(1);
    expect(lists[0]!.getAttribute('aria-label')).toBe('At a glance');
    expect(within(lists[0]! as HTMLElement).getByText('files.example')).toBeTruthy();
  });
});
