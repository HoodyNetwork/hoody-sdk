// Vitest: the person's own metadata and the palette's New command. The inspector shows
// metadata values; New may set metadata; Replace keeps it unless "Change metadata" is ticked, which edits or clears
// it. The Hub's own keys (encrypted, write_id) are never the person's to set and are always written by the Hub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { showToast } from '@kit';
import page from './page';
import strings from './strings.en.json';
import { requestLog, resetFixtureVaults } from './fixtures';
import { metadataText, parseMetadata, writeMetadata } from './logic';
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
  vi.mocked(showToast).mockClear();
});

type PutBody = { value: string; metadata: Record<string, unknown> };
const puts = () => requestLog.filter((r) => r.method === 'PUT');
const lastPut = () => puts().at(-1)!.body as PutBody;
const fill = (text: string) => text.replace(/[{[]/g, (c) => c + c); // userEvent.type treats { and [ as keys
// Metadata sits in the closed "Advanced" fold (OP-C); role queries see only what the fold shows.
const advanced = () => screen.getByRole('button', { name: new RegExp(strings['edit.advanced']) });
const metaBox = () => screen.getByRole('textbox', { name: strings['edit.meta'] }) as HTMLTextAreaElement;

describe('metadata in the inspector', () => {
  it('shows each of the person’s metadata values, not just the names', async () => {
    await renderPage(page, { path: '/vault?sel=deploy.notes' });
    expect(await screen.findByText(strings['detail.metadata'])).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.getByText('ops')).toBeInTheDocument();
  });

  it('never lists the Hub’s own keys as the person’s metadata', async () => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await screen.findByText(strings['detail.facts']);
    expect(screen.queryByText(strings['detail.metadata'])).toBeNull();
    expect(screen.queryByText('encrypted')).toBeNull();
  });
});

describe('metadata in New', () => {
  it('sends the typed object beside the Hub’s write id', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'api-key');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-new-value');
    await userEvent.click(advanced());
    await userEvent.type(metaBox(), fill('{"source": "ci", "n": 2}'));
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    const body = lastPut();
    expect(body.metadata.source).toBe('ci');
    expect(body.metadata.n).toBe(2);
    expect(typeof body.metadata.write_id).toBe('string');
  });

  it('refuses metadata that is not a JSON object, or that names a Hub key, and sends nothing', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'api-key');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-new-value');
    await userEvent.click(advanced());
    const field = metaBox();
    await userEvent.type(field, 'not json');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    expect(await screen.findByText(strings['meta.json'])).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, fill('[1]'));
    expect(await screen.findByText(strings['meta.object'])).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, fill('{"write_id": "mine"}'));
    expect(await screen.findByText(strings['meta.reserved'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    expect(puts()).toHaveLength(0);
  });
});

describe('metadata in Replace', () => {
  it('keeps the entry’s metadata when "Change metadata" is left off', async () => {
    await renderPage(page, { path: '/vault?sel=deploy.notes&edit=replace:deploy.notes' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'new-notes');
    expect(screen.queryByLabelText(strings['edit.meta'])).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(lastPut().metadata.owner).toBe('ops');
  });

  it('opens the current metadata as JSON to edit, and sends the edit', async () => {
    await renderPage(page, { path: '/vault?sel=deploy.notes&edit=replace:deploy.notes' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'new-notes');
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(strings['edit.changeMeta']) }));
    const field = metaBox();
    expect(JSON.parse(field.value)).toEqual({ owner: 'ops' });
    await userEvent.clear(field);
    await userEvent.type(field, fill('{"owner": "sre"}'));
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    const body = lastPut();
    expect(body.metadata.owner).toBe('sre');
    expect(typeof body.metadata.write_id).toBe('string');
  });

  it('clears the person’s metadata when the field is emptied, keeping the Hub’s keys', async () => {
    await renderPage(page, { path: '/vault?sel=deploy.notes&edit=replace:deploy.notes' });
    await userEvent.type(await screen.findByLabelText(strings['edit.value']), 'new-notes');
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(strings['edit.changeMeta']) }));
    await userEvent.clear(metaBox());
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(Object.keys(lastPut().metadata)).toEqual(['write_id']);
  });
});

describe('metadata logic', () => {
  it('parses empty text as none and keeps the Hub keys out', () => {
    expect(parseMetadata('  ')).toEqual({ ok: true, value: null });
    expect(parseMetadata('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseMetadata('null')).toEqual({ ok: false, why: 'object' });
    expect(parseMetadata('{"encrypted":false}')).toEqual({ ok: false, why: 'reserved' });
    expect(metadataText({ encrypted: true, write_id: 'w', a: 'b' })).toBe('{\n  "a": "b"\n}');
    expect(metadataText({ encrypted: true })).toBe('');
  });

  it('writes the form’s metadata over the prior one, and the prior one when the form set none', () => {
    expect(writeMetadata({ a: 1, write_id: 'old' }, 'w', 'v')).toEqual({ a: 1, write_id: 'w' });
    expect(writeMetadata({ a: 1 }, 'w', 'v', { b: 2 })).toEqual({ b: 2, write_id: 'w' });
    expect(writeMetadata({ a: 1 }, 'w', 'v', null)).toEqual({ write_id: 'w' });
  });
});

describe('the palette', () => {
  it('"New entry" opens the New form, not just the list', () => {
    const cmd = page.commands?.find((c) => c.id === 'new');
    expect(cmd?.to).toBe('/vault?edit=new');
  });
});

describe('OP-C: metadata under a closed "Advanced" fold', () => {
  it('New: closed by default, the metadata field not shown; opening it shows the field', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await screen.findByLabelText(strings['edit.name']);
    expect(advanced().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox', { name: strings['edit.meta'] })).toBeNull();
    await userEvent.click(advanced());
    expect(advanced().getAttribute('aria-expanded')).toBe('true');
    expect(metaBox()).toBeVisible();
  });

  it('Replace: open by default for an entry that has metadata, closed for one that has none', async () => {
    await renderPage(page, { path: '/vault?sel=deploy.notes&edit=replace:deploy.notes' });
    await screen.findByLabelText(strings['edit.value']);
    await waitFor(() => expect(advanced().getAttribute('aria-expanded')).toBe('true'));
    expect(screen.getByRole('checkbox', { name: new RegExp(strings['edit.changeMeta']) })).toBeVisible();
    cleanup();
    await renderPage(page, { path: '/vault?sel=db-password&edit=replace:db-password' });
    await screen.findByLabelText(strings['edit.value']);
    // the list is read (the hidden box is enabled), and still the fold stays closed
    await waitFor(() => expect(screen.getByLabelText(new RegExp(strings['edit.changeMeta']))).not.toBeDisabled());
    expect(advanced().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('checkbox', { name: new RegExp(strings['edit.changeMeta']) })).toBeNull();
  });

  it('a save blocked by the metadata opens the fold with the error; nothing is sent', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'api-key');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-new-value');
    await userEvent.click(advanced());
    await userEvent.type(metaBox(), 'not json');
    await userEvent.click(advanced());
    expect(screen.queryByRole('textbox', { name: strings['edit.meta'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    expect(await screen.findByText(strings['meta.json'])).toBeVisible();
    expect(advanced().getAttribute('aria-expanded')).toBe('true');
    expect(puts()).toHaveLength(0);
  });
});
