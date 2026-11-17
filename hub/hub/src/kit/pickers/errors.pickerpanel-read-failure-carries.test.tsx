// A picker's read failure shows the rejection's mapped words and Details, not the title alone.
import { providers } from '@core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { errorSentence, infoOf } from '../states/ErrorDetails';
import stateStrings from '../states/strings.en.json';
import { evidence7k } from './fixtures/evidence7k';
import { ModelBrowser } from './ModelBrowser';
import { PickerPanel } from './PickerPanel';

const REJECTION = { kind: 'failed', code: 'unavailable', status: 503, retryAfter: null, details: {} };

describe('PickerPanel: a read failure carries its rejection', () => {
  it('the mapped sentence after the title, and a Details button', () => {
    render(<PickerPanel label="Realms" items={undefined} mode="single" value={[]} onChange={() => undefined} status={{ error: REJECTION, onRetry: () => undefined }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(errorSentence(infoOf(REJECTION)));
    expect(screen.getByRole('button', { name: stateStrings['err.details'] })).toBeInTheDocument();
  });
});

describe('ModelBrowser: a failed catalogue carries its rejection', () => {
  it('the mapped sentence and Details', () => {
    const ev = evidence7k('catalogueFailed');
    if (ev.catalogue.state !== 'failed') throw new Error('fixture');
    render(
      <ModelBrowser evidence={ev} computerName="atlas" value="" rules={providers.rulesFor('bot')} purpose="bot" onChoose={() => undefined} onSetup={() => undefined} onOtherWay={() => undefined} onRetry={() => undefined} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(errorSentence(infoOf(ev.catalogue.err)));
    expect(screen.getByRole('button', { name: stateStrings['err.details'] })).toBeInTheDocument();
  });
});
