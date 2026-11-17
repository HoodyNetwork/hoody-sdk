// Test helper: the editor's "Runs" choice is a kit Select (a button that opens a list), never a stack of radios.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import strings from './strings.en.json';

type Kind = 'every' | 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'reboot' | 'custom';

/** The button that opens the Runs list (its name holds the label and the picked kind). */
export const runsButton = async (): Promise<HTMLElement> => screen.findByRole('button', { name: new RegExp(`${strings['ed.when']}$|^${strings['ed.when']}\\b`) });

/** Opens the Runs list and picks a kind. */
export async function pickRuns(kind: Kind): Promise<void> {
  await userEvent.click(await runsButton());
  await userEvent.click(await screen.findByRole('option', { name: strings[`ed.k.${kind}`] }));
}
