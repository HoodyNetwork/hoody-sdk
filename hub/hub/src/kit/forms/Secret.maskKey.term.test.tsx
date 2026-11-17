// SecretField `maskKey`: a change of the key masks a shown value again (nothing dropped: Show shows it once more), for
// a field holding its value and for a `load` field whose value was read on a press. An unchanged key leaves it shown.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { capture, holdSecret, type HeldSecret } from '@core';
import { installShared } from '../../core/session';
import { SecretField } from './Secret';

const W = { width: 100, height: 16 };
const KEY = 'hk_3f9a_SUPERSECRETVALUE42';

// A signed-out page's shared.js (nothing stored): core captures contexts and holds values in them.
beforeAll(() => {
  const none = () => null;
  const names = ['storedSession', 'holdsIdentity', 'holdsSession', 'sessionTokenUid', 'sessionTokenSid', 'apiCall', 'isFramedPage',
    'framedSensitiveRoute', 'framedRefusedError', 'supersededAuthError', 'isSupersededAuthError', 'realmApiDomain', 'clearAuthTokens',
    'purgeOutgoingSession', 'endOutgoingSession', 'onBeforeAuthPurge', 'authStorageEntry', 'authSessionSuperseded', 'adoptReissuedSession',
    'readAccessToken'];
  installShared(Object.fromEntries(names.map((n) => [n, none])) as unknown as Parameters<typeof installShared>[0]);
});
afterAll(() => installShared(null));

test('a field holding its value: a maskKey change masks it again, and Show shows it once more', async () => {
  let setKey: (k: string) => void = () => {};
  let renders = 0;
  function P() {
    const [k, set] = useState('a');
    const [, again] = useState(0);
    setKey = (next) => { set(next); again((n) => n + 1); };
    renders++;
    return <FocusRoot><SecretField label="Key" value={KEY} once={false} maskKey={k} /></FocusRoot>;
  }
  const t = await drawTest(<P />, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  let f = await t.settle();
  expect(f).toContain('SUPERSECRET');
  // The same key on a new render: still shown.
  const before = renders;
  setKey('a');
  f = await t.settle();
  expect(renders).toBeGreaterThan(before);
  expect(f).toContain('SUPERSECRET');
  setKey('b');
  f = await t.settle();
  expect(f).not.toContain('SUPERSECRET');
  expect(f).toContain('[Show]');
  await t.mockInput.typeText('s');
  f = await t.settle();
  expect(f).toContain('SUPERSECRET');
  t.renderer.destroy();
});

test('a load field: the value read on the press is masked again by a maskKey change, and stays held', async () => {
  let setKey: (k: string) => void = () => {};
  let reads = 0;
  function P() {
    const [k, set] = useState('a');
    const [h, setH] = useState<HeldSecret | null>(null);
    setKey = set;
    return <FocusRoot><SecretField label="Entry" held={h} once={false} maskKey={k} onRead={() => { reads++; setH(holdSecret(KEY, capture())); }} /></FocusRoot>;
  }
  const t = await drawTest(<P />, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  let f = await t.settle();
  expect(reads).toBe(1);
  expect(f).toContain('SUPERSECRET');
  setKey('b');
  f = await t.settle();
  expect(f).not.toContain('SUPERSECRET');
  // Masked, not dropped: Show shows the held value without a second read.
  await t.mockInput.typeText('s');
  f = await t.settle();
  expect(f).toContain('SUPERSECRET');
  expect(reads).toBe(1);
  t.renderer.destroy();
});
