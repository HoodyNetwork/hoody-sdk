// Vitest: the "Close without knowing" of a pending banner is offered only after a Check again on that very outcome. Another
// pending outcome (another computer's, or a later one here) starts again at Check again, an open confirmation closes with the
// outcome it was opened for, and a Check that answers after the outcome changed counts for nothing.
import { act, render, screen, userEvent } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { ChangeBanner } from './parts/Bits';
import type { Out } from './parts/ops';
import strings from './strings.en.json';

const pending = (): Out => ({ kind: 'pending' });
const force = () => screen.queryByRole('button', { name: strings['force.label'] });

function Banner({ out, onCheck }: { out: Out | null; onCheck?: () => Promise<void> | void }) {
  return <ChangeBanner out={out} what="create" onDismiss={() => undefined} onCheck={onCheck ?? (() => undefined)} onForce={() => undefined} />;
}

describe('the exit of a pending banner', () => {
  it("another computer's pending outcome is not offered Close without knowing before its own Check again", async () => {
    const a = pending();
    const view = render(<Banner out={a} />);
    await userEvent.click(await screen.findByRole('button', { name: strings['outcome.check'] }));
    expect(await screen.findByRole('button', { name: strings['force.label'] })).toBeTruthy();
    view.rerender(<Banner out={null} />);
    view.rerender(<Banner out={pending()} />);
    expect(force()).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: strings['outcome.check'] }));
    expect(await screen.findByRole('button', { name: strings['force.label'] })).toBeTruthy();
  });

  it('an open confirmation closes when the outcome it was opened for is replaced', async () => {
    const view = render(<Banner out={pending()} />);
    await userEvent.click(await screen.findByRole('button', { name: strings['outcome.check'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['force.label'] }));
    expect(await screen.findByRole('button', { name: strings['force.confirm'] })).toBeTruthy();
    view.rerender(<Banner out={pending()} />);
    expect(screen.queryByRole('button', { name: strings['force.confirm'] })).toBeNull();
  });

  it('a Check that answers after the outcome changed does not unlock the new outcome', async () => {
    let answer!: () => void;
    const slow = () => new Promise<void>((res) => { answer = res; });
    const view = render(<Banner out={pending()} onCheck={slow} />);
    await userEvent.click(await screen.findByRole('button', { name: strings['outcome.check'] }));
    view.rerender(<Banner out={pending()} onCheck={slow} />);
    await act(async () => { answer(); await Promise.resolve(); });
    expect(force()).toBeNull();
  });

  it('control: the same outcome keeps its Close without knowing across renders', async () => {
    const a = pending();
    const view = render(<Banner out={a} />);
    await userEvent.click(await screen.findByRole('button', { name: strings['outcome.check'] }));
    view.rerender(<Banner out={a} />);
    expect(await screen.findByRole('button', { name: strings['force.label'] })).toBeTruthy();
  });
});
