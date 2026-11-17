// Tab order inside a scroll box that does not follow the focus, as the SHIPPED (minified) bundle runs it. Web behaviours:
// | # | Web behaviour | Test |
// | 1 | Tab never lands on a control the user cannot see inside a scroll area that does not scroll to it (the terminal's rule: clippedAway) | 'a clipped control is skipped, whatever the engine class is called' |
// | 2 | The rule holds in the shipped bundle, where minification renames the engine's classes: the scroll box is known by its class (instanceof), never by its name | 'a clipped control is skipped, whatever the engine class is called' |
// The ship gate (scripts/term/build/ship-gate.ts) runs the real minified bundle and fails on any class-name comparison
// (artifact check) and on a Tab that changes no cell on home, schedules and keys.
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Pressable, Scroll, Text } from '../prim';
import { ScrollBoxClass } from '../prim/engine';

const realName = Object.getOwnPropertyDescriptor(ScrollBoxClass, 'name')!;
afterEach(() => { Object.defineProperty(ScrollBoxClass, 'name', realName); });

for (const minified of [false, true]) {
  test(`a clipped control is skipped, whatever the engine class is called${minified ? ' (renamed, as minified)' : ''}`, async () => {
    // As the minifier does: the class keeps working, its name is something else.
    if (minified) Object.defineProperty(ScrollBoxClass, 'name', { value: 'Qe', configurable: true });
    const log: string[] = [];
    const t = await drawTest(<FocusRoot>
      <Pressable onPress={() => log.push('top')}><Text>[top]</Text></Pressable>
      <Box height={3}>
        <Scroll grow={1}>
          <Text>line 1</Text><Text>line 2</Text><Text>line 3</Text><Text>line 4</Text><Text>line 5</Text>
          <Pressable onPress={() => log.push('unseen')}><Text>[unseen]</Text></Pressable>
        </Scroll>
      </Box>
      {/* Room, so [below] comes after [unseen] in reading order (row 8 vs row 6): only the clip rule skips [unseen]. */}
      <Box height={4} />
      <Pressable onPress={() => log.push('below')}><Text>[below]</Text></Pressable>
    </FocusRoot>, { width: 30, height: 10 });
    await t.settle();
    for (let i = 0; i < 2; i++) { t.mockInput.pressTab(); await t.settle(); t.mockInput.pressEnter(); await t.settle(); }
    expect(log).toEqual(['top', 'below']);
    t.renderer.destroy();
  });
}
