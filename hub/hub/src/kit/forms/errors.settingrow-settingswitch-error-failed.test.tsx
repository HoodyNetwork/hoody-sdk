// A setting row's failed change and an EntityPicker's failed read show the rejection's
// mapped words and Details.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { errorSentence, infoOf } from '../states/ErrorDetails';
import stateStrings from '../states/strings.en.json';
import kitStrings from '../strings.en.json';
import { EntityPicker } from './more';
import { SettingGroup, SettingSwitch } from './SettingGroup';
import { SettingRow } from './SettingRow';

const REJECTION = { kind: 'failed', code: 'unavailable', status: 503, retryAfter: null, details: {} };
const details = () => screen.queryByRole('button', { name: stateStrings['err.details'] });

describe('SettingRow and SettingSwitch: error= on a failed change', () => {
  it.each([
    ['a row outside a group', () => <SettingRow label="Region" outcome="failed" error={REJECTION}>Singapore</SettingRow>],
    ['a row in a group', () => <SettingGroup><SettingRow label="Region" outcome="failed" error={REJECTION}>Singapore</SettingRow></SettingGroup>],
    ['a switch', () => <SettingSwitch label="Backups" isSelected onChange={() => undefined} outcome="failed" error={REJECTION} />],
  ] as const)('%s: the mapped sentence and Details', (_n, ui) => {
    render(ui());
    expect(document.body).toHaveTextContent(errorSentence(infoOf(REJECTION)));
    expect(details()).toBeInTheDocument();
  });
  // detail= is the page's own sentence in place of the mapped one, and
  // the rejection's Details still show.
  it.each([
    ['a row outside a group', () => <SettingRow label="Region" outcome="failed" error={REJECTION} detail="Only an admin can change the region.">Singapore</SettingRow>],
    ['a row in a group', () => <SettingGroup><SettingRow label="Region" outcome="failed" error={REJECTION} detail="Only an admin can change the region.">Singapore</SettingRow></SettingGroup>],
    ['a switch', () => <SettingSwitch label="Backups" isSelected onChange={() => undefined} outcome="failed" error={REJECTION} detail="Only an admin can change the region." />],
  ] as const)('%s with detail=: its own sentence, not the mapped one, and Details', (_n, ui) => {
    render(ui());
    expect(document.body).toHaveTextContent('Only an admin can change the region.');
    expect(document.body).not.toHaveTextContent(errorSentence(infoOf(REJECTION)));
    expect(details()).toBeInTheDocument();
  });
  it('without error= a failed row is as before: no Details', () => {
    render(<SettingRow label="Region" outcome="failed">Singapore</SettingRow>);
    expect(details()).toBeNull();
  });
});

describe('EntityPicker: a failed read', () => {
  it('says why, offers Details and keeps Try again', () => {
    const onRetry = vi.fn();
    render(<EntityPicker label="Computer" options={undefined} error={REJECTION} onRetry={onRetry} value={undefined} onChange={() => undefined} />);
    expect(document.body).toHaveTextContent(errorSentence(infoOf(REJECTION)));
    expect(details()).toBeInTheDocument();
    // The status sits inside the ComboBox: Try again is its own button, never the combobox's trigger.
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it('facts that say pending: the pending title and Check again (a read again), never "didn\'t load" (C9)', () => {
    const onRetry = vi.fn();
    const PENDING = { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} };
    render(<EntityPicker label="Computer" options={undefined} error={PENDING} onRetry={onRetry} value={undefined} onChange={() => undefined} />);
    expect(document.body).toHaveTextContent(kitStrings['outcome.pending.title']);
    expect(document.body).not.toHaveTextContent(kitStrings['picker.error']);
    fireEvent.click(screen.getByRole('button', { name: kitStrings['outcome.pending.check'] }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
