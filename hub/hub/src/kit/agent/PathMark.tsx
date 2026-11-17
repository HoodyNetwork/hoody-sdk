// PathMark: a Linux path in a reply (md.ts `path`, paths.ts), drawn as written and actionable: a press
// (click, Enter or Space), a right-click or the ContextMenu key (Shift+F10 too) opens a kit menu at the path. Nothing runs, opens
// or reads without a choice from that menu. It offers Copy path (the target as written, `:line[:col]` kept) and, once the path is
// checked on the conversation's computer, Open, Show in Files and Open a terminal here;
// while the check runs, or when it can't answer, one line under Copy path says so.
import type { Target } from '@core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cx } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { ActionMenu, type MenuAction } from '../overlays/Overlays';
import { probeKey, sameProbed, usePathActions, usePathPlace, usePathProbe, type Probed } from './pathActions';
import { wholePath } from './paths';
import { useStrings } from '../strings';
import strings from './LinkMark.strings.en.json';
import s from './Conversation.module.css';

export function PathMark({ target, code }: { target: string; code?: boolean }) {
  const t = useStrings(strings);
  const [open, setOpenState] = useState(false);
  // Each opening of the menu is its own check: an answer from an earlier one is never reused.
  const [opening, setOpening] = useState(0);
  const isOpen = useRef(false);
  const setOpen = useCallback((v: boolean) => {
    if (v && !isOpen.current) setOpening((n) => n + 1);
    isOpen.current = v;
    setOpenState(v);
  }, []);
  // The path alone (no `:line[:col]`) is what is checked and opened; Copy keeps the target as written. The check's reads live
  // in PathProbe, mounted only while the menu is open on a computer it can check (none before a person opens it).
  const path = wholePath(target)?.path ?? target;
  const place = usePathPlace();
  const key = probeKey(opening, place, path);
  const [probed, setProbed] = useState<Probed | null>(null);
  const more = usePathActions(place, place.pre ?? (probed?.key === key ? probed.check : { k: 'checking' }));
  const items: MenuAction[] = [...more.items, { id: 'copy', label: t('path.copy'), icon: 'copy', copy: target, ...(more.why ? { description: more.why } : {}), onAction: () => undefined }];
  // The right-click and the menu key reach the path's own button (the one focusable thing here), listened for on its wrapper.
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setOpen(true);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('keydown', onKeyDown);
    };
  }, [setOpen]);
  const trigger = (
    <TextButton literal className={cx(s.pathOpen, code && s.pathCode)}>
      {code ? <code className={s.icode}>{target}</code> : target}
    </TextButton>
  );
  return (
    <span ref={wrap} className={s.pathMark} translate="no">
      {open && !place.pre && place.target && <PathProbe probe={key} path={path} target={place.target} realm={place.realm} onCheck={setProbed} />}
      <ActionMenu items={items} label={t('path.menu', { path: target })} trigger={trigger} isOpen={open} onOpenChange={setOpen} placement="bottom start" />
    </span>
  );
}

function PathProbe({ probe, path, target, realm, onCheck }: { probe: string; path: string; target: Target; realm: string; onCheck: (f: (prev: Probed | null) => Probed | null) => void }) {
  const check = usePathProbe(path, target, realm);
  useEffect(() => onCheck((prev) => {
    const next = { key: probe, check };
    return sameProbed(prev, next) ? prev : next;
  }));
  return null;
}
