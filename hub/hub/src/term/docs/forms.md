# Forms and secrets

## Use the kit fields

Every kit field has a sibling. Shared code that renders `<TextField>`, `<Select>` or `<Form>` works in the terminal
unchanged. A port writes its own field only when the kit has none.

| Web import | Terminal sibling | Exports drawn |
|---|---|---|
| `src/kit/forms/fields.tsx` | `src/kit/forms/fields.term.tsx` | `TextField`, `SearchField`, `Switch`, `Checkbox`, `RuleChecklist` |
| `src/kit/forms/more.tsx` | `src/kit/forms/more.term.tsx` | `NumberField`, `Select`, `Combobox`, `EntityPicker`, `RadioGroup`, `Form`, `FormFooter`, `TimeField` |
| `src/kit/forms/Secret.tsx` | `src/kit/forms/Secret.term.tsx` | `SecretField` (show a held secret), `SecretInput` (type one) |

Other siblings in `src/kit/forms`: `CodeEditor`, `ColorPicker`, `DateField`, `DatePickButton`, `DateTimeField`,
`EnvRows`, `IpAllowlistField`, `OtpField`, `Outcome`, `PathField`, `SettingGroup`, `SettingRow`, `SshKeyHelp`.

## How a field is drawn

```
Name *
▌atlas
  Shown in the sidebar.
```

- Line 1: the label. A required field has ` *`. Read-only and unavailable are words in brackets.
- Line 2: a left rule and the control. The rule is `▌` when focused, `✗` when invalid, `│` otherwise.
- Line 3: the description, or the error with a `✗` mark.

Every state is a mark or a word. Nothing depends on colour.

Field widths in cells (`FIELD_CELLS` in `src/kit/forms/termField.tsx`): `xs` 16, `sm` 30, `md` 45, `lg` 60.
`full` and no width fill the row. The width sizes the control only. The label and the error may run past it.

## Building a field the kit lacks

Terminal-only field parts are in `src/kit/forms/termField.tsx`. Web code never imports it.

| Export | Purpose |
|---|---|
| `FieldFrame` | Label line, the control, description or error. Props: `label`, `required`, `disabled`, `readOnly`, `description`, `error`, `reserveError`, `width`. |
| `ControlRow` | The left rule beside a control. Props: `focused`, `invalid`, `disabled`. |
| `fieldSem` | The `sem` of a field from its label, description, error, `invalid`, `required`. |
| `useValidation` | The web's validation timing: an error shows after a submit attempt or after the field is left changed, then follows edits. |
| `useTermForm` | The enclosing form, or null. |
| `useSubmitTarget` | What a submit button calls. |
| `domKey` | A terminal key as the part of a DOM `KeyboardEvent` that web `onKeyDown` props read. |
| `say` | A string or number as a `Text`; an element as it is. |

A second helper named `say` exists in `src/kit/layouts/termParts.tsx` with a different signature. Check which one
you import.

Skeleton:

```tsx
import { FieldInput } from '../../term/prim/FieldInput';
import { ControlRow, FieldFrame, fieldSem } from './termField';

export const SlugField: typeof Web.SlugField = ({ label, value, onChange, description, errorMessage, isRequired, isDisabled }) => {
  const [focused, setFocused] = useState(false);
  return (
    <FieldFrame label={label} required={isRequired} disabled={isDisabled} description={description} error={errorMessage} width="md">
      <ControlRow focused={focused} invalid={!!errorMessage} disabled={isDisabled}>
        <FieldInput value={value} onChange={onChange} disabled={isDisabled} grow={1} onFocusChange={setFocused}
          sem={fieldSem({ label, description, error: errorMessage, invalid: !!errorMessage, required: isRequired })} />
      </ControlRow>
    </FieldFrame>
  );
};
```

Compare with `TextField` in `src/kit/forms/fields.term.tsx` before copying.

## Form behaviour

The terminal `Form` follows the web's:

