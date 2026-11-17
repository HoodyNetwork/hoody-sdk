// SshKeyHelp.term: the fold opens on the terminal steps for the chosen system, named for the computer; "Make one here"
// is a hand-off (the terminal never makes or holds a private key); the connect line and SSH config follow `host`.
// SshKeyFinish shows the put-in-place steps for the file it was given.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Pressable, Text } from '../../term/prim';
import { routed } from '../layouts/termHarness';
import { SshKeyFinish, SshKeyHelp, guessKeyOs } from './SshKeyHelp';

test('closed by default; opened, linux steps name the computer file; host adds connect + config', async () => {
  const t = await drawTest(
    routed(() => <FocusRoot>
      <SshKeyHelp computer="web1" host="web1.example.test" os="linux" />
    </FocusRoot>).element,
    { width: 110, height: 60 },
  );
  let f = t.captureCharFrame();
  expect(f).toContain('How do I get a key?');
  expect(f).not.toContain('ssh-keygen');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toContain('Make one here');
  expect(f).toContain('saved where this terminal runs');
  expect(f).not.toContain('Make a key');
  expect(f).toMatch(/ssh-keygen -t ed25519 -f ~\/\.ssh\/hoody-web1-\w+/);
  expect(f).toContain('mkdir -p ~/.ssh');
  expect(f).toMatch(/ssh -i ~\/\.ssh\/hoody-web1-\w+ -o IdentitiesOnly=yes web1\.example\.test/);
  expect(f).toContain('Host web1.example.test');
});

test('switching the system to Windows shows PowerShell steps; no host = connect later', async () => {
  // The help sits under a form field that holds the focus, so the hand-off inside the open help does not take it (a
  // block hand-off takes the focus only when nothing has it).
  const t = await drawTest(
    routed(() => <FocusRoot>
      <Pressable autoFocus onPress={() => undefined} sem={{ name: 'Key' }}><Text>Key</Text></Pressable>
      <SshKeyHelp computer="web1" os="linux" defaultExpanded />
    </FocusRoot>).element,
    { width: 110, height: 60 },
  );
  let f = await t.settle();
  expect(f).toContain('cat ~/.ssh/');
  expect(f).toContain('the Connect tab shows the command');
  // From the field, Tab: the fold header, then the system choice; Left twice moves to Windows, Space picks it (the
  // order is Windows, macOS, Linux).
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  t.mockInput.pressArrow('left');
  t.mockInput.pressArrow('left');
  t.mockInput.pressKey(' ');
  f = await t.settle();
  expect(f).toContain('Set-Clipboard');
  expect(f).toContain('Open PowerShell');
});

test('SshKeyFinish: move and connect for the given file', async () => {
  const t = await drawTest(
    routed(() => <FocusRoot>
      <SshKeyFinish file="hoody-web1-ab12" host="web1.example.test" os="mac" />
    </FocusRoot>).element,
    { width: 110, height: 20 },
  );
  const f = await t.settle();
  expect(f).toContain('mv -n ~/Downloads/"hoody-web1-ab12" ~/.ssh/hoody-web1-ab12');
  expect(f).toContain('ssh -i ~/.ssh/hoody-web1-ab12 -o IdentitiesOnly=yes web1.example.test');
});

test('guessKeyOs is the web rule (darwin would read as Windows: the terminal maps its own platform)', () => {
  expect(guessKeyOs('Win32')).toBe('windows');
  expect(guessKeyOs('MacIntel')).toBe('mac');
  expect(guessKeyOs('')).toBe('linux');
});
