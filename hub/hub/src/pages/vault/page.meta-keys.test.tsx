// Vitest: metadata edge cases of the vault page. Any JSON key survives (`__proto__`
// too); metadata unknown while the list loads is never offered as none; metadata too deep to indent is shown
// compact, and when it cannot be written out at all it is not editable and is kept; Replace with the box off sends
// the metadata of the fresh list read just before the PUT; the lock marker follows the value in every path; the
// size limit refuses before sending; the inspector shows values of every shape; a held PUT with metadata is proved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { showToast } from '@kit';
import page from './page';
import strings from './strings.en.json';
import { fixtureEntry, REALM_A, requestLog, resetFixtureVaults } from './fixtures';
import { metadataText, metadataValueText, userMetadata, writeMetadata, METADATA_MAX_BYTES } from './logic';
import { resetChanges } from '@core/changes';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(showToast).mockClear();
});

type PutBody = { value: string; metadata: Record<string, unknown> };
const puts = () => requestLog.filter((r) => r.method === 'PUT');
const lastPut = () => puts().at(-1)!.body as PutBody;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const changeBox = () => screen.getByRole('checkbox', { name: new RegExp(strings['edit.changeMeta']) });
const metaField = () => screen.getByLabelText(strings['edit.meta']) as HTMLTextAreaElement;
const setMeta = (text: string) => fireEvent.change(metaField(), { target: { value: text } });
/** An array nested `n` deep (the 'leaf' at the bottom), as the metaRich deep.meta tree. */
const deep = (n: number): unknown => {
  let v: unknown = 'leaf';
  for (let i = 0; i < n; i++) v = [v];
  return v;
};
/** Arrays nested more than 250 deep at the value or one level under it (the metaRich deep.meta tree). */
const carriesTree = (v: unknown): boolean => {
  const depth = (x: unknown): number => {
    let d = 0;
    while (Array.isArray(x)) {
      d++;
      x = x[0];
    }
    return d;
  };
  return depth(v) > 250 || (!!v && typeof v === 'object' && Object.values(v as object).some((c) => depth(c) > 250));
};
/** This browser's JSON writer refusing the deep tree, as a too-deep value would: in every caller alike. */
const refuseDeepTree = () => {
  const real = JSON.stringify.bind(JSON);
  vi.spyOn(JSON, 'stringify').mockImplementation(((v: unknown, ...rest: unknown[]) => {
    if (carriesTree(v)) throw new RangeError('Maximum call stack size exceeded');
    return real(v, ...(rest as [never]));
  }) as typeof JSON.stringify);
};
const save = () => userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));

describe('any JSON key survives, __proto__ included', () => {
  it('logic keeps it as an own key, through the writer too', () => {
    const m = JSON.parse('{"__proto__":{"a":1},"b":2,"write_id":"old","encrypted":true}') as Record<string, unknown>;
    const u = userMetadata(m);
    expect(own(u, '__proto__')).toBe(true);
    expect(Object.keys(u).sort()).toEqual(['__proto__', 'b']);
    const w = writeMetadata(null, 'w1', 'plain', u)!;
    expect(own(w, '__proto__')).toBe(true);
    expect(JSON.parse(JSON.stringify(w))).toEqual(JSON.parse('{"__proto__":{"a":1},"b":2,"write_id":"w1"}'));
  });

  it('the inspector lists it and Replace opens it in the field', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=proto.meta' });
    const section = (await screen.findByText(strings['detail.metadata'])).closest('section')!;
    expect(within(section).getByText('__proto__')).toBeInTheDocument();
    expect(within(section).getByText('label')).toBeInTheDocument();
  });

  it('New sends it as an own key', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'proto-new');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-v');
    setMeta('{"__proto__":{"owner":"ops"},"label":"x"}');
    await save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    const meta = lastPut().metadata;
    expect(own(meta, '__proto__')).toBe(true);
    expect(meta.label).toBe('x');
  });

  it('Replace keeps it when the field is opened and saved unchanged', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=proto.meta&edit=replace:proto.meta' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'fixture-v2');
    await waitFor(() => expect(changeBox()).not.toBeDisabled());
    await userEvent.click(changeBox());
    expect(metaField().value).toContain('"__proto__"');
    await save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(own(lastPut().metadata, '__proto__')).toBe(true);
  });
});

