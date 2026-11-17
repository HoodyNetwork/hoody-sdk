// The server detail's reading of the API: the rentals-list spec shape and the container-snapshot shape both fill the
// facts; a free slice's far-future end is no end; the runtime read is a whole server's or a slice's own.
import { describe, expect, it } from 'vitest';
import { capFull, factsOf, pickFacts, runtimeOf } from './ServerDetail.logic';

const rental = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  status: 'active',
  rental_end: '2026-12-01T00:00:00.000Z',
  amount: '70.00',
  remaining_days: 38,
  server_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  is_free_tier: false,
  server: {
    id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    name: 'node-7',
    country: 'SG',
    city: 'Singapore',
    datacenter: 'SIN-DC1',
    kvm_supported: true,
    specs: {
      cpu: { model: 'AMD EPYC 7763', cores: 64, threads: 128 },
      ram: { capacity_gb: 256 },
      disks: { total_gb: 2000, summary: '2x1TB NVMe' },
      network: { bandwidth_formatted: '10 Gbps', traffic_unlimited: true },
      additional: { ipv4_count: 5, ipv6_enabled: true },
    },
  },
};

describe('factsOf', () => {
  it('reads a rented server of the rentals list', () => {
    expect(factsOf({ ...rental, server: { ...rental.server, is_vm: false } })).toMatchObject({
      isVm: false,
      rentalId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      serverId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      name: 'node-7',
      cc: 'SG',
      cores: 64,
      threads: 128,
      ramGb: 256,
      diskGb: 2000,
      bandwidth: '10 Gbps',
      trafficUnlimited: true,
      ipv4Count: 5,
      kvm: true,
      days: 38,
      amount: '70.00',
      free: false,
    });
  });
  it('reads the container-snapshot spelling of the specs too', () => {
    const f = factsOf({
      id: 'cccccccccccccccccccccccc',
      is_free_tier: true,
      server: { id: 'cccccccccccccccccccccccc', name: 'n12', specs: { cpu_cores: 4, ram_gb: 8, disk_gb: 50, shared_compute: true } },
    });
    expect(f).toMatchObject({ cores: 4, ramGb: 8, diskGb: 50, sharedCompute: true, free: true });
  });
  it('a free slice has no end date, no days and no price: its rental_end is a placeholder', () => {
    const f = factsOf({ ...rental, is_free_tier: true, rental_end: '2099-01-01T00:00:00.000Z', remaining_days: 99999 });
    expect(f).toMatchObject({ free: true, rentalEnd: null, days: null, amount: '' });
  });
  it('reads the container capacity, and only a whole pair', () => {
    expect(factsOf({ ...rental, server: { ...rental.server, computer_capacity: { used: 3, max: 3 } } })?.cap).toEqual({ used: 3, max: 3 });
    expect(factsOf({ ...rental, server: { ...rental.server, computer_capacity: { used: 3 } } })?.cap).toBeNull();
  });
  it('anything that is not a row is nothing', () => {
    expect(factsOf(null)).toBeNull();
    expect(factsOf('x')).toBeNull();
    expect(factsOf({})).toMatchObject({ name: '', cores: null, kvm: null, cap: null });
  });
});

describe('pickFacts', () => {
  const ended = { ...rental, id: '1'.repeat(24), status: 'expired', rental_end: '2026-01-01T00:00:00.000Z', remaining_days: 0 };
  const raw = {
    data: [
      factsOf(rental) && rental,
      { id: 'dddddddddddddddddddddddd', server: { id: 'dddddddddddddddddddddddd', name: 'free-1' }, is_free_tier: true },
    ],
  };
  it('finds a row by its server id, and a free slice by its own id', () => {
    expect(pickFacts(raw, { serverId: 'bbbbbbbbbbbbbbbbbbbbbbbb' })?.name).toBe('node-7');
    expect(pickFacts(raw, { serverId: 'dddddddddddddddddddddddd' })?.name).toBe('free-1');
  });
  it('a rental id is not a server id', () => {
    expect(pickFacts(raw, { serverId: 'aaaaaaaaaaaaaaaaaaaaaaaa' })).toBeNull();
  });
  it('with the rental id, exactly that row, and only on that server', () => {
    const history = { data: [ended, rental] };
    expect(pickFacts(history, { serverId: 'bbbbbbbbbbbbbbbbbbbbbbbb', rentalId: ended.id })).toMatchObject({ rentalId: ended.id, status: 'expired' });
    expect(pickFacts(history, { serverId: 'bbbbbbbbbbbbbbbbbbbbbbbb', rentalId: rental.id })).toMatchObject({
      rentalId: rental.id,
      status: 'active',
    });
    expect(pickFacts(history, { serverId: 'dddddddddddddddddddddddd', rentalId: rental.id })).toBeNull();
    expect(pickFacts(history, { serverId: 'bbbbbbbbbbbbbbbbbbbbbbbb', rentalId: '9'.repeat(24) })).toBeNull();
  });
  it('without the rental id, the live row of the server, else the latest listed', () => {
    expect(pickFacts({ data: [ended, rental] }, { serverId: 'bbbbbbbbbbbbbbbbbbbbbbbb' })?.rentalId).toBe(rental.id);
    expect(pickFacts({ data: [rental, ended] }, { serverId: 'bbbbbbbbbbbbbbbbbbbbbbbb' })?.rentalId).toBe(rental.id);
    expect(pickFacts({ data: [ended] }, { serverId: 'bbbbbbbbbbbbbbbbbbbbbbbb' })?.rentalId).toBe(ended.id);
  });
  it('an unknown id or no id is no row', () => {
    expect(pickFacts(raw, { serverId: 'ffffffffffffffffffffffff' })).toBeNull();
    expect(pickFacts(raw, { serverId: '' })).toBeNull();
    expect(pickFacts(undefined, { serverId: 'x' })).toBeNull();
  });
});

describe('runtimeOf', () => {
  it('reads a whole server', () => {
    expect(runtimeOf({ data: { scope: 'server', uptime_s: 3600, cpu: { busy_pct: 12.5 }, mem: { pct: 40 }, storage: { pct: 70 }, stale: false } }, 'r1')).toEqual({
      rentalId: 'r1',
      scope: 'server',
      uptimeS: 3600,
      cpu: 12.5,
      mem: 40,
      disk: 70,
      stale: false,
    });
  });
  it('reads a slice, and an unverified one is stale', () => {
    expect(runtimeOf({ data: { scope: 'subserver', uptime_s: 5, health: 'unverified', cpu: { usage_pct: 0.2 }, mem: { pct: null }, disk: { pct: 9 } } })).toEqual({
      rentalId: '',
      scope: 'subserver',
      uptimeS: null,
      cpu: 0.2,
      mem: null,
      disk: 9,
      stale: true,
    });
  });
  it('an unknown scope or no data is nothing', () => {
    expect(runtimeOf({ data: { scope: 'other' } })).toBeNull();
    expect(runtimeOf(null)).toBeNull();
  });
});

describe('capFull', () => {
  it('is full only with room for none and a limit above 0', () => {
    expect(capFull({ cap: { used: 3, max: 3 } })).toBe(true);
    expect(capFull({ cap: { used: 2, max: 3 } })).toBe(false);
    expect(capFull({ cap: { used: 0, max: 0 } })).toBe(false);
    expect(capFull({ cap: null })).toBe(false);
  });
});
