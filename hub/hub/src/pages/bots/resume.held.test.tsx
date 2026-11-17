// Vitest: the Bots list's Resume note offers Stop tracking only when this mount holds a send it can free. A hold another
// mount or tab sent shows "may have gone through" with Check again only (no computer named: it may be another computer's),
// since a Stop tracking here would confirm and free nothing. A held send of this mount names its computer and offers it.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComputerNotesStrip, type ResumeShown } from './view';
import type { Computer } from './data';
import strings from './strings.en.json';
import kit from '@kit/strings.en.json';
import ks from '@kit/states/strings.en.json';

const no = (): void => {};
const atlas: Computer = { id: 'c1', name: 'atlas', server: 'n1', flag: 'SG', state: 'running', listState: 'ok', suspended: 0, hasMore: false };
const strip = (resumed: ResumeShown) => (
  <ComputerNotesStrip computers={[]} allComputers={[atlas]} holds={[]} onRetry={no} onResume={no} resuming={false} resumed={resumed} starting={false} onCheckStart={no} onDismissStart={no} />
);
const pending = (held: ResumeShown['held']): ResumeShown => ({ outcome: 'pending', computerId: 'c1', held, onCheck: no, onDismiss: no, onClose: no });

describe('Resume that may have gone through', () => {
  it('held by another mount: Check again only, no Stop tracking, no computer named', () => {
    render(strip(pending(() => [])));
    expect(screen.getByText(strings['notice.resumeHeldAny'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: kit['outcome.pending.check'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ks['err.stopTracking'] })).toBeNull();
  });

  it('held by this mount: names its computer and offers Stop tracking', () => {
    render(strip(pending(() => [{ identity: { action: 'resume', computerId: 'c1' }, hold: 'h1' }])));
    expect(screen.getByText(strings['notice.resumeHeld'].replace('{{name}}', 'atlas'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ks['err.stopTracking'] })).toBeInTheDocument();
  });
});
