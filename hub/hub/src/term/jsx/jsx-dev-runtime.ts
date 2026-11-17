// Development twin of jsx-runtime.ts (Bun's transpiler emits jsxDEV outside production).
import { Fragment, jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime';
import type { ElementType, Key, ReactElement } from 'react';
import { Dom } from './dom';

type Props = Record<string, unknown>;

export function jsxDEV(type: ElementType, props: Props, key: Key | undefined, isStatic: boolean, source?: Parameters<typeof reactJsxDEV>[4], self?: unknown): ReactElement {
  if (typeof type === 'string') return reactJsxDEV(Dom, { ...props, tag: type, ref: undefined, __ref: props.ref }, key, isStatic, source, self);
  return reactJsxDEV(type, props, key, isStatic, source, self);
}
export { Fragment };
