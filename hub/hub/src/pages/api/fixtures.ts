// Fake-API states of the API page for hub:dev, hub:shots, tests and specs. The page asks the API nothing: its catalog
// ships with the Hub (catalog.gen.json), so the one state answers nothing.
import { defineFixtures } from '@app/fixtures';

export default defineFixtures({
  default: 'catalog',
  states: {
    catalog: {},
  },
});