describe('metadata unknown while the list loads', () => {
  it('is not offered as none: the box waits, then opens the stored metadata', async () => {
    await renderPage(page, { state: 'slowList', path: '/vault?edit=replace:deploy.notes' });
    await screen.findByLabelText(strings['edit.value']);
    // Unknown metadata leaves the Advanced fold closed; the person opens it to find the box waiting.
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['edit.advanced']) }));
    expect(changeBox()).toBeDisabled();
    expect(screen.getByText(strings['edit.metaLoading'])).toBeInTheDocument();
    await waitFor(() => expect(changeBox()).not.toBeDisabled(), { timeout: 5000 });
    await userEvent.click(changeBox());
    expect(JSON.parse(metaField().value)).toEqual({ owner: 'ops' });
  });
});

describe('deep metadata', () => {
  it('nesting too deep to indent opens compact, and saves unchanged', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=deep.meta&edit=replace:deep.meta' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'fixture-v2');
    await waitFor(() => expect(changeBox()).not.toBeDisabled());
    await userEvent.click(changeBox());
    expect(metaField().value).not.toContain('\n');
    await save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(JSON.stringify(lastPut().metadata.tree)).toBe(`${'['.repeat(300)}"leaf"${']'.repeat(300)}`);
  });

  it('metadata that cannot be written out: the inspector says so, Save with the box off is refused, ticking replaces it', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=deep.meta&edit=replace:deep.meta' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'fixture-v2');
    await waitFor(() => expect(changeBox()).not.toBeDisabled());
    // From here on (the list is read) the writer refuses the tree: the PUT's metadata cannot be written out.
    refuseDeepTree();
    expect(metadataText({ tree: deep(300) })).toBeNull();
    await save();
    expect(await screen.findByText(strings['notSent.unwritable'])).toBeInTheDocument();
    expect(puts()).toHaveLength(0);
    await userEvent.click(changeBox());
    setMeta('{"owner":"new"}');
    await save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(lastPut().metadata).toEqual({ owner: 'new', write_id: expect.any(String) });
  });

  // The refusal names the step that fixes it in the form as it is. Only Replace with the box off
  // keeps the entry's metadata, so only that refusal says to tick the box; typed metadata says to simplify it.
  it('typed metadata that cannot be written out (New): the refusal asks to simplify or clear it, never to tick a box', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'deep-new');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-new-value');
    setMeta(JSON.stringify({ tree: deep(300) }));
    refuseDeepTree();
    await save();
    expect(await screen.findByText(strings['notSent.unwritableOwn'])).toBeInTheDocument();
    expect(screen.queryByText(strings['notSent.unwritable'])).toBeNull();
    expect(strings['notSent.unwritableOwn']).not.toMatch(new RegExp(strings['edit.changeMeta']));
    expect(puts()).toHaveLength(0);
  });

  it('typed metadata that cannot be written out (Replace, box ticked): the same simplify-or-clear refusal', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=plain.meta&edit=replace:plain.meta' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'fixture-v2');
    await waitFor(() => expect(changeBox()).not.toBeDisabled());
    await userEvent.click(changeBox());
    setMeta(JSON.stringify({ tree: deep(300) }));
    refuseDeepTree();
    await save();
    expect(await screen.findByText(strings['notSent.unwritableOwn'])).toBeInTheDocument();
    expect(screen.queryByText(strings['notSent.unwritable'])).toBeNull();
    expect(puts()).toHaveLength(0);
  });

  it('metadata that cannot be written out opens as an empty field that says it replaces, and the inspector says so', async () => {
    refuseDeepTree();
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=deep.meta&edit=replace:deep.meta' });
    await screen.findByLabelText(strings['edit.value']);
    expect(await screen.findByText(strings['edit.metaTooDeep'])).toBeInTheDocument();
    expect(screen.getByText(strings['fact.metaTooDeep'])).toBeInTheDocument();
    await userEvent.click(changeBox());
    expect(metaField().value).toBe('');
    expect(screen.getByText(strings['edit.metaUnshownDesc'].replaceAll('\n', ' '))).toBeInTheDocument();
  });

  it('a value that cannot be written out reads as null, never throws', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(metadataValueText(loop)).toBeNull();
    expect(metadataText({ loop })).toBeNull();
    expect(writeMetadata(null, 'w', 'v', { loop })).toBeNull();
  });
});

