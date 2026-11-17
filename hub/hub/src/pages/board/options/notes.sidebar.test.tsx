// A note put on Board from Notes opens with the notebook sidebar hidden (links.ts openTile). That is
// an ordinary option of the tile: its Options drawer shows the sidebar switch off and turning it on clears the option.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { openTile } from '../links';
import { OptionsPanel, type Saved } from './index';

const CAT = catalog as unknown as Catalog;
const USER = 'a'.repeat(24), NODE = 'b'.repeat(24);

function Host({ onSave }: { onSave: (s: Saved) => void }) {
  const [open, setOpen] = useState(true);
  const t = openTile('notes', { view: 'node', userId: USER, nodeId: NODE })!;
  return <OptionsPanel isOpen={open} onOpenChange={setOpen} cat={CAT} onRetry={() => undefined} program="notes" tileName="notes-1" computerName="atlas" view={t.view} params={t.params} running onSave={onSave} />;
}
const press = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };

describe('a note put on Board from Notes: the sidebar option', () => {
  it('shows as a changed option with the sidebar switch off; turning it on and saving clears it', async () => {
    const onSave = vi.fn();
    render(<Host onSave={onSave} />);
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('button', { name: /^Page parts/ })).toHaveAttribute('aria-expanded', 'true');
    const side = within(d).getByRole('switch', { name: 'Show the notebook sidebar' });
    expect(side).not.toBeChecked();
    await press(side);
    expect(side).toBeChecked();
    await press(within(d).getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ view: 'node', params: { userId: USER, nodeId: NODE } });
  });
});
