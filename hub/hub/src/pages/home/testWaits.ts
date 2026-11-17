// Home's page tests wait as the Board's do (pages/board/colour.test.tsx): on a busy host the first render loads the
// page's chunks and core rules, and a draw can take longer than the shared 5 s (app/test-setup.ts). That is load, not a
// failure. A test runs several waits, so its own timeout stays above them: a missing element fails on its query.
// Imported for its effect by every Home test that renders the page; waits.test.ts keeps that list whole.
import { configure } from '@testing-library/react';
import { vi } from 'vitest';

configure({ asyncUtilTimeout: 15000 });
vi.setConfig({ testTimeout: 60_000 });