describe('Replace with the box off sends the fresh metadata', () => {
  it('a change made elsewhere after the drawer opened is what is kept', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=plain.meta&edit=replace:plain.meta' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'fixture-v2');
    fixtureEntry('metaRich', REALM_A, 'plain.meta', { owner: 'sre', moved: true });
    await save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(lastPut().metadata).toMatchObject({ owner: 'sre', moved: true });
  });
});

describe('the lock marker follows the value', () => {
  const encrypt = async () => {
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(strings['edit.encrypt']) }));
    await userEvent.type(screen.getByLabelText(strings['edit.password']), 'pw-1');
    await userEvent.type(screen.getByLabelText(strings['edit.repeat']), 'pw-1');
  };

  it('a plain value over an envelope drops the marker, keeping the person’s keys', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=enc.meta&edit=replace:enc.meta' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'now-plain');
    await save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    const m = lastPut().metadata;
    expect(m.owner).toBe('ops');
    expect(own(m, 'encrypted')).toBe(false);
  });

  it('an encrypted value with changed metadata carries the marker and the edit', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=plain.meta&edit=replace:plain.meta' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'now-sealed');
    await encrypt();
    await waitFor(() => expect(changeBox()).not.toBeDisabled());
    await userEvent.click(changeBox());
    setMeta('{"owner":"sre"}');
    await save();
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 10_000 });
    expect(lastPut().metadata).toMatchObject({ owner: 'sre', encrypted: true });
  }, 20_000);

  it('an encrypted value with cleared metadata keeps only the Hub’s keys', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=enc.meta&edit=replace:enc.meta' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'still-sealed');
    await encrypt();
    await waitFor(() => expect(changeBox()).not.toBeDisabled());
    await userEvent.click(changeBox());
    setMeta('');
    await save();
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 10_000 });
    expect(Object.keys(lastPut().metadata).sort()).toEqual(['encrypted', 'write_id']);
  }, 20_000);
});

describe('the size limit', () => {
  it('metadata past the API limit (with the Hub’s keys) is refused before sending', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'too-big');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-v');
    // Under the limit by itself, over it once the Hub adds its write id.
    setMeta(JSON.stringify({ big: 'z'.repeat(METADATA_MAX_BYTES - 12) }));
    await save();
    expect(await screen.findByText(strings['notSent.metadata'])).toBeInTheDocument();
    expect(puts()).toHaveLength(0);
  });
});

describe('the inspector', () => {
  it('shows values of every shape: cut past 500 characters, nested as JSON, and a count', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=many.meta' });
    const section = (await screen.findByText(strings['detail.metadata'])).closest('section')!;
    expect(within(section).getByText(`${'x'.repeat(500)}…`)).toBeInTheDocument();
    expect(within(section).getByText('y'.repeat(500))).toBeInTheDocument();
    expect(within(section).getByText('{"a":{"b":[1,2]}}')).toBeInTheDocument();
    expect(within(section).getByText('5')).toBeInTheDocument();
    expect(within(section).getByText('true')).toBeInTheDocument();
    expect(within(section).getByText('v29')).toBeInTheDocument();
    expect(screen.getByText(strings['fact.metaCount_other'].replace('{{count}}', '35'))).toBeInTheDocument();
  });
});

