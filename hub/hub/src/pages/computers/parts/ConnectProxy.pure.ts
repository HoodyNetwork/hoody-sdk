// The computer's proxy address (split out of ConnectProxy.tsx so the terminal build shares it; ConnectProxy.tsx
// re-exports it).
import { portAddress, routingNode } from '@core';
import type { Computer } from '../types';

/** The computer's proxy address (https://…:443), or '' while its server or the proxy domain is unknown. */
export function proxyUrl(c: Computer): string {
  const u = portAddress({ id: c.project_id }, { id: c.id, server_name: routingNode(c) }, 1, 'egress');
  return u ? `${u}:443` : '';
}
