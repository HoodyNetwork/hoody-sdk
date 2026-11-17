// The classic-runtime factory for the few files Bun's automatic JSX refuses (a key after a spread): createElement with
// the same DOM-tag rule as jsx-runtime.ts.
import { createElement, Fragment, type ElementType, type ReactElement, type ReactNode } from 'react';
import { Dom } from './dom';

export function h(type: ElementType, props: Record<string, unknown> | null, ...children: ReactNode[]): ReactElement {
  if (typeof type === 'string') return createElement(Dom, { ...props, tag: type, ref: undefined, __ref: props?.ref }, ...children);
  return createElement(type, props, ...children);
}
export { Fragment };
