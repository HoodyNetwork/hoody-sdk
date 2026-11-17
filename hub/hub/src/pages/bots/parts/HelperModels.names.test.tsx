// A held helper model nobody lists follows the one name rule: a Hoody AI spec with no name to show never shows.
import { render, screen } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { HelperModelPick } from './HelperModels';

const pick = (model: string) =>
  render(<HelperModelPick models={[]} model={model} thinking="" onChange={() => undefined} disabled={false} refused={undefined} />);

describe('HelperModelPick: a held model no row names', () => {
  it('a Hoody AI spec with no name to show reads the word', () => {
    pick('hoody-ai/upstream');
    expect(screen.getByRole('combobox')).toHaveValue('A model');
    expect(document.body.innerHTML).not.toMatch(/upstream/i);
  });
  it('another provider keeps the name after its prefix', () => {
    pick('acme/widget');
    expect(screen.getByRole('combobox')).toHaveValue('widget');
  });
});
