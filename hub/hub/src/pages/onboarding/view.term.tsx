// Terminal sibling of the onboarding page view. The page manifest sets `handoff`, so the terminal Hub draws the page
// title and the hand-off block in place of this view and never mounts it. The sibling keeps the web view's module tree
// (the animated LoadScreen and its cards) out of the terminal build; it draws nothing of its own.
import { createElement, Fragment } from 'react';
import type * as Web from './view';

export default function OnboardingPage(): ReturnType<typeof Web.default> {
  return createElement(Fragment);
}
