import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Meter, Sparkline, WidgetActions, WidgetList, WidgetProgress, WidgetRow, WidgetStat, WidgetTitle } from './Widgets';

describe('widget building blocks', () => {
  it('WidgetTitle shows the count and a note', () => {
    render(
      <WidgetTitle count={3} note="1 failed today" noteTone="danger">
        Schedules
      </WidgetTitle>,
    );
    expect(screen.getByText('Schedules').parentElement).toHaveTextContent('Schedules31 failed today');
  });

  it('WidgetList is a labelled list of rows with label link, meta, pill and one action', () => {
    render(
      <WidgetList label="Bots">
        <WidgetRow label="Chief" href="/bots?sel=chief" tone="accent" pill={{ tone: 'accent', text: 'Waiting' }} action={<button type="button">Review</button>} />
        <WidgetRow label="Docs" meta="idle 2h" />
      </WidgetList>,
    );
    const list = screen.getByRole('list', { name: 'Bots' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Chief' })).toHaveAttribute('href', '/bots?sel=chief');
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByText('idle 2h')).toBeInTheDocument();
  });

  it('WidgetStat shows the value, caption and chart; Sparkline is a labelled image', () => {
    render(<WidgetStat value="12" caption="failed in the last hour" chart={<Sparkline label="Failures per hour" points={[0, 1, 0, 5, 7, 3]} />} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Failures per hour' })).toBeInTheDocument();
  });

  it('Sparkline survives one point and flat data', () => {
    const { container } = render(
      <>
        <Sparkline label="a" points={[4]} />
        <Sparkline label="b" points={[2, 2, 2]} />
      </>,
    );
    for (const p of container.querySelectorAll('path')) expect(p.getAttribute('d')).not.toMatch(/NaN|Infinity/);
  });

  it('WidgetProgress is a progressbar with "2 of 4", clamped', () => {
    render(<WidgetProgress done={2} total={4} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuetext', '2 of 4 done');
    expect(screen.getByText('2 of 4')).toBeInTheDocument();
  });

  it('WidgetProgress has an accessible name: its visible label, or the label prop', () => {
    const { unmount } = render(<WidgetProgress done={2} total={4} />);
    expect(screen.getByRole('progressbar', { name: '2 of 4' })).toBeInTheDocument();
    unmount();
    render(<WidgetProgress done={1} total={3} label="Get started" />);
    expect(screen.getByRole('progressbar', { name: 'Get started' })).toHaveAttribute('aria-valuetext', '1 of 3 done');
  });

  it('two progress bars on one screen each keep their own name', () => {
    render(
      <>
        <WidgetProgress done={2} total={4} />
        <WidgetProgress done={3} total={5} />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: '2 of 4' })).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByRole('progressbar', { name: '3 of 5' })).toHaveAttribute('aria-valuenow', '3');
  });

  it('WidgetActions holds the footer actions', () => {
    render(
      <WidgetActions>
        <a href="#/logs">See what failed</a>
      </WidgetActions>,
    );
    expect(screen.getByRole('link', { name: 'See what failed' })).toBeInTheDocument();
  });
});

describe('Meter (computers usage, billing usage, home setup)', () => {
  it('a value that is not a number (NaN, Infinity) shows as 0 with no warning tone', () => {
    render(
      <>
        <Meter value={Number.NaN} label="nan" />
        <Meter value={Number.POSITIVE_INFINITY} label="inf" />
      </>,
    );
    for (const name of ['nan', 'inf']) {
      const m = screen.getByRole('meter', { name });
      expect(m).toHaveAttribute('aria-valuenow', '0');
      expect(m).toHaveAttribute('data-tone', 'neutral');
    }
  });

  it('is a named meter with its value, clamped to 0-100', () => {
    render(
      <>
        <Meter value={42} label="CPU 42%" />
        <Meter value={140} label="Disk" />
      </>,
    );
    const cpu = screen.getByRole('meter', { name: 'CPU 42%' });
    expect(cpu).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByRole('meter', { name: 'Disk' })).toHaveAttribute('aria-valuenow', '100');
  });

  it('turns warn at 75 and danger at 90 by default; tone overrides', () => {
    const { container } = render(
      <>
        <Meter value={74} label="a" />
        <Meter value={75} label="b" />
        <Meter value={90} label="c" />
        <Meter value={10} label="d" tone="danger" />
      </>,
    );
    const tones = [...container.querySelectorAll('[role="meter"]')].map((m) => m.getAttribute('data-tone'));
    expect(tones).toEqual(['neutral', 'warn', 'danger', 'danger']);
  });

  it('lights whole blocks of ten: ceil(value / 10), the exact value kept for assistive tech', () => {
    const vals = [0, 1, 10, 11, 42, 90, 91, 95, 100];
    const { container } = render(
      <>
        {vals.map((v) => (
          <Meter key={v} value={v} label={`m${v}`} />
        ))}
      </>,
    );
    const bars = [...container.querySelectorAll('[role="meter"] > span')].map((b) => (b as HTMLElement).style.getPropertyValue('--meter-lit'));
    expect(bars).toEqual(['0%', '10%', '10%', '20%', '50%', '90%', '100%', '100%', '100%']);
    expect(vals.map((v) => screen.getByRole('meter', { name: `m${v}` }).getAttribute('aria-valuenow'))).toEqual(vals.map(String));
  });

  it('a fractional value is never rounded: 0.1 lights one block, 10.1 two, 90.1 ten; the exact value is kept', () => {
    const vals = [0.04, 0.1, 9.99, 10.1, 74.6, 89.9, 90.1];
    const { container } = render(
      <>
        {vals.map((v) => (
          <Meter key={v} value={v} label={`f${v}`} />
        ))}
      </>,
    );
    const bars = [...container.querySelectorAll('[role="meter"] > span')].map((b) => (b as HTMLElement).style.getPropertyValue('--meter-lit'));
    expect(bars).toEqual(['10%', '10%', '10%', '20%', '80%', '90%', '100%']);
    const m = (v: number) => screen.getByRole('meter', { name: `f${v}` });
    expect(vals.map((v) => m(v).getAttribute('aria-valuenow'))).toEqual(vals.map(String));
    // Tone thresholds read the exact value: 74.6 is not yet high, 89.9 not yet very high.
    expect(vals.map((v) => m(v).getAttribute('data-tone'))).toEqual(['neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'warn', 'danger']);
    expect(vals.map((v) => m(v).getAttribute('aria-valuetext'))).toEqual(['<0.1%', '0.1%', '10%', '10.1%', '74.6%', '89.9%, high', '90.1%, very high']);
  });

  it('the value in words names the level, since warn and danger draw alike', () => {
    render(
      <>
        <Meter value={30} label="a" />
        <Meter value={80} label="b" />
        <Meter value={95} label="c" />
        <Meter value={95} label="d" tone="neutral" />
        <Meter value={10} label="e" tone="danger" />
      </>,
    );
    expect(['a', 'b', 'c', 'd', 'e'].map((n) => screen.getByRole('meter', { name: n }).getAttribute('aria-valuetext'))).toEqual([
      '30%',
      '80%, high',
      '95%, very high',
      '95%',
      '10%, very high',
    ]);
  });

  it('indeterminate is a named progressbar with no value', () => {
    render(<Meter indeterminate label="Setting up your computer" />);
    const bar = screen.getByRole('progressbar', { name: 'Setting up your computer' });
    expect(bar).not.toHaveAttribute('aria-valuenow');
  });
});
