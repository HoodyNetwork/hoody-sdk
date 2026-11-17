// The terminal build's JSX runtime for code under hub/src (resolve.ts sends react/jsx-runtime here): a DOM tag is the
// compat element (dom.ts), anything else is React's own element.
import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from 'react/jsx-runtime';
import type { ElementType, Key, ReactElement } from 'react';
import { Dom } from './dom';

type Props = Record<string, unknown>;
// A ref on a raw tag reaches Dom as __ref (it gets a TermElement, element.ts); `ref` itself is not a prop of Dom.
const dom = (tag: string, props: Props): Props => ({ ...props, tag, ref: undefined, __ref: props.ref });

export function jsx(type: ElementType, props: Props, key?: Key): ReactElement {
  return typeof type === 'string' ? reactJsx(Dom, dom(type, props), key) : reactJsx(type, props, key);
}
export function jsxs(type: ElementType, props: Props, key?: Key): ReactElement {
  return typeof type === 'string' ? reactJsxs(Dom, dom(type, props), key) : reactJsxs(type, props, key);
}
export { Fragment };
