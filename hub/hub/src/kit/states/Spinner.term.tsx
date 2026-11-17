// The busy mark in the terminal: a still "…" (the web's still frame, its reduced-motion form). It never animates: a
// spinning glyph would keep an idle app drawing. With a label it says the label too ("… Starting").
import type * as Web from './Spinner';
import { Text } from '../../term/prim';

export const Spinner: typeof Web.Spinner = ({ label, size }) => <Text colour="muted" bold={size === 'lg'} {...(label ? { sem: { role: 'status' as const, name: label } } : {})}>{label ? `… ${label}` : '…'}</Text>;
