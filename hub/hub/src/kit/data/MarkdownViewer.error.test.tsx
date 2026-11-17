// A document that failed to load shows its error with mapped words and Details, never an empty file.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { errorSentence, infoOf } from '../states/ErrorDetails';
import stateStrings from '../states/strings.en.json';
import { MarkdownViewer } from './MarkdownViewer';
import strings from './MarkdownViewer.strings.en.json';

const REJECTION = { kind: 'failed', code: 'unavailable', status: 503, retryAfter: null, details: {} };

describe('MarkdownViewer error=', () => {
  it('the failed state with its words, Details and Try again; no empty file, views, copy or download', () => {
    const onRetry = vi.fn();
    render(<MarkdownViewer label="README.md" error={REJECTION} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent(strings['viewer.failed']);
    expect(screen.getByRole('alert')).toHaveTextContent(errorSentence(infoOf(REJECTION)));
    expect(screen.getByRole('button', { name: stateStrings['err.details'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(strings['viewer.empty'])).toBeNull();
    expect(screen.queryByRole('button', { name: /copy|download/i })).toBeNull();
  });
});
