// The words a PickerField hands its picker's trigger in the terminal, where a control is named by words rather than by
// element ids (PickerField.term.tsx provides it, ComputerPicker.term.tsx's PickerTrigger reads it). Plain React.
import { createContext, type ReactNode } from 'react';

export const PickerFieldWords = createContext<{ label: string; description?: ReactNode; error?: ReactNode } | null>(null);
