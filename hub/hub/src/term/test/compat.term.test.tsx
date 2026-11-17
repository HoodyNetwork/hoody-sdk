import { expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { FocusRoot } from '../prim';
import { CompatSample } from './compat-sample';

const draw = (node: React.ReactNode, width = 50, height = 12) => drawTest(<FocusRoot>{node}</FocusRoot>, { width, height });
const lines = (f: string): string[] => f.split('\n').map((l) => l.trimEnd()).filter(Boolean);

test('raw HTML: blocks stack, inline runs stay one line, svg draws nothing', async () => {
  const t = await draw(<CompatSample name="Ada" />);
  const out = lines(t.captureCharFrame());
  expect(out[0]).toBe('Title');
  expect(out[1]).toBe('Hello Ada, you have 3 items.');
  expect(out[2]).toBe('• one'); // an unstyled ul marks its items (tags.ts list)
  expect(out[3]).toBe('• two second');
  expect(out[4]).toContain('Go');
  expect(out.length).toBe(5);
  t.renderer.destroy();
});

test('a button is reached with Tab and pressed with Enter', async () => {
  let went = 0;
  const t = await draw(<CompatSample name="Ada" onGo={() => { went++; }} />);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(went).toBe(1);
  t.renderer.destroy();
});

test('a component that returns a bare string inside a box is drawn (fork delta 1)', async () => {
  const Words = () => 'bare words';
  const t = await draw(<div><Words /><div>after</div></div>);
  expect(lines(t.captureCharFrame())).toEqual(['bare words', 'after']);
  t.renderer.destroy();
});

test('table cells share the row instead of running together', async () => {
  const t = await draw(<table><tbody><tr><td>Time</td><td>Result</td></tr></tbody></table>, 40, 4);
  expect(lines(t.captureCharFrame())[0]).toMatch(/^Time\s{5,}Result$/);
  t.renderer.destroy();
});

test('text runs do not depend on what child components render', async () => {
  const Words = () => 'Ada';
  const Span = () => <span>Ada</span>;
  const Frag = () => <><b>Ada</b></>;
  for (const node of [<div>Hello <Words />!</div>, <div>Hello <><span>Ada</span></>!</div>, <div>Hello <Span />!</div>, <div>Hello <Frag />!</div>]) {
    const t = await draw(node, 40, 4);
    expect(lines(t.captureCharFrame())).toEqual(['Hello Ada!']);
    t.renderer.destroy();
  }
});
