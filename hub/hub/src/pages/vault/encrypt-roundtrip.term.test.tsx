// Vault "Encrypt with a password" in the terminal. The secure-context rule is the browser's (isSecureContext); the
// terminal host answers it itself (HostEnv.secureContext true: a local process with no page origin), so canEncrypt()
// asks only that WebCrypto and getRandomValues work there and the terminal encrypts as the web page does:
// - the host says secure context and canEncrypt() is true;
// - New entry, equal passwords: one PUT whose value is an envelope that opens with the typed password (and not with
//   another one); the plain value and the password are never sent, and never drawn or in the tree, neither while
//   they sit in their fields nor after Save (each of the three is a secret field: no value in the tree, only filled);
// - Replace from an entry's Encrypt…: the drawer opens with the box ticked and the same round trip holds.
// The form is filled as the shots fill it (focus, a frame, then the keys) and Save is clicked. Values and passwords
// here are fixture text.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import { makeT } from '@kit';
import { hostEnv } from '@core';
import { canEncrypt, decrypt, isValidEnvelope, VaultCryptoError } from './crypto';
import { requestLog } from './fixtures';
import vaultStrings from './strings.en.json';

const t = makeT(vaultStrings);
const NAME = 'ci-token';
const VALUE = 'fixture-value-ci';
/** A plain entry of the default fixture state (fixtures.ts), shown with its Encrypt… row. */
const PLAIN = 'deploy.notes';
const NEW_VALUE = 'fixture-value-sealed';
const PW_A = 'fixture-pass-aaaa';
const PW_B = 'fixture-pass-bbbb';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
const nodes = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  const out: SemNode[] = [];
  const walk = (ns: readonly SemNode[]): void => { for (const n of ns) { out.push(n); walk(n.children); } };
  walk(semanticsOf({ root: r.root, stdin: r.stdin }));
  return out;
};
const treeText = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semText(semanticsOf({ root: r.root, stdin: r.stdin }));
};
const under = (n: SemNode): SemNode[] => [n, ...n.children.flatMap(under)];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const says = (p: PageSession, frame: string, text: string): boolean =>
  norm(frame).includes(norm(text)) || nodes(p).some((n) => norm(n.name).includes(norm(text)) || norm(n.description ?? '').includes(norm(text)));
const dialogNamed = (p: PageSession, title: string): SemNode | undefined =>
  nodes(p).find((n) => (n.role === 'dialog' || n.role === 'alertdialog') && norm(n.name).includes(norm(title)));
const drawerOf = (p: PageSession, title: string): SemNode => {
  const d = dialogNamed(p, title);
  if (!d) throw new Error(`no drawer ${title}`);
  return d;
};
function press(n: SemNode): void {
  if (n.actions.includes('press')) act(n, 'press');
  else act(n, 'click', undefined, { force: true });
}
async function pressNamed(p: PageSession, roles: readonly string[], name: string): Promise<string> {
  const n = nodes(p).find((x) => roles.includes(x.role) && norm(x.name) === norm(name) && !x.states.disabled);
  if (!n) throw new Error(`no ${roles.join('/')} named ${name}`);
  press(n);
  return p.settle();
}
/** A text field of the drawer by its label (secret ones too); the tree read fresh, so the node is the live one. */
const field = (p: PageSession, title: string, label: string): SemNode => {
  const n = under(drawerOf(p, title)).find((x) => x.role === 'textbox' && norm(x.name) === norm(label));
  if (!n) throw new Error(`no field ${label}`);
  return n;
};
/** Moves the focus to a field as a person does and lands on a frame, then the keys follow. (Focus and keys in the
 *  same tick send the keys to the field focused before.) Returns the frame after the keys. */
async function typeKeys(p: PageSession, title: string, label: string, text: string): Promise<string> {
  act(field(p, title, label), 'type', '');
  await p.settle();
  for (let i = 0; i < 20 && !field(p, title, label).states.focused; i++) await p.settle();
  await p.keys.type(text);
  return p.settle();
}
/** A plain field (the name): the tree then holds exactly what was typed. */
async function typeInto(p: PageSession, title: string, label: string, text: string): Promise<void> {
  await typeKeys(p, title, label, text);
  expect(field(p, title, label).value).toBe(text);
}
/** A secret field (the value, both passwords): the tree says only that it is filled, never a value, and the typed
 *  text is neither drawn nor in the tree while it sits there. */
async function typeSecret(p: PageSession, title: string, label: string, text: string): Promise<void> {
  const frame = await typeKeys(p, title, label, text);
  const n = field(p, title, label);
  expect(n.states.secret).toBe(true);
  expect(n.value).toBeUndefined();
  expect(n.filled).toBe(true);
  expect(norm(frame).includes(text)).toBe(false);
  expect(treeText(p).includes(text)).toBe(false);
}
/** Nothing typed into a secret field is drawn or in the tree (the drawer still filled, before Save). */
async function expectHidden(p: PageSession, secrets: readonly string[]): Promise<void> {
  const frame = await p.settle();
  for (const secret of secrets) {
    expect(norm(frame).includes(secret)).toBe(false);
    expect(treeText(p).includes(secret)).toBe(false);
  }
}
/** A mouse click in the middle of the node, as the shot replay clicks: it lands where it is drawn, whichever field
 *  holds the keyboard. */
