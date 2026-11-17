// Where a flush Band tells its container it is there: the terminal's stand-in for the web's `:has(> [data-band-flush])`
// (a container that holds flush Bands leaves the framing to them). A container provides a counter; Band.term adds one
// while a flush Band is mounted under it. The web never provides it (its CSS reads the attribute).
import { createContext } from 'react';

/** `delta` is +1 when a flush Band mounts under the provider, -1 when it goes. */
export const FlushHostCtx = createContext<((delta: number) => void) | null>(null);