- Enter in a single-line field submits the form. Enter in a multiline field is a new line.
- Enter submits nothing while the form's submit button is off (disabled or busy), as a browser does. A `Form` takes
  one submit button: `FormFooter`'s Save, or one `type="submit"` `Button`. With two, the first mounted counts, not the
  first drawn.
- A submit runs validation first. The first invalid field gets the focus.
- A field that clears itself after a submit (`OtpField`) listens with `useTermForm().onSubmitted`: it hears every
  submit (Enter, a submit button, `requestSubmit`), never a refused one.
- Server field errors arrive by field name through `fieldErrors`.
- A page's own `errorMessage` shows at once and never blocks the submit.
- `busy` and `locked` make the fields inert.

Raw `<form>` elements drawn by the compat runtime submit through the same path (`submitRawForm` in
`src/term/jsx/dom.ts`).

## Text entry prims

| Prim | Use for |
|---|---|
| `FieldInput` | Every kit text field. `mask` draws bullets. `lines` > 1 is multiline. `readOnly` allows focus and movement, no edits. |
| `TextInput` | The shell's own inputs. Not for kit fields. |
| `SecretInput` (prim) | Typing a secret. |
| `Compose` | A chat message editor. |

Editing keys follow the engine's: arrows, Home/End, Ctrl+A/E, word jumps with Alt or Ctrl + arrows, Ctrl+W, Ctrl+U,
Ctrl+K, undo and redo. A masked field edits exactly like a plain one.

## Secrets

Rules. The secret gate and the tests hold them.

1. **A typed secret is a `SecretInput`.** Never a `FieldInput` with your own masking.
2. **The value is in a frame only while the person has pressed Show.** Masked, the frame holds one bullet per
   character, so a frame capture or screenshot of a masked field never sees it. Revealed, the screen shows it on
   purpose; it masks again on Hide, on terminal blur (rule 7) and on a wipe.
3. **The value is never in the semantics tree, revealed included.** What the screen shows on purpose is not what an
   agent-readable export, a snapshot or a log may carry. A `SecretInput` is `textbox "Password" =<secret>` (or
   `=<empty secret>`) in every state; a `SecretField` (a minted key, backup codes) is `group "API key" =<secret>`
   with its buttons and no text beneath; an `OtpField` is a secret textbox too (a one-time code is a credential).
   So is a `TextField` with `autoComplete="one-time-code"` (a 6-digit or backup code typed as text): it is masked as
   typed and wiped like a `type="password"` field, with no Show.
   Proof: `src/kit/forms/Secret.sem.term.test.tsx`, `src/kit/forms/TextField.oneTime.term.test.tsx`, and the
   term-only scenario cases in `Secret.scenario.ts` and `OtpField.scenario.ts`. On the web the shown value is page
   text (a browser does that); those cases are web-only.
4. **No copy from an entry field.** Ctrl+C and Ctrl+X in a `SecretInput` are taken and dropped.
5. **Wipe on leave.** The prim calls `onChange('')` when `wipeOn` changes and when it unmounts, unless
   `keepOnUnmount`. Pass the same value the web passes to `useWipeOn`.
6. **Logs get `describeSecret(value)`**, which is `[secret: set]` or `[secret: empty]`. Never the value.
7. **A shown secret masks itself** when the terminal window loses focus (`useTerminalBlur`).

### What the secret gate drives

`bun scripts/term/secrets.ts [<page>…]` (from `hub/`, `NODE_ENV=test`). It is also the `secrets` gate of `check.ts`. For every page case it:

1. Draws the case at 120x40, then at 80x24.
2. Types a canary into every secret input. An OTP or code field gets six digits. A `/typed@80x24` state is drawn.
3. Presses every reveal control (`Show`, `Show codes`, `Show what you typed`, and any `Show…` inside a secret node) and
   draws `/revealed@80x24` and `/revealed@120x40`.
4. Searches every state for the page's fixture secrets and the canaries.

Where it searches:
- the frame, the semantics text and its JSON;
- console and stdio;
- the clipboard (OSC 52) and the terminal title;
- diagnostics and the unsettled text.