async function clickNamed(p: PageSession, name: string, within: SemNode): Promise<string> {
  const n = under(within).find((x) => x.role === 'button' && norm(x.name) === norm(name) && !x.states.disabled);
  if (!n) throw new Error(`no button named ${name}`);
  await p.click(n.box[0] + Math.max(0, Math.floor((n.box[2] - 1) / 2)), n.box[1] + Math.max(0, Math.floor((n.box[3] - 1) / 2)));
  return p.settle();
}
const encryptBox = (p: PageSession, title: string): SemNode | undefined =>
  under(drawerOf(p, title)).find((n) => n.role === 'checkbox' && norm(n.name).startsWith(t('edit.encrypt')));
const putsLogged = () => requestLog.filter((r) => r.method === 'PUT');

/** Saves the open drawer and waits for its one PUT (encrypting runs in WebCrypto before it); returns the last frame. */
async function saveAndWait(p: PageSession, title: string): Promise<string> {
  await clickNamed(p, t('edit.save'), drawerOf(p, title));
  for (let i = 0; i < 300 && putsLogged().length === 0; i++) { await sleep(100); await p.settle(); }
  return p.settle();
}

/** The one PUT's value: an envelope, never the plain value, that opens with the password and with no other. */
async function expectSealed(path: string, plain: string): Promise<void> {
  const puts = putsLogged();
  expect(puts.length).toBe(1);
  const put = puts[0]!;
  expect(put.path.endsWith(`/${path}`)).toBe(true);
  const body = put.body as { value?: unknown; metadata?: { encrypted?: unknown } } | undefined;
  expect(typeof body?.value).toBe('string');
  const sealed = body!.value as string;
  expect(sealed === plain).toBe(false);
  expect(isValidEnvelope(sealed)).toBe(true);
  expect(body?.metadata?.encrypted).toBe(true);
  expect((await decrypt(sealed, PW_A)) === plain).toBe(true);
  const wrong = await decrypt(sealed, PW_B).then(() => null, (e: unknown) => e);
  expect(wrong instanceof VaultCryptoError ? wrong.kind : 'opened').toBe('decrypt-failed');
  const sent = JSON.stringify(requestLog);
  expect(sent.includes(plain)).toBe(false);
  expect(sent.includes(PW_A)).toBe(false);
}

test('the terminal host is a secure context, so canEncrypt() is true', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 40, path: '/vault' });
  await s.settle();
  expect(hostEnv().secureContext).toBe(true);
  expect(canEncrypt()).toBe(true);
  expect(s.failures).toEqual([]);
}, 240_000);

test('New entry, equal passwords: one PUT carrying an envelope that opens with the password; never the plain value or the password', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 40, path: '/vault' });
  await s.settle();
  await pressNamed(s, ['button'], t('action.new'));
  const title = t('edit.newTitle');
  drawerOf(s, title);
  await typeInto(s, title, t('edit.name'), NAME);
  await typeSecret(s, title, t('edit.value'), VALUE);
  // The box is offered (canEncrypt() is true here) and ticks.
  const box = encryptBox(s, title);
  expect(box).toBeDefined();
  press(box!);
  await s.settle();
  expect(encryptBox(s, title)?.states.checked).toBe(true);
  await typeSecret(s, title, t('edit.password'), PW_A);
  await typeSecret(s, title, t('edit.repeat'), PW_A);
  await expectHidden(s, [VALUE, PW_A]);
  const frame = await saveAndWait(s, title);
  // The browser-worded refusal never shows: the encrypt ran.
  expect(says(s, frame, t('crypto.unavailable'))).toBe(false);
  await expectSealed(NAME, VALUE);
  for (const secret of [VALUE, PW_A]) {
    expect(norm(frame).includes(secret)).toBe(false);
    expect(treeText(s).includes(secret)).toBe(false);
  }
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);

test('Replace from an entry\'s Encrypt…: the box starts ticked, and the PUT is an envelope that opens with the password', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 40, path: `/vault?sel=${PLAIN}` });
  await s.settle();
  await pressNamed(s, ['button'], t('action.encrypt'));
  const title = t('edit.replaceTitle');
  drawerOf(s, title);
  expect(encryptBox(s, title)?.states.checked).toBe(true);
  expect(says(s, await s.settle(), t('crypto.unavailable'))).toBe(false);
  await typeSecret(s, title, t('edit.value'), NEW_VALUE);
  await typeSecret(s, title, t('edit.password'), PW_A);
  await typeSecret(s, title, t('edit.repeat'), PW_A);
  await expectHidden(s, [NEW_VALUE, PW_A]);
  const frame = await saveAndWait(s, title);
  expect(says(s, frame, t('crypto.unavailable'))).toBe(false);
  await expectSealed(PLAIN, NEW_VALUE);
  for (const secret of [NEW_VALUE, PW_A]) {
    expect(norm(frame).includes(secret)).toBe(false);
    expect(treeText(s).includes(secret)).toBe(false);
  }
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
