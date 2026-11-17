// Kit routes for the files, pipe, egress, tunnel and code programs: each resolves to the program's own address (the one programUrl shows).
import { describe, expect, it } from 'vitest';
import { api } from './api';
import { portAddress } from './hosts';
import { defineRoute } from './routes';
import { boot, calls, PROXY, R1, TARGET } from './test/env';

describe('kit routes: files, pipe, egress, tunnel and code', () => {
  for (const kit of ['files', 'pipe', 'egress', 'tunnel', 'code'] as const) {
    it(`a '${kit}' route goes to ${kit}-1 on the computer`, async () => {
      boot({ realm: R1 });
      const r = defineRoute({ method: 'GET', path: '/x', scope: 'kit', kit, index: 1 });
      await api(r);
      expect(calls.map((c) => c.url)).toEqual([`https://p1-c1-${kit}-1.sv1.${PROXY}/x`]);
      expect(calls[0]!.url).toBe(portAddress(TARGET.project, TARGET.container, 1, kit) + '/x');
    });
  }
});
