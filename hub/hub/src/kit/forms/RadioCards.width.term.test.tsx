// RadioGroup variant="cards" is the web's grid (`repeat(auto-fit, minmax(180px, 1fr))`): equal columns, each card as
// wide as its column. The cards were as wide as their own text, so two cards of a narrow group (Tunnels' "What to
// connect") stood under each other with different widths.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { RadioGroup } from './more';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const options = [
  { value: 'a', label: 'Put a laptop app online', description: 'Web pages and WebSockets get a web address on this computer.' },
  { value: 'b', label: 'Bring a service in', description: 'Any TCP service.' },
];
const draw = async (w: number): Promise<string[]> => {
  t = await drawTest(<FocusRoot><RadioGroup label="What" variant="cards" options={options} value="a" onChange={() => {}} /></FocusRoot>, { width: w, height: 16 });
  return (await t.settle()).split('\n').map((l) => l.trimEnd());
};
const tops = (f: string[]): string[] => f.filter((l) => l.includes('┌'));

test('two cards side by side share the row equally', async () => {
  const f = await draw(80);
  const top = tops(f);
  expect(top.length, f.join('\n')).toBe(1);
  const boxes = top[0]!.match(/┌─*┐/g)!;
  expect(boxes.length).toBe(2);
  expect(Math.abs(boxes[0]!.length - boxes[1]!.length)).toBeLessThanOrEqual(1);
  expect(top[0]!.length).toBeGreaterThanOrEqual(79);
});

test('under 47 cells the cards stack, each as wide as the group', async () => {
  const f = await draw(40);
  const top = tops(f);
  expect(top.length, f.join('\n')).toBe(2);
  expect(top[0]!.trim().length).toBe(40);
  expect(top[1]!.trim().length).toBe(40);
  // The longer text wraps inside its card instead of widening or leaving it.
  expect(f.every((l) => l.length <= 40)).toBe(true);
  expect(f.join(' ').replace(/[│\s]+/g, ' ')).toContain('get a web address on this computer.');
});
