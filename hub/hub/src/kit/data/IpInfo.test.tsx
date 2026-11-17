// IpInfo: an IP address with its place at a glance (a flag drawn from the ISO country code, no
// image fetch; the code text where flags do not draw) and every detail GET /api/v1/ip gives, on hover, keyboard focus
// or a press (tap). Fields the API does not give are left out, never guessed.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IpInfo, ipDetailsFrom } from './IpInfo';

// The answer of GET /api/v1/ip (the API's response schema).
const answer = {
  statusCode: 200,
  message: 'IP information retrieved successfully',
  data: {
    ip: '203.0.113.58',
    user_agent: 'x',
    headers: {},
    timestamp: '2026-10-24T06:00:00Z',
    is_logged: true,
    protocol: 'https',
    ip_info: {
      ip: '203.0.113.58',
      hostname: 'host.example.net',
      city: 'Paris',
      region: 'Île-de-France',
      country: 'FR',
      loc: '48.8534,2.3488',
      postal: '75000',
      timezone: 'Europe/Paris',
      asn: {},
      is_anycast: false,
      is_mobile: false,
      is_anonymous: true,
      is_satellite: false,
      is_hosting: true,
    },
  },
};

describe('ipDetailsFrom', () => {
  it('reads the address and every place and network fact the answer gives', () => {
    const d = ipDetailsFrom(answer);
    expect(d).toMatchObject({ ip: '203.0.113.58', version: 4, city: 'Paris', region: 'Île-de-France', country: 'FR', postal: '75000', timezone: 'Europe/Paris', hostname: 'host.example.net', loc: '48.8534,2.3488', anonymous: true, hosting: true, mobile: false });
  });
  it('leaves out an empty network (the API serialises asn empty today) and anything missing', () => {
    const d = ipDetailsFrom(answer)!;
    expect(d).not.toHaveProperty('network');
    const bare = ipDetailsFrom({ data: { ip: '2001:db8::1', ip_info: null } })!;
    expect(bare).toEqual({ ip: '2001:db8::1', version: 6 });
  });
  it('keeps a network the API does give', () => {
    const d = ipDetailsFrom({ data: { ip: '8.8.8.8', ip_info: { asn: { asn: 'AS15169', name: 'Google LLC', domain: 'google.com', type: 'hosting' } } } })!;
    expect(d.network).toEqual({ asn: 'AS15169', name: 'Google LLC', domain: 'google.com', type: 'hosting' });
  });
  it('refuses an answer with no address, and ignores fields of the wrong type', () => {
    expect(ipDetailsFrom({ data: {} })).toBeNull();
    expect(ipDetailsFrom(null)).toBeNull();
    const d = ipDetailsFrom({ data: { ip: '1.2.3.4', ip_info: { city: 42, country: 'France', is_mobile: 'yes' } } })!;
    expect(d).toEqual({ ip: '1.2.3.4', version: 4 });
  });
});

describe('IpInfo', () => {
  it('shows the address, the place at a glance and a flag named by its country', () => {
    render(<IpInfo details={ipDetailsFrom(answer)!} flags="emoji" />);
    expect(screen.getByText('203.0.113.58')).toBeInTheDocument();
    expect(screen.getByText(/Paris/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'France' })).toHaveTextContent('🇫🇷');
  });

  it('shows the country code as text where flags do not draw', () => {
    render(<IpInfo details={ipDetailsFrom(answer)!} flags="code" />);
    expect(screen.getByRole('img', { name: 'France' })).toHaveTextContent('FR');
  });

  it('by default draws the flag only where the system draws flags (none here: no canvas), else the code', () => {
    render(<IpInfo details={ipDetailsFrom(answer)!} />);
    expect(screen.getByRole('img', { name: 'France' })).toHaveTextContent('FR');
  });

  it('has a copy button for the address', () => {
    render(<IpInfo details={ipDetailsFrom(answer)!} flags="code" />);
    expect(screen.getByRole('button', { name: 'Copy 203.0.113.58' })).toBeInTheDocument();
  });

  it('a press on Details (a tap, a click or Enter) opens every detail the API gave', async () => {
    render(<IpInfo details={ipDetailsFrom(answer)!} flags="code" />);
    await userEvent.click(screen.getByRole('button', { name: 'Details for 203.0.113.58' }));
    const d = await screen.findByRole('dialog', { name: 'Details for 203.0.113.58' });
    for (const text of ['Paris', 'Île-de-France', 'France', '75000', 'Europe/Paris', 'host.example.net', '48.8534,2.3488', 'IPv4 address', 'Anonymous (VPN, proxy or Tor)', 'Hosting or data center']) {
      expect(within(d).getByText(text)).toBeInTheDocument();
    }
    expect(within(d).queryByText(/Network/)).toBeNull();
    expect(within(d).queryByText('Mobile network')).toBeNull();
  });

  it('keyboard focus on Details shows the details too', async () => {
    render(<IpInfo details={ipDetailsFrom(answer)!} flags="code" />);
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Details for 203.0.113.58' })).toHaveFocus();
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Paris');
    expect(tip).toHaveTextContent('Europe/Paris');
  });

  it('with only an address, shows it and the IPv6 note, and no empty rows', async () => {
    render(<IpInfo details={{ ip: '2001:db8::1', version: 6 }} flags="code" note="Allow lists take IPv4 only." />);
    expect(screen.queryByRole('img')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Details for 2001:db8::1' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText('IPv6 address')).toBeInTheDocument();
    expect(within(d).getByText('Allow lists take IPv4 only.')).toBeInTheDocument();
    expect(within(d).queryByText('City')).toBeNull();
    act(() => {});
  });
});
