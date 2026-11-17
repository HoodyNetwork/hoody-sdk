// Steps per system and the example picker: SystemSteps, one step that differs per system behind a picker of systems,
// and ExamplePicker, a choice over one CodeBlock. Use StepList instead for numbered how-to rows, Track for the
// stateful steps of a setup. Both pickers are full-width SegmentedControls (labels whole, a Select of the same choices
// when they don't fit, never cut) over a CodeBlock (masked on screen, Copy takes the real value).
import { type ReactNode, useState } from 'react';
import { hostEnv } from '../../core/host-env';
import { browserAgent } from './browserReads.web';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Stack } from '../layouts/Stack';
import { useSearchParam } from '../nav';
import type { ColouredLang } from './codeLang';
import { CodeBlock, type CodeLine } from './Ids';
import { StepNote } from './StepNote';

/** The systems the kit can tell apart from a browser. */
export const SYSTEM_IDS = ['mac', 'windows', 'linux', 'phone'] as const;
export type SystemId = (typeof SYSTEM_IDS)[number];

/** The system this browser runs on; Mac when it cannot tell. iPadOS reports a Mac with touch points, so a Mac with
 *  more than one touch point is a phone or tablet. */
export function systemOfAgent(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined): SystemId {
  const ua = nav?.userAgent ?? '';
  if (/Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (nav?.maxTouchPoints ?? 0) > 1)) return 'phone';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux|X11|CrOS/i.test(ua)) return 'linux';
  return 'mac';
}

/** One block of code: the kit CodeBlock's own label, language and text (shown masked, copied whole). Either `lines`
 *  (captioned steps, each with its Copy) or `code` (one command or call, copied whole). */
export type StepCode = {
  label: string;
  /** A command or a call in a named language. Not plain: a block that is not code (a link to open or share) gives
   *  `plain`, the reason it shows uncoloured, instead (std-codelang). */
  lang: ColouredLang;
  /** Shown uncoloured, for this reason (a link to open, not code to run); `lang` is then ignored. */
  plain?: string;
  wrap?: boolean;
  /** A `$ ` prompt before each line (shell commands); not copied. */
  prompt?: boolean;
  /** A line under the block: a link to the full reference, or the one fix for its placeholders. */
  footer?: ReactNode;
  /** Why Copy is off on a line holding a placeholder ("Pick a computer first"). */
  placeholderReason?: string;
} & ({ lines: readonly CodeLine[]; code?: undefined } | { code: string; lines?: undefined });

export interface SystemStep<K extends string = SystemId> {
  id: K;
  /** The picker's label for this system ("Mac"). */
  label: string;
  /** The one short step for this system: the picker's description, read with it. */
  step: ReactNode;
  /** At most one code block for the step. */
  code?: StepCode;
  /** One line on what this system needs first ("Needs rclone 1.61 or newer"). */
  need?: ReactNode;
  /** Anything else this system alone needs (a copy button, a Disclosure with a longer way). */
  more?: ReactNode;
}

export interface SystemStepsProps<K extends string = SystemId> {
  /** The picker's visible label ("Your device"). */
  label: string;
  systems: readonly SystemStep<K>[];
  /** The system shown first. Default: the browser's own (systemOfAgent) when offered, else the first. */
  first?: K;
  /** Controlled choice; without it SystemSteps keeps its own. */
  value?: K;
  onChange?: (id: K) => void;
}

/** The first choice: `first`, else the browser's system when offered, else the first system. */
export function firstSystem<K extends string>(systems: readonly { id: K }[], first?: K): K | undefined {
  if (first !== undefined && systems.some((s) => s.id === first)) return first;
  const own: string = systemOfAgent(hostEnv().browserPage !== true ? undefined : browserAgent());
  return systems.find((s) => s.id === own)?.id ?? systems[0]?.id;
}

/** A picker of the reader's systems (Mac, Windows, Linux, Phone, or the caller's own ids), the chosen system's one
 * short step as the picker's description, then at most one code block, a one-line prerequisite and the caller's extra
 * parts for that system. Every word comes from the caller, already resolved. Use StepList instead when the how-to is
 * several numbered actions that do not differ per system, Track for the stateful steps of a whole setup. */
