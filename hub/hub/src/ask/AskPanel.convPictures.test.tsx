// The dock's picture reader (DockPictures) holds the whole transcript: the kit's SessionView (DockSession, once the conversation has
// a session) as well as the dock's own column before it. With the reader around the column only, a reopened chat's stored picture
// had no reader and a step's picture showed its path as text.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('./pictures', () => ({ DockPictures: ({ children }: { children: ReactNode }) => <div data-testid="reader">{children}</div> }));
vi.mock('./DockSession', () => ({ DockSession: ({ fallback }: { fallback: ReactNode }) => <div data-testid="session">{fallback}</div> }));

import { ConvBody } from './AskPanel';

afterEach(() => { cleanup(); });

describe('ConvBody', () => {
  it('draws the session view and its column fallback inside the dock picture reader', () => {
    render(<ConvBody eng={{} as any} conv={null} host={{ computer: 'atlas', realm: 'This realm' }} agentUrl="" typing={false} empty={null} onTakeBack={() => undefined} column={<p>THE COLUMN</p>} />);
    const reader = screen.getByTestId('reader');
    const session = within(reader).getByTestId('session');
    expect(within(session).getByText('THE COLUMN')).toBeTruthy();
    expect(screen.getAllByTestId('reader')).toHaveLength(1);
  });
});
