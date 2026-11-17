// The computer's server from the shared servers read, which the page already holds.
import { useServers } from '../data';
import type { Computer, Server } from '../types';
import { serverOf } from './upgrade';

/** Undefined until the servers list loads, or when it does not carry this computer's server. */
export function useServerOf(c: Computer): Server | undefined {
  return serverOf(c, useServers().data);
}
