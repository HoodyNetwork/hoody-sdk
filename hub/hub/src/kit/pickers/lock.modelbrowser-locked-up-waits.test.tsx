// No Set up starts while the caller is saving (`locked`, C9: the save's answer is not in
// yet). Every Set up path is disabled like its siblings; opening a provider's models is navigation and stays live.
import { providers } from '@core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { evidence7k } from './fixtures/evidence7k';
import { ModelBrowser, type ModelBrowserProps } from './ModelBrowser';

function Host(p: Partial<ModelBrowserProps>) {
  return (
    <ModelBrowser
      evidence={evidence7k('freeOnly')}
      computerName="atlas"
      value=""
      rules={providers.rulesFor('bot')}
      purpose="bot"
      onChoose={() => undefined}
      onSetup={() => undefined}
      onOtherWay={() => undefined}
      onRetry={() => undefined}
      {...p}
    />
  );
}

describe('ModelBrowser locked: Set up waits for the save (pickers#4)', () => {
  it('the In use card: Set up is disabled and asks for nothing', async () => {
    const onSetup = vi.fn();
    render(<Host evidence={evidence7k('threeReady')} value="anthropic/claude-fable-5" locked onSetup={onSetup} />);
    const b = screen.getByRole('button', { name: 'Set up Anthropic' });
    expect(b).toBeDisabled();
    await userEvent.click(b);
    expect(onSetup).not.toHaveBeenCalled();
  });

  it("the Directory: a card's Set up is disabled, its models link stays live", async () => {
    const onSetup = vi.fn();
    render(<Host locked onSetup={onSetup} />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    const card = document.querySelector<HTMLElement>('#mc-dir-rows-suggested > li[data-provider="openai"]')!;
    const setup = within(card).getByRole('button', { name: 'Set up OpenAI' });
    expect(setup).toBeDisabled();
    await userEvent.click(setup);
    expect(onSetup).not.toHaveBeenCalled();
    expect(within(card).getAllByRole('button').filter((x) => x !== setup).every((x) => !(x as HTMLButtonElement).disabled)).toBe(true);
  });

  it('an All providers row still opens the drill-in, whose Set up is disabled', async () => {
    const onSetup = vi.fn();
    render(<Host locked onSetup={onSetup} />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    const row = document.querySelectorAll<HTMLElement>('[id*="-dir-row-"]')[0]!;
    expect(row).toBeEnabled();
    await userEvent.click(row);
    expect(screen.getByRole('button', { name: 'Back to providers' })).toBeInTheDocument();
    const drill = document.querySelector<HTMLButtonElement>('[id$="-drill-setup"]')!;
    expect(drill).not.toBeNull();
    expect(drill).toBeDisabled();
    await userEvent.click(drill);
    expect(onSetup).not.toHaveBeenCalled();
  });

  it('unlocked, the same drill-in Set up asks for the step (the guard holds only the lock)', async () => {
    const onSetup = vi.fn();
    render(<Host onSetup={onSetup} />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(document.querySelectorAll<HTMLElement>('[id*="-dir-row-"]')[0]!);
    await userEvent.click(document.querySelector<HTMLButtonElement>('[id$="-drill-setup"]')!);
    expect(onSetup).toHaveBeenCalledTimes(1);
  });
});
