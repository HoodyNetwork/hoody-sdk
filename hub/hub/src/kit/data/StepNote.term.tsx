// StepNote in the terminal: the same words, muted, wrapping in the step's column.
import type * as Web from './StepNote';
import { Flow } from './termFlow';

export const StepNote: typeof Web.StepNote = ({ children }) => <Flow colour="muted">{children}</Flow>;
