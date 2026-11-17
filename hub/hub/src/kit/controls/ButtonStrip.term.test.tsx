// ButtonStrip.term: the web component's observable behaviours, each held here.
// - the strip's buttons sit in one row with one shared line (│) between neighbours; nothing given draws no separator
// - each button keeps its own Tab stop and press
// - useInButtonStrip is true inside the strip and false outside it and under StripScopeReset (an overlay's own surface)
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { ButtonStrip, StripScopeReset, useInButtonStrip } from './ButtonStrip';
import { Button } from './Button';

function Probe({ name }: { name: string }) {
  return <Text>{`${name}=${useInButtonStrip()}`}</Text>;
}

test('one row, │ between neighbours, own Tab stops and presses', async () => {
  const got: string[] = [];
  const t = await drawTest(
    <FocusRoot>
      <ButtonStrip label="Actions">
        <Button onPress={() => got.push('a')}>Refresh</Button>
        {null}
        {false}
        <Button onPress={() => got.push('b')}>Export</Button>
      </ButtonStrip>
    </FocusRoot>,
    { width: 50, height: 3 },
  );
  expect(t.captureCharFrame()).toContain('[Refresh] │ [Export]');
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  await t.settle();
  expect(got).toEqual(['b']);
  t.renderer.destroy();
});

test('useInButtonStrip: inside, outside, reset', async () => {
  const t = await drawTest(
    <FocusRoot>
      <Probe name="out" />
      <ButtonStrip label="S">
        <Probe name="in" />
        <StripScopeReset><Probe name="reset" /></StripScopeReset>
      </ButtonStrip>
    </FocusRoot>,
    { width: 60, height: 4 },
  );
  const f = t.captureCharFrame();
  expect(f).toContain('out=false');
  expect(f).toContain('in=true');
  expect(f).toContain('reset=false');
  t.renderer.destroy();
});
