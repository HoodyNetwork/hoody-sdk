// The focal point of Home: one input whose question starts a NEW conversation in the shell's Ask dock
// (sent as its first message; the conversation open before stays in Recent, untouched), then shows
// the dock on it. Its submit is the page's one primary button: one press, one start. The text stays
// here until the agent took it; not sent, or maybe sent (C9), the box keeps it and says so. The
// chips only fill the input; they never send. While the dock is open the card hands off to it: one
// line saying Agent is open and a Go to Agent button (into the dock's composer), never a second composer
// beside the dock's own.
import { Button, TextField, Widget, askOn, cx, useAskDock, useIsPhone, useStrings, type AskStartOutcome } from '@kit';
import { hostEnv } from '@core';
import { useCallback, useEffect, useRef, useState } from 'react';
import strings from '../strings.en.json';
import { useAskPrefill } from './askDock';
import s from './parts.module.css';

// Starter ideas (each one the shipped Agent can finish with its own tools). A chip
// fills the box and never sends; 'bot' is open: it starts the sentence and the person finishes it. Each is drawn as a
// chat bubble but stays a button in a list, and the row wraps onto more rows instead of scrolling sideways.
const CHIPS = ['agents', 'online', 'running', 'backup', 'bot'] as const;

export function AskStrip({ name, bare }: { name: string; bare?: boolean }) {
  const t = useStrings(strings);
  const open = useAskPrefill();
  const dock = useAskDock();
  const phone = useIsPhone();
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<AskStartOutcome | null>(null);
  // The box itself (the kit field's inputRef: the same element on the web, the field's handle in a terminal).
  const inputRef = useRef<HTMLInputElement>(null);
  // The box's words and the 'running' chip name the computer only while that name is known (never a raw {{name}}
  // or "Ask  to…").
  const named = String(name ?? '').trim() !== '';
  const chips = CHIPS.filter((id) => id !== 'running' || named);
  // A chip's words into the box, then focus there with the cursor at the end, so the person can finish or edit them.
  const toEnd = useCallback((v: string) => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(v.length, v.length);
  }, []);
  // A web page waits a frame (the box holds the words by then). A terminal has no frames: after the commit, below.
  const [picked, setPicked] = useState<{ v: string } | null>(null);
  const pick = (v: string) => {
    setText(v);
    if (hostEnv().browserPage === true) requestAnimationFrame(() => toEnd(v));
    else setPicked({ v });
  };
  useEffect(() => {
    if (picked) toEnd(picked.v);
  }, [picked, toEnd]);
  // One start in flight at a time: a second press (a double click) starts nothing.
  const busy = useRef(false);
  const submit = () => {
    const q = text.trim();
    if (!q) { open(''); return; }
    if (busy.current) return;
    busy.current = true;
    setOutcome(null);
    open(q, (o) => {
      busy.current = false;
      if (o === 'sent') { setText((cur) => (cur.trim() === q ? '' : cur)); setOutcome(null); }
      else setOutcome(o);
    });
  };
  // One status line, mounted empty from the start and kept in the same place whether the dock is open or not (the
  // card's body changes around it), so a screen reader announces the words when they come.
  const said = <p className={cx(s.askNote, !outcome && s.askNoteEmpty)} role="status">{outcome ? t(outcome === 'unknown' ? 'ask.startUnknown' : 'ask.startNotSent') : ''}</p>; // reason: an always-mounted live region for a start's C9 outcome; the kit Outcome mounts only with an outcome and words saves
  // Ask is off until a live turn is proven: no input that would do nothing.
  if (!askOn()) return null;
  if (dock.isOpen) {
    const line = (
      <div className={s.askOpen}>
        <p className={s.askOpenText}>{t(phone ? 'ask.open.phone' : 'ask.open')}</p>
        <Button variant="secondary" onPress={() => dock.focus()}>
          {t('ask.open.focus')}
        </Button>
      </div>
    );
    return bare ? <>{line}{said}</> : <Widget size="l" fit className={s.askCard}>{line}{said}</Widget>;
  }
  const form = (
    <form
      className={s.ask}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={s.askRow}>
        <TextField className={s.askField} aria-label={named ? t('ask.label', { name }) : t('ask.labelNoName')} placeholder={named ? t('ask.placeholder', { name }) : t('ask.placeholderNoName')} value={text} onChange={setText} inputRef={inputRef} />
        <Button type="submit" variant="primary" size="toolbar" className={s.askBtn}>
          {t('ask.submit')}
        </Button>
      </div>
      <ul className={s.chips} aria-label={t('ask.chips')}>
        {chips.map((id) => (
          <li key={id}>
            <Button variant="bubble" onPress={() => pick(id === 'bot' ? t('ask.chip.botStart') : t(`ask.chip.${id}`, { name }))}>
              {t(`ask.chip.${id}`, { name })}
            </Button>
          </li>
        ))}
      </ul>
    </form>
  );
  return bare ? <>{form}{said}</> : (
    <Widget size="l" className={s.askCard}>
      {form}
      {said}
    </Widget>
  );
}
