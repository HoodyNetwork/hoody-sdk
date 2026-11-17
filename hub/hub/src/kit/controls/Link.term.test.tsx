// Link.term: the web component's observable behaviours, each held here.
// - TextButton: underlined words; Enter presses (onPress with a press event); busy "…" and no press; a disabled one
//   with a reason stays focusable, does nothing and shows the reason while focused
// - Link: Enter calls onPress (and goes to a Hub path: router, not exercised here); an href that holds an id shows the
//   mask (••••) and never puts the address on screen
// - ExtLink: the address with its scheme and ⇗; empty = —; not a web address = plain text; a secret address (asked
//   for, or an id in its host) shows its scheme and bullets only; words that repeat a secret address are dropped
// - autolink: bare http(s) addresses in text become ExtLinks; one with a query stays text; a text holding an id is the
//   mask, whole
// - pure (Link.pure.ts): webAddress, secretShape, holdsId, safeShown, resetExtLinkNotes
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { ExtLink, Link, TextButton, autolink } from './Link';
import { holdsId, resetExtLinkNotes, safeShown, secretShape, webAddress } from './Link.pure';

const ID = '0123456789abcdef01234567';

test('TextButton: press, busy, soft reason', async () => {
  const got: string[] = [];
  const t = await drawTest(
    <FocusRoot>
      <Box dir="column" gap={1}>
        <TextButton onPress={(e) => got.push(`a:${e.type}`)}>Show all</TextButton>
        <TextButton busy onPress={() => got.push('busy')}>Loading</TextButton>
        <TextButton isDisabled disabledReason="Nothing to show." onPress={() => got.push('soft')}>Hidden</TextButton>
      </Box>
    </FocusRoot>,
    { width: 40, height: 8 },
  );
  let f = t.captureCharFrame();
  expect(f).toContain('Show all');
  expect(f).toContain('… Loading');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  // The busy one is a Tab stop (pending keeps the focus) and refuses the press.
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).toContain('Nothing to show.');
  t.mockInput.pressEnter();
  await t.settle();
  expect(got).toEqual(['a:press']);
  t.renderer.destroy();
});

// A look prop never changes behaviour. Every tone presses exactly once per Enter, Space and click.
test('TextButton: each tone presses once per Enter, Space and click', async () => {
  for (const tone of ['default', 'danger'] as const) {
    const got: string[] = [];
    const t = await drawTest(
      <FocusRoot><TextButton tone={tone} autoFocus onPress={(e) => got.push(e.type)}>Forget</TextButton></FocusRoot>,
      { width: 40, height: 4 },
    );
    const f = await t.settle();
    t.mockInput.pressEnter();
    await t.settle();
    expect(got).toEqual(['press']);
    t.mockInput.pressKey(' ');
    await t.settle();
    expect(got).toEqual(['press', 'press']);
    const y = f.split('\n').findIndex((l) => l.includes('Forget'));
    await t.mockMouse.click(f.split('\n')[y]!.indexOf('Forget') + 1, y);
    await t.settle();
    expect({ tone, got }).toEqual({ tone, got: ['press', 'press', 'press'] });
    t.renderer.destroy();
  }
});

test('Link: onPress on Enter; an href holding an id shows the mask', async () => {
  const got: string[] = [];
  const t = await drawTest(
    <FocusRoot>
      <Box dir="column">
        <Link href="https://example.com/open" onPress={() => got.push('x')}>Open docs</Link>
        <Link href={`https://${ID}.apps.example.com/`}>{`https://${ID}.apps.example.com/`}</Link>
      </Box>
    </FocusRoot>,
    { width: 60, height: 3 },
  );
  const f = t.captureCharFrame();
  expect(f).toContain('Open docs');
  expect(f).toContain('••••');
  expect(f).not.toContain(ID);
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  await t.settle();
  expect(got).toEqual(['x']);
  t.renderer.destroy();
});

test('ExtLink: shown, empty, not web, secret by shape and by ask', async () => {
  const t = await drawTest(
    <Box dir="column">
      <ExtLink url="https://docs.hoody.com/start" />
      <ExtLink url="" />
      <ExtLink url="ftp://x" />
      <ExtLink url={`https://${ID}.apps.example.com/x`} />
      <ExtLink url="https://example.com/share" secret>Shared</ExtLink>
      <ExtLink url="https://example.com/abcdefghijk" secret>see example.com/abcdefghijk</ExtLink>
    </Box>,
    { width: 60, height: 7 },
  );
  const f = t.captureCharFrame();
  expect(f).toContain('https://docs.hoody.com/start ⇗');
  expect(f).toContain('—');
  expect(f).toContain('ftp://x');
  expect(f).not.toContain(ID);
  expect(f).toContain('https://•••• ⇗');
  expect(f).toContain('Shared ⇗');
  expect(f).not.toContain('abcdefghijk');
  t.renderer.destroy();
});

test('autolink: links, query stays text, id masks the whole text', async () => {
  const t = await drawTest(
    <Box dir="column">
      <Text>{autolink('See https://a.example/docs for more.')}</Text>
      <Text>{autolink('Try https://a.example/x?token=1 now')}</Text>
      <Text>{autolink(`host ${ID} here`)}</Text>
    </Box>,
    { width: 60, height: 4 },
  );
  const f = t.captureCharFrame();
  expect(f).toContain('See https://a.example/docs ⇗ for more.');
  expect(f).toContain('Try https://a.example/x?token=1 now');
  expect(f).toContain('••••');
  expect(f).not.toContain(ID);
  expect(autolink('no links here')).toBe('no links here');
  t.renderer.destroy();
});

test('pure rules', () => {
  expect(webAddress('https://x.org/a')).toBe('https://x.org/a');
  expect(webAddress(' https://x.org')).toBe('');
  expect(webAddress('javascript:alert(1)')).toBe('');
  expect(secretShape(`https://${ID}.x.org`)).toBe(true);
  expect(secretShape(`https://x.org/?r=https%3A%2F%2F${ID}.y.org`)).toBe(true);
  expect(secretShape('https://x.org/a')).toBe(false);
  expect(holdsId(`a${ID.toUpperCase()}b`)).toBe(true);
  expect(holdsId('0123 4567')).toBe(false);
  expect(safeShown(`id ${ID}`)).toBe('••••');
  expect(safeShown('a‮b')).toBe('ab');
  expect(() => resetExtLinkNotes()).not.toThrow();
});
