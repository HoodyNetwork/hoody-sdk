// '@core' where fixtures are on (the vite alias in fixture modes, the terminal loader's fixture flavour): the web barrel
// (./index.ts: the live barrel plus the fixture names) plus core's fixture-only states. The terminal ship build resolves
// '@core' to ./index.live.ts, so no fixture module is ever its input (TERM_FIXTURE_INPUT). Relative imports of core's
// barrel (./index, ../core) reach the web barrel.
export * from './index';
export { coreFixtures, FIXTURE_REALM_2 } from './fixtures';
