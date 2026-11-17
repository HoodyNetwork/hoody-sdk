// SessionView.term's thread: each turn says who wrote what. Your message carries "You"; the Agent's name (as the source's meta
// names it, on its computer) leads its first block of the turn, once, whatever that block is.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { SessionView } from './SessionView';
import { scriptedSource } from './scriptedSource.fixture';

test('one author line per turn side: You above the message, the Agent above its first block only', async () => {
  const src = scriptedSource([
    { k: 'user', text: 'Check the ports' },
    { k: 'steps', label: 'Looked at the listeners', rows: [{ verb: 'Ran', summary: 'ss -ltn', state: 'ok' }] },
    { k: 'reply', text: 'Two ports are open.' },
    { k: 'user', text: 'Close 8080' },
    { k: 'reply', text: 'Closed.' },
  ]);
  const t = await drawTest(<FocusRoot><Box dir="column" width={80} height={30}><SessionView source={src} size="l" typing /></Box></FocusRoot>, { width: 80, height: 30 });
  src.drain();
  const f = await t.settle();
  const rows = f.split('\n').map((r) => r.trim());
  const at = (re: RegExp) => rows.map((r, i) => (re.test(r) ? i : -1)).filter((i) => i >= 0);
  const you = at(/^│? ?You\b/), agent = at(/^✦ general on atlas$/);
  expect(you).toHaveLength(2);
  expect(agent).toHaveLength(2);
  const steps = rows.findIndex((r) => r.includes('Looked at the listeners'));
  const reply = rows.findIndex((r) => r.includes('Two ports are open.'));
  // The Agent's line sits right above the steps and not again above the reply of the same turn.
  expect(agent[0]).toBe(steps - 1);
  expect(agent.filter((i) => i > steps && i < reply)).toHaveLength(0);
  expect(agent[1]).toBe(rows.findIndex((r) => r.includes('Closed.')) - 1);
  t.renderer.destroy();
});
