// useTerminalSize after a resize nobody listened to (resize race): the size store kept the size of its
// last 'resize' event, so a reader mounted after a resize that came while no reader was subscribed (between a first
// render and its subscribe, or after the last reader left) showed the old width.
import { expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { drawTest } from './testing';
import { FocusRoot, Text } from './index';
import { useTerminalSize } from './size';

function Size() {
  const s = useTerminalSize();
  return createElement(Text, null, `size ${s.width}x${s.height}`);
}

let show: (v: boolean) => void = () => {};
function Host() {
  const [on, set] = useState(true);
  show = set;
  return on ? createElement(Size) : createElement(Text, null, 'none');
}

for (const [from, to] of [[80, 120], [120, 80]] as const) {
  test(`a reader mounted after an unheard resize shows the new size (${from}→${to})`, async () => {
    const t = await drawTest(createElement(FocusRoot, null, createElement(Host)), { width: from, height: 10 });
    expect(await t.settle()).toContain(`size ${from}x10`);
    show(false);
    expect(await t.settle()).toContain('none');
    t.resize(to, 12);
    await t.settle();
    show(true);
    const f = await t.settle();
    t.renderer.destroy();
    expect(f).toContain(`size ${to}x12`);
  });
}
