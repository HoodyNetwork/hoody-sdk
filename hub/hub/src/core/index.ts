// @core: what pages import. Pages declare routes, queries and mutations in data.ts and fixture answers in
// fixtures.ts; they never call fetch or storage themselves.
// The fixture-free part lives in ./index.live.ts (the terminal ship build's '@core'); this barrel adds the fixture names.
export * from './index.live';
// The one sample world (ONE FIXTURE WORLD) and the fixture boot for page tests and the dev server.
export { fixtureWorld, manyNames, manyComputers, WORLD_NOW, type WorldComputer, type WorldRealm, type WorldServer, type WorldBot, type WorldProject } from './world';
export { worldColours } from './world';
export { lifecycleFixtures } from './fixtures';
export { bootFixtureCore, fixtureSession, realmsFixture, type FixtureBootOptions, type FixtureSessionSpec } from './fixture-boot';
// Fixture data only (pages' fixtures.ts): a launch answered by the SDK's kit fake on every run-open route.
export { runOpenFixture, type RunOpenFixture } from './run-open/fixtureKits';
