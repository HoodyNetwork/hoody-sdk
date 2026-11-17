// Rules & safety → Agent features and Where agents may work, on core.
//   - features: one read per computer (process-wide, no realm). A change sets ONE feature to a value, sent once; a lost
//     or 5xx answer is pending (may have saved) until a fresh read shows the value (featureProved) or the person stops
//     tracking it, never resent blind. A read showing the old value proves nothing: the write may still be waiting.
//     The lock is per computer and feature, held in every realm view: the setting is the computer's, not a realm's.
//   - where: one read per computer, realm and folder; never without a folder (the agent would read its own start folder).
// Its own source ('ai-features'): the hook rules in this folder (data.ts) are source 'ai-rules'.
import { coreSource, type SourceTable, type Target } from '@core';
import { featureProved, featuresOf, whereOf, type FeatureName, type FeatureRow, type Where } from './features.logic';
import { featureRoutes } from './features.routes';

export interface FeaturesAt { target: Target }
export interface SetFeature { target: Target; name: FeatureName; value: boolean }
/** A folder is an absolute path; the Realm scope has none, and then nothing is read. */
export interface WhereAt { target: Target; realm: string; folder: string }

export const FEATURES_LOCK = 'ai-agent-features';
const computerOf = (t: Target) => `${t.project.id}/${t.container.id}`;

export const featuresTable: SourceTable = {
  reads: {
    features: {
      route: featureRoutes.features,
      // Core's off-page read-back (Check again after the page closed) builds it with no params and its own computer.
      input: (p?: FeaturesAt) => (p ? { target: p.target } : {}),
      select: (raw): FeatureRow[] => {
        const f = featuresOf(raw);
        if (!f) throw new Error('not a features answer');
        return f;
      },
    },
    where: {
      route: featureRoutes.where,
      // core builds the key of a disabled read too, with no params: it sends nothing then.
      input: (p?: WhereAt) => (p ? { target: p.target, realm: p.realm, cwd: p.folder } : {}),
      select: (raw): Where => {
        const w = whereOf(raw);
        if (!w) throw new Error('not a where answer');
        return w;
      },
    },
  },
  changes: {
    setFeature: {
      route: featureRoutes.setFeatures,
      input: (v: SetFeature) => ({ target: v.target, body: { features: { [v.name]: v.value } } }),
      select: () => undefined,
      reads: ['features'],
      lock: FEATURES_LOCK,
      lockKey: (v: SetFeature) => ({ computer: computerOf(v.target), name: v.name }),
      identity: (v: SetFeature) => ({ computer: computerOf(v.target), name: v.name, value: v.value }),
      acrossRealms: true,
      proves: featureProved,
    },
  },
};

export const featuresSource = coreSource('ai-features', featuresTable);
export { computerOf };

export function useFeatures(target: Target) {
  return featuresSource.useQuery<FeatureRow[], FeaturesAt>('features', { target });
}

/** Off while `at` is null (no folder). */
export function useWhere(at: WhereAt | null) {
  return featuresSource.useQuery<Where, WhereAt | undefined>('where', at ?? undefined, { enabled: at !== null });
}
