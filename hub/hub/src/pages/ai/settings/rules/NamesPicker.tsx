// The Tools and Agents of a rule as one picker: a single field lists the names this computer reports (its agents, its tool
// catalogue) and takes a typed name it does not list (an MCP tool, an agent defined later) with Enter, checked by the
// same shape the rule's own check uses. The names chosen sit under it as removable tags, in the order they were added
// (an edited rule shows its stored names in their stored order). The value is the plain list of names a rule stores:
// the picker never adds, reorders or drops one by itself, so what is sent is exactly the names shown. A name the
// computer's list does not hold stays, its tag marked as not found there. With no name chosen one tag says what that
// means (every agent; the tool calls the checker judges). Typed text is never dropped: leaving the field adds it as
// Enter does, and a name of the wrong shape stays in the field, refused (`onRefusedChange`), so the dialog does not save
// without it. A name added twice is one tag: the checker matches a rule's names as a set, and refuses an agent named
// twice; a stored rule's names, repeats included, are shown and kept as they are.
import { EntityPicker, Row, Tag, type Option } from '@kit';
import { useEffect, useRef, useState } from 'react';

/** Names as a person types them: commas or spaces between names; empty entries go (what the Tools and Agents text fields
 *  of this dialog read before the picker). */
export const parseList = (s: string): string[] => s.split(/[\s,]+/).filter((x) => x !== '');

export interface NamesPickerProps {
  /** The field's accessible name: what it adds ("Add a tool"). Not drawn: the section's heading (Tools, Agents) names it. */
  label: string;
  /** The names chosen, in order. */
  names: readonly string[];
  onChange: (next: string[]) => void;
  /** What the empty list means, shown in place of the tags. */
  noneText: string;
  /** The names this computer reports, as options; undefined while the read runs or after it failed. */
  known: readonly Option<string>[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** The field's own line: how to add a name the list does not hold. */
  hint: string;
  /** The mark on a tag whose name the computer's list does not hold. */
  notFound: string;
  /** Whether a typed name has the shape the rule accepts. */
  valid: (name: string) => boolean;
  /** Said under the field when a typed name does not have that shape. */
  invalidText: string;
  /** The rule's own refusal about this list, if any. */
  errorMessage?: string | undefined;
  /** Whether typed text of the wrong shape is waiting in the field (the dialog must not save without it). */
  onRefusedChange: (refused: boolean) => void;
  isDisabled?: boolean;
}

export function NamesPicker({ label, names, onChange, noneText, known, loading, error, onRetry, hint, notFound, valid, invalidText, errorMessage, onRefusedChange, isDisabled }: NamesPickerProps) {
  const [bad, setBadState] = useState(false);
  const setBad = (b: boolean) => { setBadState(b); onRefusedChange(b); };
  // A pick from the list draws the field again empty for the next one, and keeps the focus in it.
  const [round, setRound] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (round > 0) input.current?.focus(); }, [round]);
  // Once refused, the field is judged again as the person edits it: put right or emptied, the dialog can save again
  // without leaving the field first (its save button is off meanwhile, and pressing an off button does not take the
  // focus from the field, so the leave that hands the text over never comes).
  const now = useRef({ bad, valid, onRefusedChange });
  now.current = { bad, valid, onRefusedChange };
  useEffect(() => {
    const el = input.current;
    if (!el || typeof el.addEventListener !== 'function') return;
    const onInput = () => {
      const n = now.current;
      if (n.bad && parseList(el.value).every(n.valid)) { setBadState(false); n.onRefusedChange(false); }
    };
    el.addEventListener('input', onInput);
    return () => el.removeEventListener('input', onInput);
  }, [round]);
  const knownSet = known ? new Set(known.map((o) => o.value)) : null;
  const add = (more: readonly string[]) => {
    const next = [...names];
    for (const n of more) if (!next.includes(n)) next.push(n);
    if (next.length !== names.length) onChange(next);
  };
  const commit = (text: string): boolean => {
    if (isDisabled) return false;
    const typed = parseList(text);
    if (typed.length === 0) {
      if (bad) setBad(false);
      return true;
    }
    if (!typed.every(valid)) {
      setBad(true);
      return false;
    }
    add(typed);
    if (bad) setBad(false);
    return true;
  };
  const options = known?.filter((o) => !names.includes(o.value));
  // A FormSection's fields: the field, then the tags, as its direct children (the section spaces them).
  return (
    <>
      <EntityPicker<string>
        key={round}
        aria-label={label}
        description={hint}
        inputRef={input}
        options={options}
        // Nothing is ever the field's own pick (an empty key would count as one, and closing the list would then
        // empty a refused name the person is to put right).
        value={undefined}
        onChange={(v) => {
          add([v]);
          if (bad) setBad(false);
          setRound((r) => r + 1);
        }}
        onCommitText={commit}
        isLoading={loading}
        error={error ?? undefined}
        onRetry={onRetry}
        isDisabled={isDisabled}
        errorMessage={bad ? invalidText : errorMessage}
      />
      <Row gap={1} wrap>
        {names.length === 0 ? (
          <Tag>{noneText}</Tag>
        ) : (
          names.map((n, i) => {
            // Only a list that was read can say a name is not on it.
            const missing = knownSet !== null && !knownSet.has(n);
            return (
              // By place: a stored rule may name one twice; removing takes that one only.
              <Tag key={`${i}:${n}`} tone={missing ? 'warn' : 'neutral'} {...(missing ? { tip: notFound } : {})} onRemove={() => onChange(names.filter((_, j) => j !== i))}>
                {n}
              </Tag>
            );
          })
        )}
      </Row>
    </>
  );
}