describe('a held save with metadata', () => {
  it('is proved by Check again and never sent twice', async () => {
    await renderPage(page, { state: 'appliedLost', path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'held-meta');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-v');
    setMeta('{"owner":"ops"}');
    await save();
    await screen.findByText('Saving held-meta in Personal may have gone through');
    // Held: the form offers Check again instead of Save, so nothing can send it twice.
    expect(screen.queryByRole('button', { name: strings['edit.save'] })).toBeNull();
    expect(puts()).toHaveLength(1);
    expect(lastPut().metadata.owner).toBe('ops');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(screen.queryByText('Saving held-meta in Personal may have gone through')).toBeNull());
    expect(puts()).toHaveLength(1);
  });
});

describe('the Advanced fold and a press blocked by the metadata', () => {
  const advanced = () => screen.getByRole('button', { name: new RegExp(strings['edit.advanced']) });
  const shownMeta = () => screen.queryByRole('textbox', { name: strings['edit.meta'] });

  it('too large (New, typed then folded away): the refusal opens the fold with the field', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'too-big');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-v');
    await userEvent.click(advanced());
    setMeta(JSON.stringify({ big: 'z'.repeat(METADATA_MAX_BYTES - 12) }));
    await userEvent.click(advanced());
    expect(shownMeta()).toBeNull();
    await save();
    expect(await screen.findByText(strings['notSent.metadata'])).toBeInTheDocument();
    expect(advanced().getAttribute('aria-expanded')).toBe('true');
    expect(shownMeta()).toBeVisible();
    expect(puts()).toHaveLength(0);
  });

  it('kept metadata too deep to send (Replace, box off, fold closed): the refusal opens the fold with the box', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=deep.meta&edit=replace:deep.meta' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'fixture-v2');
    await waitFor(() => expect(changeBox()).not.toBeDisabled());
    await userEvent.click(advanced());
    expect(advanced().getAttribute('aria-expanded')).toBe('false');
    refuseDeepTree();
    await save();
    expect(await screen.findByText(strings['notSent.unwritable'])).toBeInTheDocument();
    expect(advanced().getAttribute('aria-expanded')).toBe('true');
    expect(changeBox()).toBeVisible();
    expect(puts()).toHaveLength(0);
  });

  it('closed with Change metadata on, the fold says the save replaces the metadata, or removes it when the field is empty', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=plain.meta&edit=replace:plain.meta' });
    await screen.findByLabelText(strings['edit.value']);
    await waitFor(() => expect(changeBox()).not.toBeDisabled());
    expect(within(advanced()).getByText(strings['edit.advancedDesc'])).toBeInTheDocument();
    await userEvent.click(changeBox());
    await userEvent.click(advanced());
    expect(within(advanced()).getByText(strings['edit.advancedReplaces'])).toBeInTheDocument();
    setMeta('');
    expect(within(advanced()).getByText(strings['edit.advancedRemoves'])).toBeInTheDocument();
  });

  // Metadata stays plain text whatever the value is: said on the field where it is typed, so it is seen also while
  // the fold's line talks about replacing or removing it.
  const notEncrypted = /not encrypted/i;
  it('a new entry: the metadata field says it is not encrypted', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['edit.advanced']) }));
    expect(metaField()).toHaveAccessibleDescription(notEncrypted);
  });
  it('Change metadata on: the fold line says what saving does, and the field still says it is not encrypted', async () => {
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=plain.meta&edit=replace:plain.meta' });
    await screen.findByLabelText(strings['edit.value']);
    await waitFor(() => expect(changeBox()).not.toBeDisabled());
    await userEvent.click(changeBox());
    await userEvent.click(advanced());
    expect(within(advanced()).getByText(strings['edit.advancedReplaces'])).toBeInTheDocument();
    expect(metaField()).toHaveAccessibleDescription(notEncrypted);
  });
  it('metadata that cannot be shown: the empty replacing field says it is not encrypted', async () => {
    refuseDeepTree();
    await renderPage(page, { state: 'metaRich', path: '/vault?sel=deep.meta&edit=replace:deep.meta' });
    await screen.findByText(strings['edit.metaTooDeep']);
    await userEvent.click(changeBox());
    expect(metaField()).toHaveAccessibleDescription(notEncrypted);
  });
});