What counts as a hit:
- an exact value;
- the value split over lines or spaced out;
- an 8+ character prefix;
- a key named like a secret (`client_secret`, `*_token`, `*_password`).

In a revealed state only the frame cells inside the secret node may hold the value. Reports never print a value: they
name it by key, length and a sha256 prefix.

A secret state that no fixture state draws (a mint's one-time view, a setup sheet) is reached by a **flow**: a row in
`SECRET_FLOWS` in `scripts/term/secrets.ts`, pressing and typing by accessible name from a case. A step that finds no
control fails the gate, so a renamed button cannot switch a flow off. A page in `SECRET_PAGES` (account, bots, keys,
vault) with no reveal control driven fails too. A new page that shows or takes a secret: add it to both.

Real output (`keys`):

```
ok    keys: 104 cases, 210 states, 1 reveals, 0 canaries, 2 needles (token 2), 0 leaks, 46.4 s
secrets: 1 pages, 104 cases, 210 states, 1 reveal controls driven, 0 canaries typed, 2 needles, 0 leaks, 0 errors, 0 stale allow rows
```

Showing a held secret is the kit `SecretField`: one tab stop on the value box. `s`, Enter or Space shows and
hides. `c` copies through the terminal (OSC 52).

### Copy policy

What goes to the clipboard:
- Only on an explicit person action: `c` on a `SecretField`, its Copy button, or a page's own Copy control. Nothing
  copies on a timer, on mount, on show or on focus. An entry field (`SecretInput`) never copies (rule 4).
- The value the person sees as the secret (a key, the backup codes joined by LF, an `export HOODY_TOKEN=…` line the
  page built), passed through `safeCopyText` (`src/term/prim/safe.ts`): control characters other than LF and TAB and
  invisible format characters removed, CR LF made LF; refused (nothing copied) when empty or over 64 KiB
  (`MAX_COPY_BYTES`).
- The Hub never reads the clipboard. Paste reaches it only as bracketed paste typed into a focused field.

By which mechanism:
- In a terminal: the `copy` from `useClipboard()` in `src/term/prim/clipboard.ts`, the one seam. It is bound to its
  mount: a late answer after the session ended copies nothing. The renderer writes an OSC 52 sequence to
  the terminal (`copyToClipboardOSC52`). Over SSH, tmux or screen, that sequence travels to the person's terminal
  emulator, which decides: it may put the text on the local system clipboard, keep it in its own buffer, ask, or
  ignore it. The Hub cannot tell which; "Copied" means the terminal was asked, not that a clipboard holds it.
- With a host that provides a `copy` service (`src/term/env/session.ts`, `clipboard.write`): the host puts the text
  on its own or the OS clipboard, after the same `safeCopyText`.
- Copied text is never kept by the Hub: no log, no history, no diagnostic (tests spy on the renderer: `copiesOf`).

What a wipe cannot do: once copied, the text is outside the Hub. A wipe (`useWipeOn`, leaving the page, sign-out,
realm switch, `dropOnHide`, terminal blur) drops the Hub's own copy of the value and masks the screen; it cannot
retract the clipboard, a terminal multiplexer's buffer, a remote terminal's clipboard or a clipboard manager's history.
Pages that copy a credential keep the web's wording ("Copy it now: it won't be shown again") and never promise more.

### The secret gate

```
bun scripts/term/secrets.ts schedules
```

It draws every case of the named pages at 120x40 (every page when none is named) and searches the frame, the
semantics text and the semantics JSON for:

- every string the page's fixtures answered under a secret-named key (`token`, `password`, `api_key`, ...), or with
  a token shape (`hdy_`, `hbk_`, `sk-`, ...), 12 characters or longer;
- the same over the string literals of the page's `fixtures.ts`.

Exit 1 on a leak. A leak is reported by key, length and a hash prefix, never by value. `--json` prints a
machine-readable result. A reviewed exception is a row in `scripts/term/secrets.allow.json`
(`{ "<page>/<case>/<sha12>": "why" }`). That file does not exist yet: create it with the first exception. A row
that matches nothing fails.

<!-- docs-check: absent scripts/term/secrets.allow.json -->
