# QR codes

The web's `Qr.tsx` has a sibling: `src/kit/qr/Qr.term.tsx`. Shared code that renders `QrPanel`, `QrButton` or
`QrCode` works in the terminal unchanged. The drawing prim is `Qr` in `src/term/prim/Qr.ts`.

## How a code is drawn

- One cell per module across. Two modules per row, with half-block characters.
- The quiet zone is exactly 4 modules on every side (`QR_QUIET`). It is part of the drawing.
- Size in cells, from `qrCells(size)`: columns = size + 8, rows = (size + 8) / 2 rounded up.
- Black on white in the truecolor and ansi16 tiers, so a phone reads it on any terminal theme. In mono it uses the
  terminal's own foreground and background.
- A code is never shrunk, wrapped or cut. A cut code does not scan.

## The smallest pane for a 2FA code

The API's 2FA address is `otpauth://totp/Hoody (<username>)?secret=<52 base32 characters>&issuer=Hoody`, at error
correction M. Its length depends on the username, so the code's version does too.

| Username | Version, modules | Code alone | Keyed panel |
|---|---|---|---|
| short | 6, 41 | 49 cols × 25 rows | 49 × 27 |
| 24 characters | 7, 45 | 53 × 27 | 53 × 29 |
| 50 characters (the longest) | 8, 49 | 57 × 29 | 57 × 31 |

A keyed panel adds one line above the code (the word "Key") and one below (the caution line marked `!`).

**A pane that must show any account's 2FA code is at least 57 columns by 31 rows.**

Consequences:

- An 80x24 terminal can never show a 2FA code: the shortest one needs 25 rows for the code alone.
- A 120x40 terminal can.

## When the pane is too small

The panel does not draw the code. It:

1. says how many cells the code needs;
2. shows the hand-off line to open the address on the web;
3. leaves the page's manual key usable, so 2FA setup can still be finished by typing the key.

One exception: inside the QR dialog a hand-off opens with its `r` key ([handoff.md](handoff.md)), only the first
line is shown. The address and the copy key are already right below the dialog's code, so no second hand-off is
drawn there.

Design a page so the manual key is always reachable. Do not hide it behind the code.

## Secret rules

The same as for a shown secret ([forms.md](forms.md)):

- A secret address shows neither code nor address until Show (`s` or the button). Copy works without Show.
- What the screen allows is asked as a secret field asks it (`src/term/app/secret-screen-ctx.ts`). A `QrPanel` asks
  at each Show and each Copy of a secret address. A secret code a page draws itself (`QrCode` with `secret`, the 2FA
  image in a `QrSecret`) is asked each time it is drawn. Refused, nothing is drawn or copied and the field's own line
  says why. The code inside a `QrPanel` is not asked again: the panel asked at Show, or its caller made no secret
  (`secret={false}`).
- A hidden code is a hatched box of the code's size. It is never a blurred look-alike: in cells a look-alike is a
  real-looking code a phone would scan.
- A shown `QrPanel` address hides again on terminal blur, when the host is hidden, and after the field's idle time
  with no key press. So does a secret code a page shows itself after its own Show (the Bot key share's keyed code,
  the share token's code): the page calls the kit's `useRevealGuard(shown, hide)`, which turns its Show off by the
  same rules.
- Everything drawn is wiped when the surface closes, on route change, on page hide, when the address changes and
  on unmount. One QR surface is open at a time.
- The semantics tree never holds a module. The code is one `img` node named by its label, with the state hidden or
  filled, described by the caution line.
- The semantics tree never holds a secret address, shown or not. A shown secret address is one `group` node with the
  states secret and filled, as a shown `SecretField` value is.

## Using the prim directly

```tsx
import { Qr, qrCells } from '../../term/prim/Qr';

const need = qrCells(modules.size);            // { cols, rows }
const pane = usePaneSize();
return pane.cols >= need.cols && pane.rows >= need.rows ? <Qr modules={modules} /> : <TooSmall need={need} />;
```

`modules` is `{ size, dark(row, col) }`. Prefer the kit `QrPanel`: it carries the size check
and the secret rules.

Tests: `src/kit/qr/Qr.term.test.tsx`, `src/kit/qr/Qr.secret.term.test.tsx` (the screen rules),
`src/pages/bots/parts/keyShare.reveal.term.test.tsx` and `src/pages/keys/tokenQr.hide.term.test.tsx` (a page's code
hiding again), scenarios in `src/kit/qr/Qr.scenario.ts`.
