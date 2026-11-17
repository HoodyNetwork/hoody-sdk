// The header's model chip: the chat's model as the host read it, at every size, and one press to where the model and thinking are
// switched (the host's own control). Not known: no chip (a model is never guessed); a context figure is never drawn.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConvHeader } from './ConvHeader';
import strings from './ConvHeader.strings.en.json';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const base = { size: 'l' as const, title: 'Fix tests', meta: { computer: 'atlas', realm: 'Personal', status: 'idle' as const }, detailsOpen: false, onDetails: () => {} };
const chipName = (name: string) => strings['head.model'].replace('{{name}}', name);

describe('ConvHeader model chip', () => {
  it('absent: no chip', () => {
    render(<ConvHeader {...base} />);
    expect(screen.queryByRole('button', { name: /model/i })).toBeNull();
  });

  it('names the model the host read and opens the host switch once', () => {
    const onPress = vi.fn();
    render(<ConvHeader {...base} model={{ spec: 'acme/hoody-free', catalogue: null }} onModel={onPress} />);
    const chip = screen.getByRole('button', { name: chipName('acme/hoody-free') });
    expect(chip.textContent).toContain('acme/hoody-free');
    fireEvent.click(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a Hoody model whose name is withheld: the chip says the kit word, never an empty chip', () => {
    render(<ConvHeader {...base} model={{ spec: 'hoody-ai/upstream', catalogue: null }} onModel={() => {}} />);
    const word = strings['head.model.unnamed'];
    expect(screen.getByRole('button', { name: chipName(word) }).textContent).toContain(word);
  });

  it('stays on a phone frame (the agent line goes, the model does not)', () => {
    render(<ConvHeader {...base} size="xs" model={{ spec: 'GPT-5', catalogue: null }} onModel={() => {}} />);
    const chip = screen.getByRole('button', { name: chipName('GPT-5') });
    expect(chip.closest('.opt, [class*="opt"]')).toBeNull();
  });

  it('a model name is cleaned and keys are hidden before it is shown', () => {
    render(<ConvHeader {...base} model={{ spec: fake('sk-ant-', 'api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), catalogue: null }} onModel={() => {}} />);
    expect(document.body.textContent).not.toContain('AAAAAAAAAAAAAAAAAAAA');
  });
});
