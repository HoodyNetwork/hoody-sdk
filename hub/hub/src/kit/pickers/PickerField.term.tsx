// PickerField in the terminal: the kit field frame (label, description, ✗ error; forms/termField FieldFrame) around one
// picker. The web hands its trigger the label's and descriptions' element ids; here the trigger is named by words, so
// the frame also hands them over as words (pickerFieldWords.ts), and the web's id context is kept for the
// `invalid` flag and any reader of usePickerField.
import { createContext, useContext, useId } from 'react';
import type * as Web from './PickerField';

import { FieldFrame } from '../forms/termField';
import { PickerFieldWords } from './pickerFieldWords';

export type { PickerFieldProps } from './PickerField';

export const PickerFieldContext: typeof Web.PickerFieldContext = createContext<{ labelId?: string; describedBy?: string; invalid: boolean } | null>(null);
export const usePickerField: typeof Web.usePickerField = () => useContext(PickerFieldContext);


export const PickerField: typeof Web.PickerField = ({ label, showLabel = true, description, errorMessage, children }) => {
  const labelId = useId();
  const invalid = Boolean(errorMessage);
  return (
    <PickerFieldContext.Provider value={{ labelId, invalid }}>
      <PickerFieldWords.Provider value={{ label, description, error: errorMessage }}>
        {showLabel ? (
          <FieldFrame label={label} description={description} error={errorMessage}>{children}</FieldFrame>
        ) : (
          <FieldFrame description={description} error={errorMessage}>{children}</FieldFrame>
        )}
      </PickerFieldWords.Provider>
    </PickerFieldContext.Provider>
  );
};