export function SystemSteps<K extends string = SystemId>({ label, systems, first, value, onChange }: SystemStepsProps<K>) {
  const [own, setOwn] = useState<K | undefined>(() => firstSystem(systems, first));
  const chosen = systems.find((s) => s.id === (value ?? own)) ?? systems[0];
  if (!chosen) return null;
  const choose = (id: K) => {
    setOwn(id);
    onChange?.(id);
  };
  return (
    <Stack gap={2}>
      <SegmentedControl<K> label={label} showLabel fullWidth items={systems.map(({ id, label: l }) => ({ id, label: l }))} value={chosen.id} onChange={choose} description={chosen.step} />
      {chosen.code ? <StepBlock code={chosen.code} /> : null}
      {chosen.need ? <StepNote>{chosen.need}</StepNote> : null}
      {chosen.more}
    </Stack>
  );
}

export type Example<K extends string = string> = StepCode & {
  id: K;
  /** The picker's label for this example ("Python"). */
  name: string;
  /** One line about this example, under its code. */
  note?: ReactNode;
};

export interface ExamplePickerProps<K extends string = string> {
  /** The picker's accessible name ("Language"). */
  label: string;
  examples: readonly Example<K>[];
  /** Keep the choice in the URL under this search parameter (the first example leaves it clean). */
  param?: string;
  /** Controlled choice (ignored with `param`). */
  value?: K;
  onChange?: (id: K) => void;
}

/** A choice over one CodeBlock (a language, or a variant of one call): the code shows only for the chosen example,
 * and a single example shows with no picker. Use SystemSteps instead when the choice is the reader's system. */
export function ExamplePicker<K extends string = string>(props: ExamplePickerProps<K>) {
  return props.param ? <UrlExamples {...props} param={props.param} /> : <OwnExamples {...props} />;
}

function OwnExamples<K extends string>({ label, examples, value, onChange }: ExamplePickerProps<K>) {
  const [own, setOwn] = useState<K | undefined>(examples[0]?.id);
  const chosen = examples.find((e) => e.id === (value ?? own)) ?? examples[0];
  const choose = (id: K) => {
    setOwn(id);
    onChange?.(id);
  };
  return chosen ? <Examples label={label} examples={examples} chosen={chosen} control={{ value: chosen.id, onChange: choose }} /> : null;
}

/** The URL holds the choice: read it here, and the SegmentedControl writes it (the first example leaves it clean). */
function UrlExamples<K extends string>({ label, examples, param, onChange }: ExamplePickerProps<K> & { param: string }) {
  const [v] = useSearchParam(param);
  const chosen = examples.find((e) => e.id === v) ?? examples[0];
  return chosen ? <Examples label={label} examples={examples} chosen={chosen} control={{ param, ...(onChange ? { onChange } : {}) }} /> : null;
}

function Examples<K extends string>({ label, examples, chosen, control }: { label: string; examples: readonly Example<K>[]; chosen: Example<K>; control: { value?: K; param?: string; onChange?: (id: K) => void } }) {
  return (
    <Stack gap={2}>
      {examples.length > 1 ? <SegmentedControl<K> label={label} fullWidth items={examples.map(({ id, name }) => ({ id, label: name }))} {...control} /> : null}
      <StepBlock key={chosen.id} code={chosen} />
      {chosen.note ? <StepNote>{chosen.note}</StepNote> : null}
    </Stack>
  );
}

/** One step's code block. The language is a ColouredLang, or plain only with the caller's stated reason (`plain`). */
function StepBlock({ code }: { code: StepCode }) {
  const lang: ColouredLang = code.lang;
  // a plain block is uncoloured whole: a line's own `lang` would colour it again, so a plain block's lines drop theirs
  const text = code.lines ? { lines: code.plain ? code.lines.map(withoutLang) : code.lines } : { code: code.code };
  const rest = { label: code.label, wrap: code.wrap, prompt: code.prompt, footer: code.footer, placeholderReason: code.placeholderReason };
  return code.plain
    ? <CodeBlock {...text} {...rest} lang="plain" /> // reason: the caller's `plain` says why this block is not code (a link to open or share)
    : <CodeBlock {...text} {...rest} lang={lang} />;
}

function withoutLang(line: CodeLine): CodeLine {
  const { lang, ...rest } = line;
  void lang;
  return rest;
}
