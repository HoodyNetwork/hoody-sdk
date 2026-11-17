// The terminal draws no rail line: the web rail's line 2 is a web column only, and the terminal list keeps its own fields.
import type * as Web from './RailLine';

export const RailLine: typeof Web.RailLine = () => null;
export const railStatus: typeof Web.railStatus = () => null;
