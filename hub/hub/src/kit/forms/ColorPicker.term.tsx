// The colour field in the terminal: the presets as a radio row named as on the web (Coral, Sage ...; one Tab stop,
// arrows move the pick and wrap). Each preset is a swatch: (•)/( ) for the pick, a coloured block (prim FieldSwatch, the
// one data-colour path) and the colour's NAME, so it reads in mono and never by colour alone. Then the hex field that
// takes the API's vocabulary (#RGB, RGB, #RRGGBB, RRGGBB), with the block of the colour it holds beside it. A valid
// colour goes out as '#RRGGBB' in capitals; '' is no colour. The web's browser picker square has no terminal form: a
// custom colour is typed.
import { useRef, useState } from 'react';
import type * as Web from './ColorPicker';
import { Box, Pressable, Text, type Focusable } from '../../term/prim';
import { focusInk } from '../../term/prim/FocusInk';
import { FieldSwatch, dataColourAtTier } from '../../term/prim/FieldSwatch';
import { useStrings } from '../strings';
import strings from './ColorPicker.strings.en.json';
import { PRESET_COLORS, randomPresetColor } from './ColorPicker.pure';
import { TextField } from './fields';
import { normalizeHexColor } from './hexColor';
import { useFieldLock } from './lock';

export type { ColorPickerProps } from './ColorPicker';
export { PRESET_COLORS, randomPresetColor, normalizeHexColor };

export const ColorPicker: typeof Web.ColorPicker = ({ label, labelHidden, value, onChange, description, errorMessage, presets = PRESET_COLORS, accepts, isDisabled: disabledProp }) => {
  const t = useStrings(strings);
  const names: Readonly<Record<string, string>> = strings;
  const isDisabled = useFieldLock(disabledProp);
  const norm = normalizeHexColor(value);
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (!editing) setText(value);
  }
  const shownText = useRef(text);
  shownText.current = text;
  const pick = (next: string): void => { shownText.current = next; setSeen(next); setText(next); onChange(next); };
  const typed = (raw: string): void => {
    // The field echoes a value set from here (a preset pick) as an input; the same text is no edit (FieldInput report).
    if (raw === shownText.current) return;
    shownText.current = raw;
    const next = normalizeHexColor(raw) ?? raw;
    setText(raw);
    setSeen(next);
    onChange(next);
  };
  const selected = norm && presets.some((p) => normalizeHexColor(p) === norm) ? norm : undefined;
  const hexBad = !editing && text.trim() !== '' && !normalizeHexColor(text) && !accepts?.(text.trim());
  const options = presets.map((p) => {
    const c = normalizeHexColor(p) ?? p;
    return { value: c, label: names[`cp.c.${c.slice(1)}`] ?? c };
  });
  // One Tab stop (the picked swatch, else the first); arrows move the pick and the focus, wrapping, as React Aria does.
  const handles = useRef<Array<{ current: Focusable | null }>>([]);
  const at = Math.max(0, options.findIndex((o) => o.value === selected));
  const step = (i: number, by: 1 | -1): true => {
    const n = (i + by + options.length) % options.length;
    pick(options[n]!.value);
    handles.current[n]?.current?.focus();
    return true;
  };
  return (
    <Box dir="column" shrink={0}>
      {labelHidden ? null : <Text colour={isDisabled ? 'faint' : 'ink'}>{label}</Text>}
      <Box dir="row" wrap sem={{ role: 'radiogroup', name: label, description: typeof description === 'string' ? description : undefined, disabled: isDisabled || undefined }}>
        {options.map((o, i) => {
          const on = o.value === selected;
          const h = (handles.current[i] ??= { current: null });
          return (
            // Each swatch keeps two cells after it, as its own padding (wrapped lines of swatches sit together).
            <Box key={o.value} shrink={0} pad={{ right: 2 }}>
            <Pressable shrink={0} handle={h} disabled={isDisabled} tabStop={i === at} onPress={() => { if (!on) pick(o.value); }}
              onKey={(k) => (k.name === 'right' || k.name === 'down' ? step(i, 1) : k.name === 'left' || k.name === 'up' ? step(i, -1) : false)}
              sem={{ role: 'radio', name: o.label, checked: on }}>
              {({ focused }) => <Text colour={isDisabled ? 'faint' : 'ink'} {...focusInk(focused)}>{on ? '(•)' : '( )'} {!isDisabled && dataColourAtTier(o.value) ? <><FieldSwatch value={o.value} /> </> : null}{o.label}</Text>}
            </Pressable>
            </Box>
          );
        })}
      </Box>
      <Box dir="row" gap={1}>
        <Box width={30} maxWidth="100%" shrink={1}>
          <TextField
            label={t('cp.hex')}
            value={text}
            onChange={typed}
            onFocus={() => setEditing(true)}
            onBlur={() => { setEditing(false); setText(value); }}
            placeholder={t('cp.hexPlaceholder')}
            mono
            errorMessage={errorMessage ?? (hexBad ? t('cp.hexInvalid') : undefined)}
            validationBehavior={errorMessage ? 'aria' : 'native'}
            isDisabled={isDisabled}
          />
        </Box>
        {norm && !isDisabled ? <Box pad={{ top: 1 }}><FieldSwatch value={norm} cells={4} /></Box> : null}
      </Box>
      {description ? (typeof description === 'string' ? <Text colour="muted">{description}</Text> : description) : null}
    </Box>
  );
};
