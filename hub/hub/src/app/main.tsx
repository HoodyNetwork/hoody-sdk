// Hub v3 entry: global styles, page discovery, router, @core boot (fixtures or live), then mount.
import '@kit/tokens.css';
import '@kit/base.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { lockHost, queryClient as coreQueryClient } from '@core';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { bootCore } from './core-boot';
import { adoptInjectedStyles } from './csp-styles';
import { DevToolbar } from './DevToolbar';
import { discoverPages, visiblePages } from './pages';
import { registerPageResolver } from './page-resolver';
import { buildRouter } from './router';
import { adoptViewParam } from '../shell/hubUrl';
import { LockRoot } from '../shell/LockRoot';
import { applyTheme, pinTheme } from '../shell/prefs';
import { installStaleChunk } from '../shell/staleChunk';
import { installFirstKeyMark } from '@kit/overlays/firstKey';
import { installTransitionCancelFix } from '@kit/overlays/transitionCancel';

declare global {
  interface Window {
    HubBootGate?: { reveal: () => void };
  }
}

// Before anything renders: React Aria's run-time <style> elements become CSP-safe sheets.
if (!__HUB_FIXTURES__) adoptInjectedStyles();
// Before anything renders: React Aria's focus moves never wait forever on a cancelled transition.
installTransitionCancelFix();
// Before anything renders: a focus moved by code draws no box until this page's first key.
installFirstKeyMark();

const query = new URLSearchParams(window.location.search);

// Fixtures mode takes the theme from the URL (?theme=light|dark) so shots are deterministic: pinned, the device's scheme
// is not followed. Without it (fixtures, where fouc.js does not run) the Hub's own choice applies, system by default.
{
  const theme = query.get('theme');
  if (__HUB_FIXTURES__ && (theme === 'light' || theme === 'dark')) pinTheme(theme);
  else if (__HUB_FIXTURES__) applyTheme();
}

const { pages, problems } = discoverPages();
if (problems.length > 0) console.error('hub: pages left out', problems);

const visible = visiblePages(pages, {
  preview: query.get('preview') === '1',
  only: __HUB_PAGE__,
  fixtures: __HUB_FIXTURES__,
});

// One query client for the app and @core (core's defineQuery reads and invalidates it).
const queryClient = coreQueryClient;

// A deep link through sign-in (?view=, which the login pages forward) becomes the v3 route before
// the router reads the location.
adoptViewParam(visible);

// Error details name a page by its title and link (core keeps only the id).
registerPageResolver(visible);

const router = buildRouter(visible, { queryClient });

// A lazy chunk a deploy removed: the "Hub was updated" notice with Reload; the person decides, nothing reloads by itself.
installStaleChunk();

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof buildRouter>;
  }
}

const root = document.getElementById('root');
const boot = await bootCore(visible.map((p) => p.id));
if (root && boot === 'render') {
  // The lock host's own root first: a tab that boots locked shows the lock screen, never the app.
  const host = lockHost();
  if (host)
    createRoot(host).render(
      <StrictMode>
        <LockRoot />
      </StrictMode>,
    );
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {__HUB_FIXTURES__ && query.get('fxbar') !== '0' && <DevToolbar pages={visible} />}
      </QueryClientProvider>
    </StrictMode>,
  );
  window.HubBootGate?.reveal();
}
