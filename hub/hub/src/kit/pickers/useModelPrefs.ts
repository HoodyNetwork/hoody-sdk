// The one model picker's account preference: favourites, recent picks and the
// remembered filters, one encrypted per-account key in this browser (core/prefs ACCOUNT_PREF_KEYS), purged at sign-out.
import { usePrefUpdate } from '@core';
import { useCallback } from 'react';
import { parseModelPrefs, pickedRecently, type ModelPrefs } from './modelPickLogic';

// Written out here (core/prefs.test reads each accountPref call's key from its file); equal to MODEL_PREFS_KEY.
export const MODEL_PREFS = 'hub_models_v1';

export interface ModelPrefsHook {
  prefs: ModelPrefs;
  /** Changes the remembered value; false when the change was not kept (another account, the store refused). */
  onPrefs: (fn: (p: ModelPrefs) => ModelPrefs) => boolean;
  /** A model was picked (committed) anywhere in the Hub: first in Recent. */
  picked: (spec: string) => void;
}

export function useModelPrefs(): ModelPrefsHook {
  const { value, update } = usePrefUpdate(MODEL_PREFS, parseModelPrefs);
  const picked = useCallback((spec: string) => void update((p) => pickedRecently(p, spec)), [update]);
  return { prefs: value, onPrefs: update, picked };
}
