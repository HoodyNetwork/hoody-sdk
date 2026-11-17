// IpAllowlistField ("Add my IP" on every IP field): one kit field for every address list. The page
// gives readIp (its own GET /ip read); the button only fills the field, nothing is sent. The address read shows as a
// kit IpInfo chip; an IPv6, private or already listed address is shown and never added.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { startTransition, Suspense, useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { IpDetails } from '../data/IpInfo';
import { IpAllowlistField, readIpFrom } from './IpAllowlistField';
import { Form } from './more';
import strings from './IpAllowlistField.strings.en.json';

const V4: IpDetails = { ip: '203.0.113.7', version: 4, country: 'PT', city: 'Lisbon' };

/** A readIp the test answers by hand. */
function gatedRead() {
  let answer: (d: IpDetails | null) => void = () => {};
  const readIp = () => new Promise<IpDetails | null>((r) => { answer = r; });
  return { readIp, land: (d: IpDetails | null) => act(async () => { answer(d); await Promise.resolve(); }) };
}

/** A page that keeps the list in plain state and passes a plain setter (no updater): the field still adds to what
 *  is in the box when the read lands, never to the value it started from. */
function Plain({ readIp, initial = '', locked = false, multiline }: { readIp: () => Promise<IpDetails | null>; initial?: string; locked?: boolean; multiline?: boolean }) {
  const [v, setV] = useState(initial);
  return <IpAllowlistField label="From addresses" description="IPv4 only" value={v} onChange={(up) => setV(up(v))} readIp={readIp} isDisabled={locked} multiline={multiline} />;
}

const box = () => screen.getByLabelText('From addresses') as HTMLInputElement;
const press = () => userEvent.click(screen.getByRole('button', { name: strings['ipf.add'] }));
const note = (text: string) => screen.getByText(text).closest('[role="status"]') as HTMLElement;

