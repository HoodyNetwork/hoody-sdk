// Named screenshot states of New realm (`bun run hub:shots --page realms`). The typed name is not kept in the URL,
// so every state past step 1 types it again. An outcome-named state (unknown) presses Create and ends on that
// Outcome line; the pick is the first computer row's checkbox (its label takes the press). Texts to wait for
// after an act are its last waitFor step (waitForText is checked before the act).
import type { Shots } from '@app/shots.types';

// The field by its exact name: the step's section ("Name your realm") is labelled too.
const name = { fill: 'role=textbox[name="Name"s]', text: 'Studio' };
const pickOne = { click: 'css=tbody tr:first-child label' };
const create = [name, { click: 'Next' }, pickOne, { click: 'Next' }, { click: 'Create realm' }];

export default [
  { name: 'default', extra: ['390-dark'] },
  { name: 'taken', act: [{ ...name, text: 'Personal' }, { click: 'Next' }, { waitFor: 'Another realm already has this name. Pick another.' }] },
  { name: 'computers', act: [name, { click: 'Next' }, pickOne], extra: ['390-dark'] },
  { name: 'review', act: [name, { click: 'Next' }, pickOne, { click: 'Next' }], extra: ['390-dark'] },
  { name: 'empty', state: 'empty', act: [name, { click: 'Next' }] },
  { name: 'error', state: 'error', act: [name, { click: 'Next' }] },
  { name: 'loading', state: 'loading', act: [name, { click: 'Next' }] },
  { name: 'names-error', state: 'namesFailed', waitForText: 'Try again' },
  { name: 'made', act: [...create, { waitFor: 'Studio is ready.' }], extra: ['390-dark'] },
  { name: 'name-unknown', state: 'nameLost', act: [...create, { waitFor: 'The name may not have saved' }] },
  { name: 'name-missing', state: 'nameLost', act: [...create, { click: 'Check again' }, { waitFor: 'The name is not in your realm names' }] },
  { name: 'name-unchecked', state: 'nameUnchecked', act: [...create, { waitFor: 'Check again before computers are added' }] },
  { name: 'name-refused', state: 'nameRefused', act: [...create, { waitFor: 'The realm was not created' }] },
  { name: 'name-retry-refused', state: 'nameLostThenRefused', act: [...create, { click: 'Check again' }, { waitFor: 'The name is not in your realm names' }, { click: 'Try again' }, { waitFor: "The latest try didn't save the name" }] },
  { name: 'computer-refused', state: 'computerRefused', act: [...create, { waitFor: '1 computer is not in the realm.' }] },
  { name: 'pinned', state: 'pinned', waitForText: "A shared-access session can't make realms" },
] satisfies Shots;
