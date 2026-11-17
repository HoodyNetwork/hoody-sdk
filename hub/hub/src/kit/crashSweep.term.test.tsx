// Crash-class sweep: kit code with no terminal sibling that reads a DOM global at event or
// effect time. The terminal traps every such read (TERM_GLOBAL ends the mount; a swallowed one fails the test at its
// end, TERM_TRAP_UNDECLARED), `typeof navigator` included. Each case mounts or drives the part the way a page does.
import { afterEach, expect, test } from 'bun:test';
import { useEffect, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../term/prim/testing';
import { Box, FocusRoot } from '../term/prim';
import { OverlayHost } from '../term/prim/Overlay';
import { SystemSteps, firstSystem } from './data/Steps';
import { useButtonLabelsWidth } from './controls/buttonMetrics';
import { Button } from './controls/Button';
import { AskAgentButton, AskAgentDrawer, useAskAgent } from './widgets/AskAgent';
import { setAskForFixtures, useAskDock } from './ask';
import { listDevices, onDeviceChange, openMic } from './voice/devices';
import { AnatomySection } from './layouts/anatomy/Section';
import { SectionGroup } from './layouts/anatomy/SectionGroup';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const mount = async (node: ReactNode, width = 80, height = 24): Promise<TestTerm> => {
  t = await drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width, height });
  await t.settle();
  return t;
};
const SYSTEMS = [{ id: 'mac' as const, label: 'Mac', step: 'Open Finder.' }, { id: 'linux' as const, label: 'Linux', step: 'Open a terminal.' }];

test('SystemSteps with no `first` picks a system without asking the browser', async () => {
  expect(firstSystem(SYSTEMS)).toBe('mac');
  const term = await mount(<SystemSteps label="Your device" systems={SYSTEMS} />);
  expect(await term.settle()).toContain('Open Finder.');
});

function Widths() {
  const w = useButtonLabelsWidth([{ label: 'Open' }, { label: 'Start again' }]);
  return <Box dir="column">{w.probe}<Button onPress={() => {}}>{`w=${String(w.width)}`}</Button></Box>;
}
test('useButtonLabelsWidth mounts its probe and settles', async () => {
  const term = await mount(<Widths />);
  expect(await term.settle()).toContain('w=null');
});

function Ask() {
  const ask = useAskAgent({ askKey: 'sweep.k', subject: 'the firewall', source: 'sweep', explain: { run: (send) => send(null) } });
  return <Box dir="column"><AskAgentButton ask={ask} /><AskAgentDrawer ask={ask} /></Box>;
}
test('Ask an agent: opening the drawer reads no DOM global', async () => {
  setAskForFixtures(true);
  const term = await mount(<Ask />, 100, 30);
  term.mockInput.pressTab();
  await term.settle();
  term.mockInput.pressEnter();
  const f = await term.settle();
  expect(f).not.toContain('TERM_GLOBAL');
});

function DockFocus() {
  const dock = useAskDock();
  useEffect(() => { dock.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Box><Button onPress={() => dock.focus()}>focus ask</Button></Box>;
}
test('the Ask dock store: focus() reads no DOM global', async () => {
  setAskForFixtures(true);
  const term = await mount(<DockFocus />);
  term.mockInput.pressTab();
  await term.settle();
  term.mockInput.pressEnter();
  expect(await term.settle()).toContain('focus ask');
});

test('a section group with actions: focus moving through and away reads no DOM global', async () => {
  let n = 0;
  const term = await mount(
    <Box dir="column">
      <SectionGroup firstUse={{ title: 'Nothing here yet', body: 'Start.', action: 'none' }}>
        <AnatomySection id="one" title="Recent" actions={{ primary: { id: 'add', label: 'Add', onPress: () => { n += 1; } } }}>first body</AnatomySection>
        <AnatomySection id="two" title="Other">second body</AnatomySection>
      </SectionGroup>
      <Button onPress={() => {}}>outside</Button>
    </Box>,
  );
  for (let i = 0; i < 4; i++) { term.mockInput.pressTab(); await term.settle(); term.mockInput.pressEnter(); await term.settle(); }
  expect(await term.settle()).toContain('Recent');
  expect(n).toBeGreaterThanOrEqual(1);
});

test('voice devices: a host with no browser answers "unsupported" and empty lists without asking for navigator', async () => {
  expect(await openMic()).toEqual({ refused: 'unsupported' });
  expect(await listDevices()).toEqual({ inputs: [], outputs: [] });
  const off = onDeviceChange(() => {});
  off();
});