describe('kit IpAllowlistField: Add my IP', () => {
  it('adds the address the page reads and shows it with its place', async () => {
    render(<Plain readIp={async () => V4} />);
    await press();
    expect(await screen.findByText(strings['ipf.added'])).toBeInTheDocument();
    expect(within(note(strings['ipf.added'])).getByText('203.0.113.7')).toBeInTheDocument();
    expect(box().value).toBe('203.0.113.7');
  });

  it('keeps every typed entry and adds after them', async () => {
    render(<Plain readIp={async () => V4} initial="198.51.100.0/24" />);
    await press();
    await screen.findByText(strings['ipf.added']);
    expect(box().value).toBe('198.51.100.0/24, 203.0.113.7');
  });

  it('an address already listed says so and is not added twice', async () => {
    render(<Plain readIp={async () => V4} initial="203.0.113.7" />);
    await press();
    expect(await screen.findByText(strings['ipf.have'])).toBeInTheDocument();
    expect(box().value).toBe('203.0.113.7');
  });

  it('an IPv6 address is shown with the IPv4-only note and never added', async () => {
    render(<Plain readIp={async () => ({ ip: '2001:db8::7', version: 6 })} />);
    await press();
    expect(await screen.findByText(strings['ipf.v6'])).toBeInTheDocument();
    expect(within(note(strings['ipf.v6'])).getByText('2001:db8::7')).toBeInTheDocument();
    expect(box().value).toBe('');
  });

  it('a private address is shown with its note and never added', async () => {
    render(<Plain readIp={async () => ({ ip: '192.168.1.4', version: 4 })} />);
    await press();
    expect(await screen.findByText(strings['ipf.private'])).toBeInTheDocument();
    expect(box().value).toBe('');
  });

  it('a failed or malformed read says so and adds nothing', async () => {
    const { unmount } = render(<Plain readIp={async () => null} />);
    await press();
    expect(await screen.findByText(strings['ipf.failed'])).toBeInTheDocument();
    expect(box().value).toBe('');
    unmount();
    render(<Plain readIp={async () => ({ ip: '203.0.113.0/24', version: 4 })} />);
    await press();
    expect(await screen.findByText(strings['ipf.failed'])).toBeInTheDocument();
    expect(box().value).toBe('');
  });

  it('a read that lands after the person typed adds to what is in the box now', async () => {
    const g = gatedRead();
    render(<Plain readIp={g.readIp} />);
    await press();
    await userEvent.type(box(), '198.51.100.9');
    await userEvent.tab();
    await g.land(V4);
    expect(await screen.findByText(strings['ipf.added'])).toBeInTheDocument();
    expect(box().value).toBe('198.51.100.9, 203.0.113.7');
  });

  it('a read that lands while the form is sending changes nothing', async () => {
    const g = gatedRead();
    const { rerender } = render(<Plain readIp={g.readIp} />);
    await press();
    rerender(<Plain readIp={g.readIp} locked />);
    await g.land(V4);
    expect(screen.queryByText(strings['ipf.added'])).toBeNull();
    expect(box().value).toBe('');
    expect(box()).toBeDisabled();
    expect(screen.getByRole('button', { name: strings['ipf.add'] })).toBeDisabled();
  });

  it('a read that lands while a render is suspended adds to the value on screen, never to the dropped one', async () => {
    const g = gatedRead();
    let go = () => {};
    const never = new Promise<void>(() => {});
    function Suspends({ on }: { on: boolean }) {
      if (on) throw never;
      return null;
    }
    function Host() {
      const [v, setV] = useState('198.51.100.1');
      const [hold, setHold] = useState(false);
      go = () => startTransition(() => { setV('198.51.100.99'); setHold(true); });
      return (
        <Suspense fallback={<p>loading</p>}>
          <IpAllowlistField label="From addresses" description="IPv4 only" value={v} onChange={(up) => setV(up(v))} readIp={g.readIp} isDisabled={false} />
          <Suspends on={hold} />
        </Suspense>
      );
    }
    render(<Host />);
    await press();
    await act(async () => { go(); await Promise.resolve(); });
    expect(box().value).toBe('198.51.100.1');
    await g.land(V4);
    expect(await screen.findByText(strings['ipf.added'])).toBeInTheDocument();
    expect(box().value).toBe('198.51.100.1, 203.0.113.7');
  });

  it('readIpFrom: a failed refetch is no address, also over an earlier answer the query still holds', async () => {
    expect(await readIpFrom({ refetch: async () => ({ isError: true, data: V4 }) })()).toBeNull();
    expect(await readIpFrom({ refetch: async () => ({ isError: false, data: V4 }) })()).toEqual(V4);
    expect(await readIpFrom({ refetch: async () => ({ isError: false, data: undefined }) })()).toBeNull();
  });

  it('multiline shows a text area', () => {
    render(<Plain readIp={async () => V4} multiline />);
    expect(box().tagName).toBe('TEXTAREA');
  });
});

// An enclosing Form's lock (a send in flight, or an outcome not yet known) locks the field as
// its own `locked` does, though the page passes isDisabled={false}.
describe('kit IpAllowlistField: inside a locked Form (C9)', () => {
  it('Add my IP and the box are disabled, and no address is read', async () => {
    let reads = 0;
    render(
      <Form locked onSubmit={() => undefined}>
        <Plain readIp={async () => { reads++; return V4; }} />
      </Form>,
    );
    const add = screen.getByRole('button', { name: strings['ipf.add'] });
    expect(add).toBeDisabled();
    expect(box()).toBeDisabled();
    await userEvent.click(add);
    expect(reads).toBe(0);
    expect(box().value).toBe('');
  });

  it('a read that lands after the Form locked is dropped', async () => {
    const g = gatedRead();
    const { rerender } = render(
      <Form onSubmit={() => undefined}>
        <Plain readIp={g.readIp} />
      </Form>,
    );
    await press();
    rerender(
      <Form busy onSubmit={() => undefined}>
        <Plain readIp={g.readIp} />
      </Form>,
    );
    await g.land(V4);
    expect(box().value).toBe('');
    expect(screen.queryByText(strings['ipf.added'])).toBeNull();
  });
});
