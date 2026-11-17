// pageReset.ts: the two journal helpers a page's scripted agent needs (the GitHub run's testing.ts reaches them through
// @ask/io, the only Ask door a page may use). They are here, not in testing.ts, so @ask/io never imports a test-input
// module (the terminal ship build refuses one as TERM_FIXTURE_INPUT). Called only by tests and testing.ts files.
import { withFixtureDest } from '../data';
import { resetDoorForTests } from './door';
import { resetHeldForTests } from './held';
import { resetStoresForTests } from './storage';
import { resetTickets } from '@core';

/** Stamps a test double with the computer it plays (what liveIO does for a real io). */
export function bindDestForTests<T extends object>(io: T, container: string): T { return withFixtureDest(io, container); }
/** Forgets every claim and every page-level registry: a fresh page. */
export function resetPageForTests(): void { resetTickets(); resetDoorForTests(); resetHeldForTests(); resetStoresForTests(); }
