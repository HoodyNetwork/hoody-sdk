// The rights list of "Choose rights": groups with a tri-state header and one checkbox per right.
// "Start from" only ticks boxes; what is sent is still the ticked rights.
// A share uses the same list with its own groups (product areas), a locked base, tags and a note per right, and
// toggles that keep prerequisites together (share-logic toggleRight); without those props it is the API-key list.
import { Checkbox, Combobox, Disclosure, Tag, useStrings } from "@kit";
import { useState } from "react";
import { groupState, groups, toggleGroup } from "../logic";
import strings from "../strings.en.json";
import type { Catalogue } from "../types";
import { groupName, rightName, tmplName } from "./words";
import s from "./keys.module.css";

export interface RightsArea {
  key: string;
  label: string;
  paths: readonly string[];
}

export interface RightsPickerProps {
  cat: Catalogue;
  ticked: readonly string[];
  onChange: (next: string[]) => void;
  error?: string;
  /** Groups in this order instead of the first path segment (a share's product areas). */
  areas?: readonly RightsArea[];
  /** Rights shown ticked and disabled with this hint (a share's base); they are never in `ticked`. */
  locked?: { paths: readonly string[]; hint: string };
  /** The tag labels of a right, shown under it. */
  tags?: (path: string) => readonly string[];
  /** One line under a right, such as what it also turns on. */
  note?: (path: string) => string | undefined;
  /** The ticks after one right is ticked or unticked (default: only that right changes). */
  toggle?: (ticked: readonly string[], path: string, on: boolean) => string[];
  /** Replaces the count line. */
  count?: string;
  /** A line beside a group's name ("2 of 5 · 1 can't be undone"), so a folded group never hides a risk. */
  groupNote?: (paths: readonly string[]) => string;
  /** Each group folds (phones); a group opens when it comes to hold a tick. */
  collapsible?: boolean;
  /** The words of a right (default: the API-key words). */
  name?: (path: string) => string;
  isDisabled?: boolean;
}

export function RightsPicker({
  cat,
  ticked,
  onChange,
  error,
  areas,
  locked,
  tags,
  note,
  toggle,
  count,
  groupNote,
  collapsible,
  name,
  isDisabled,
}: RightsPickerProps) {
  const t = useStrings(strings);
  const gs = areas ?? groups(cat.rights).map((g) => ({ key: g.key, label: groupName(t, g.key), paths: g.paths }));
  const isLocked = (p: string) => !!locked?.paths.includes(p);
  const words = name ?? ((p: string) => rightName(t, p));
  const flip = (list: readonly string[], p: string, on: boolean): string[] =>
    toggle ? toggle(list, p, on) : on ? [...list, p] : list.filter((x) => x !== p);
  const options = cat.templates.map((x) => ({
    value: x.name,
    label: tmplName(t, x.name),
  }));
  // A pick only ticks boxes (they can be changed after), so the box empties again: a new mount per pick.
  const [picks, setPicks] = useState(0);
  // Folded groups (phones): a group opens when it comes to hold a tick (a starting point picked, a needed right
  // turned on), and otherwise opens and closes as pressed.
  const heldKeys = gs.filter((g) => g.paths.some((p) => ticked.includes(p))).map((g) => g.key);
  const [open, setOpen] = useState<readonly string[]>(heldKeys);
  const [wasHeld, setWasHeld] = useState<readonly string[]>(heldKeys);
  if (heldKeys.join(",") !== wasHeld.join(",")) {
    const gained = heldKeys.filter((k) => !wasHeld.includes(k) && !open.includes(k));
    setWasHeld(heldKeys);
    if (gained.length) setOpen([...open, ...gained]);
  }
  return (
    <div className={s.rights}>
      {cat.templates.length > 0 && (
        <Combobox
          key={picks}
          label={t("nk.from")}
          placeholder={t("nk.fromPh")}
          options={options}
          value={undefined}
          onChange={(v) => {
            const tp = cat.templates.find((x) => x.name === v);
            if (!tp) return;
            onChange([...tp.rights]);
            setPicks((n) => n + 1);
          }}
        />
      )}
      <p
        className={s.rightsCount}
        role="status" // reason: live count of ticked rights
      >
        {count ?? t("nk.rightsCount", { count: ticked.length, of: cat.rights.length })}
      </p>
      {error && (
        <p
          className={s.fieldError}
          role="alert" // reason: field error under the picker
        >
          {error}
        </p>
      )}
      <div className={areas ? s.rightAreas : s.rightGroups}>
        {gs.map((g) => {
          const free = g.paths.filter((p) => !isLocked(p));
          const state = groupState(free, ticked);
          const head = (
            <Checkbox
              label={g.label}
              aria-label={t(areas ? "share.areaAll" : "nk.groupAll", { group: g.label, area: g.label })}
              isSelected={free.length > 0 && state === "all"}
              isIndeterminate={state === "some"}
              isDisabled={isDisabled || !free.length}
              onChange={(on) =>
                onChange(toggle ? free.reduce<string[]>((acc, p) => flip(acc, p, on), [...ticked]) : toggleGroup(g.paths, ticked, on))
              }
              className={s.rightHead}
            />
          );
          const list = (
            <div className={s.rightList}>
              {g.paths.map((p) => {
                const tg = tags?.(p) ?? [];
                const line = isLocked(p) ? locked?.hint : note?.(p);
                const box = (
                  <Checkbox
                    key={p}
                    label={words(p)}
                    isSelected={isLocked(p) || ticked.includes(p)}
                    isDisabled={isDisabled || isLocked(p)}
                    onChange={(on) => onChange(flip(ticked, p, on))}
                  />
                );
                if (!tg.length && !line) return box;
                return (
                  <div key={p} className={s.rightItem}>
                    {box}
                    <div className={s.rightMeta}>
                      {tg.map((x) => (
                        <Tag key={x} tone="warn">
                          {x}
                        </Tag>
                      ))}
                      {line && <span className={s.help}>{line}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
          const sub = groupNote?.(g.paths);
          if (collapsible)
            return (
              <Disclosure
                key={g.key}
                title={g.label}
                description={sub}
                isExpanded={open.includes(g.key)}
                onExpandedChange={(o) => setOpen((now) => (o ? [...now, g.key] : now.filter((k) => k !== g.key)))}
              >
                <fieldset className={s.rightGroup}>
                  <legend className={s.srOnly}>{g.label}</legend>
                  {head}
                  {list}
                </fieldset>
              </Disclosure>
            );
          return (
            <fieldset key={g.key} className={s.rightGroup}>
              <legend className={s.srOnly}>{g.label}</legend>
              {head}
              {sub && <span className={s.help}>{sub}</span>}
              {list}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
