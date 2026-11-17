// A sandbox status read that never succeeded is said, never "Checking…" for ever.
import { describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, queryClient, reply } from '@core';
import { render, screen } from '@app/testing';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from '../logic';
import { sandboxRulesFor } from './fixtures';
import { sandboxRoutes as routes } from './routes';
import { SandboxChip } from './SandboxChip';
import strings from './strings.en.json';

const row = { key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null, up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can: {} } as unknown as ProgramRow;
const chip = (rules: NonNullable<Parameters<typeof bootFixtureCore>[0]>['rules']) => {
  bootFixtureCore({ rules });
  queryClient.clear();
  return render(<QueryClientProvider client={queryClient}><SandboxChip row={row} /></QueryClientProvider>);
};

describe('SandboxChip when the status read fails before any answer', () => {
  it('no answer at all: "No answer", not Checking…', async () => {
    chip([reply(routes.status, answers.lost(5)), ...sandboxRulesFor()]);
    expect(await screen.findByText(strings['sb.chip.noAnswer'])).toBeInTheDocument();
    expect(screen.queryByText(strings['sb.chip.checking'])).toBeNull();
  });

  it('an answered failure: "Couldn\'t read", not Checking…', async () => {
    chip(sandboxRulesFor({ failStatus: true }));
    expect(await screen.findByText(strings['sb.chip.unread'])).toBeInTheDocument();
    expect(screen.queryByText(strings['sb.chip.checking'])).toBeNull();
  });

  it('an answer that is not a status (data null): "Couldn\'t read", not Checking…', async () => {
    chip([reply(routes.status, answers.ok({ nonsense: true })), ...sandboxRulesFor()]);
    expect(await screen.findByText(strings['sb.chip.unread'])).toBeInTheDocument();
    expect(screen.queryByText(strings['sb.chip.checking'])).toBeNull();
  });

  it('while the first read is out it still says Checking…', () => {
    chip([reply(routes.status, answers.ok({}, 60_000)), ...sandboxRulesFor()]);
    expect(screen.getByText(strings['sb.chip.checking'])).toBeInTheDocument();
  });
});
