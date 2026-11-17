// Server choices: GET /servers (the rentals list) gives each server's specs nested (specs.cpu.cores,
// specs.ram.capacity_gb, specs.disks.total_gb) and, for a free slice held by the caller, server.computer_capacity.
// The page's servers read maps them, so the Servers list shows specs and the create form shows used/total.
import { describe, expect, it } from 'vitest';
import { computersTable } from './data';

const select = (raw: unknown) => computersTable.reads!.servers!.select!(raw, undefined as never) as Array<Record<string, unknown>>;

describe('servers read', () => {
  it('reads nested specs and the capacity gauge', () => {
    const [s] = select({
      data: [
        {
          server_id: 'a'.repeat(24),
          is_free_tier: true,
          status: 'active',
          server: { id: 'a'.repeat(24), name: 'sg-1', city: 'Singapore', country: 'SG', computer_capacity: { used: 2, max: 3 }, specs: { cpu: { cores: 64 }, ram: { capacity_gb: 256 }, disks: { total_gb: 2000 } } },
        },
      ],
    });
    expect(s).toMatchObject({ name: 'sg-1', cpu: 64, ram: 256, disk: 2000, free: true, cap: { used: 2, max: 3 } });
  });

  it('reads a slice\'s flat specs, and no gauge when the API leaves it out', () => {
    const [s] = select({ data: [{ server_id: 'b'.repeat(24), server: { id: 'b'.repeat(24), name: 'n2', specs: { cpu_cores: 4, ram_gb: 8, disk_gb: 50 } } }] });
    expect(s).toMatchObject({ cpu: 4, ram: 8, disk: 50, cap: null });
  });
});
