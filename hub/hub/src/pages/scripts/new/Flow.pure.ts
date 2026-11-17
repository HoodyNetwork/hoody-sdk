// New script's draft ids, entry and step list (split out of Flow.tsx so the terminal build shares them; the design
// notes are at the top of Flow.tsx). One `minted` set, never copied (Flow.tsx reads it). Flow.tsx re-exports the
// public names and keeps the draft-memory onBump registration (its place among the other registrations is unchanged).
import { useGo, useSearchParam } from '@kit';
import { useEffect, useRef } from 'react';
import { template } from '../logic';
import type { CompScripts } from '../types';
import type { Way } from './draft';

/** A draft id: 10 base36 characters. */
export const DRAFT_ID = /^[0-9a-z]{10}$/;
export function newDraftId(bytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const b = bytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += ((b[i] ?? 0) % 36).toString(36);
  return out;
}

/** The URL of a new draft: /scripts/new/<id>, keeping ?exec= and ?idea=. */
export function draftHref(id: string, search: { exec?: string; idea?: string }): string {
  const q = new URLSearchParams();
  if (search.exec) q.set('exec', search.exec);
  if (search.idea) q.set('idea', search.idea);
  const qs = q.toString();
  return `/scripts/new/${id}${qs ? `?${qs}` : ''}`;
}

// Draft ids this tab minted (/scripts/new) and has not lost since: such an id opens a new draft. Any other id not in this tab's
// memory is gone here: a reload never makes a new draft under an old id, and its build stays on Scripts (Building).
export const minted = new Set<string>();
/** Marks `id` as minted by this tab (NewScriptEntry; tests that open a draft URL directly). */
export function mintDraft(id: string): void { minted.add(id); }

/** /scripts/new: mints the draft and replaces the URL with its own, so every history entry names it. */
export function NewScriptEntry() {
  const go = useGo();
  const [exec] = useSearchParam('exec');
  const [idea] = useSearchParam('idea');
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const id = newDraftId();
    mintDraft(id);
    go(draftHref(id, { exec, idea }), { replace: true });
  }, [go, exec, idea]);
  return null;
}

/** Can this computer take a new script? On, readable, with revisions. */
export const canTake = (c: CompScripts): boolean => c.state === 'on' && !c.err && !!c.caps?.revisions;

/** The steps of a way. An idea without fields has no Fill it in. */
export function stepsOf(way: Way, ideaName: string | null): ('what' | 'where' | 'build' | 'fill' | 'write' | 'check' | 'live')[] {
  if (way === 'ai') return ['what', 'where', 'build', 'check', 'live'];
  if (way === 'write') return ['what', 'where', 'write', 'check', 'live'];
  const idea = template(ideaName);
  return idea && idea.plain.length > 0 ? ['what', 'where', 'fill', 'check', 'live'] : ['what', 'where', 'check', 'live'];
}
