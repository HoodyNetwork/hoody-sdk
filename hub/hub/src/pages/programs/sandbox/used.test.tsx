// A preset's Use says it did something where the person tapped (at 390 px too): the fields it
// changes sit below the fold on a phone, so a silent Use reads as a press that did nothing.
import { beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore, queryClient } from '@core';
import { resetChanges } from '@core/changes';
import { render, screen, userEvent, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from '../logic';
import { sandboxRulesFor, type SandboxWorld } from './fixtures';
import { statusSamples } from './samples';
import { SandboxPanel, resetSandboxNotesForTests } from './SandboxPanel';
import strings from './strings.en.json';

const t = makeT(strings);
const rowOf = (): ProgramRow => ({ key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null, up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can: {} as ProgramRow['can'] });
const panel = (w: SandboxWorld) => {
  bootFixtureCore({ rules: sandboxRulesFor(w) });
  queryClient.clear();
  return render(
    <QueryClientProvider client={queryClient}>
      <SandboxPanel row={rowOf()} />
    </QueryClientProvider>,
  );
};
const use = (d: HTMLElement, preset: 'limits' | 'readOnly') =>
  userEvent.click(within(d).getByRole('button', { name: t('sb.ed.applyPreset', { preset: t(`sb.ed.preset.${preset}`) }) }));
const presetOf = (el: HTMLElement) => el.closest('[data-sb-preset]')?.getAttribute('data-sb-preset');

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
});

describe('a preset’s Use answers where it was pressed', () => {
  it('says the preset was used, beside that preset, announced, and only for the last one used', async () => {
    panel({ status: { '7': statusSamples.none }, sent: [] });
    await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByText(t('sb.ed.used'))).toBeNull();
    // The live region is there, empty, before the Use (ARIA22): the message goes into that same element.
    const region = within(d).getAllByRole('status').find((el) => presetOf(el) === 'limits');
    expect(region).toBeDefined();
    expect(region?.textContent).toBe('');
    await use(d, 'limits');
    const note = within(d).getByText(t('sb.ed.used'));
    expect(presetOf(note)).toBe('limits');
    expect(note.closest('[role="status"]')).toBe(region);
    await use(d, 'readOnly');
    expect(within(d).getAllByText(t('sb.ed.used'))).toHaveLength(1);
    expect(presetOf(within(d).getByText(t('sb.ed.used')))).toBe('readOnly');
  });

  it('a field edited after the preset clears the note (the form no longer just holds the preset)', async () => {
    panel({ status: { '7': statusSamples.none }, sent: [] });
    await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
    const d = await screen.findByRole('dialog');
    await use(d, 'limits');
    expect(within(d).getByText(t('sb.ed.used'))).toBeInTheDocument();
    await userEvent.type(within(d).getByRole('textbox', { name: t('sb.ed.hidden') }), '/srv');
    expect(within(d).queryByText(t('sb.ed.used'))).toBeNull();
  });
});
