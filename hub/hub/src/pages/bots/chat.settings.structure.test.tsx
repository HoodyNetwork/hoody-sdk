// Vitest: the structure of a chat app's settings rows. Where a value comes from is plain help text under the setting's
// name (no chip between the name and its control), and every row keeps the reset cell, shown only for a value set
// here, so the controls of a group share one width.
import { render, screen } from '@app/testing';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Change, Channel, ChannelChange, ChannelVars } from './data';
import { ChannelSettingsSection, emptyDraft } from './parts/ChatSettings';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const eff = (e: Record<string, [unknown, string]>) => Object.fromEntries(Object.entries(e).map(([k, [value, source]]) => [k, { value, source }]));
const channel: Channel = {
  id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: 'running', needsOwner: false, people: 0, chats: 0, homeChat: null, reason: '', principals: [],
  chatRows: [],
  view: {
    settings: { gate_deciders: 'named' },
    effective: eff({
      dm_policy: ['owner', 'default'], group_mode: ['owner_approves', 'default'], gate_deciders: ['named', 'channel'], push_events: [['report'], 'default'], home_chat: [null, 'default'],
    }),
  },
  notes: [],
} as unknown as Channel;

const change = {
  run: async () => ({ outcome: 'done' as const }),
  outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
  readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
} as unknown as Change<ChannelChange, ChannelVars>;

function Section() {
  const [draft, setDraft] = useState(emptyDraft);
  return <ChannelSettingsSection channel={channel} change={change} draft={draft} onDraft={setDraft} />;
}

const rowOf = (name: string) => screen.getByText(name).closest('[data-sg-row]') as HTMLElement;
/** The row's help line: the element that follows its name inside the label cell. */
const helpOf = (row: HTMLElement) => row.querySelector('[id$="-help"], [class*="help"]') as HTMLElement | null;

describe('chat app settings: row structure', () => {
  it('says where a value comes from as plain help words, never as a chip under the name', () => {
    render(<Section />);
    const fromDefault = helpOf(rowOf(strings['set.n.dm_policy']));
    expect(fromDefault?.textContent).toBe(strings['set.from.default']);
    expect(fromDefault?.children).toHaveLength(0);
    const setHere = helpOf(rowOf(strings['set.n.gate_deciders']));
    expect(setHere?.textContent).toBe(strings['set.from.channel']);
    expect(setHere?.children).toHaveLength(0);
  });

  it('keeps the reset cell on every row and shows it only for a value set here', () => {
    render(<Section />);
    expect(rowOf(strings['set.n.dm_policy']).querySelector('[data-sg-reset]')?.getAttribute('data-sg-reset')).toBe('hidden');
    expect(rowOf(strings['set.n.group_mode']).querySelector('[data-sg-reset]')?.getAttribute('data-sg-reset')).toBe('hidden');
    expect(rowOf(strings['set.n.gate_deciders']).querySelector('[data-sg-reset]')?.getAttribute('data-sg-reset')).toBe('shown');
    expect(screen.getAllByRole('button', { name: strings['set.reset'] })).toHaveLength(1);
  });
});
