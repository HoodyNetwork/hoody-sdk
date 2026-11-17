// A skill's files: SKILL.md first, then every file the skill brings with it, as the agent lists
// them (`bundled_files`, relative to the skill's folder). SKILL.md opens here, read from the agent (`/skills/source`: the
// installed file's own bytes, so Download as SKILL.md and Raw are the file); an untrusted skill's text is shown, never run, and
// its images are not fetched (MarkdownViewer's rule). Every other file is a plain row (its path and kind): the agent returns
// only SKILL.md (`/skills/source` takes the skill's folder, never a file in it) and Files has no deep link (`links.file`),
// so there is nothing to open it with yet (a disabled Open would be a dead end).
import { AnatomySection, Band, Button, codeLangOfPath, Drawer, ItemList, MarkdownViewer, useStrings, type ItemProps } from '@kit';
import { useState } from 'react';
import { type SkillsAt, useSkillSource } from './data';
import type { SkillRow } from './logic';
import strings from './strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

/** The computer the page shows, as the AI tab has it: its name and handle from the shell's record, whether it runs, and the
 *  core target's link fields (a target without `server_name` gives ''). */
export interface ShownComputer {
  name: string;
  handle: string;
  /** The shell record's running flag; undefined when there is no record or it does not say. */
  running: boolean | undefined;
  link: { id: string; project_id: string; server_name: string } | null;
}

const KINDS = ['json', 'shell', 'js', 'ts', 'yaml', 'http', 'python', 'diff'] as const;
type Kind = (typeof KINDS)[number] | 'md' | 'other';

/** The file's kind as one word: the CodeBlock language of its extension, Markdown, or "File". */
function kindOf(path: string): Kind {
  const lang = codeLangOfPath(path);
  const known = KINDS.find((k) => k === lang);
  if (known) return known;
  return /\.(md|markdown)$/i.test(path) ? 'md' : 'other';
}

export function SkillFiles({ row, at, computer }: { row: SkillRow; at: SkillsAt; computer: ShownComputer | undefined }) {
  const t = useStrings(strings);
  const [reading, setReading] = useState(false);
  // Stopped only when the shell says so; an unknown state (no record, or no running flag) is not called stopped.
  const stopped = computer !== undefined && computer.name !== '' && computer.running === false;
  const stoppedReason = stopped ? t('files.stopped', { computer: computer.name }) : undefined;
  const kind = (path: string) => t(`files.kind.${kindOf(path)}`);
  const items: ItemProps[] = [
    {
      id: 'SKILL.md',
      title: 'SKILL.md',
      mono: true,
      leading: 'file',
      meta: [kind('SKILL.md')],
      actions: {
        inline: [{ id: 'read', label: t('files.read'), name: t('files.readName', { file: 'SKILL.md' }), opens: 'dialog', onPress: () => setReading(true), ...(stoppedReason ? { disabledReason: stoppedReason } : {}) }],
      },
    },
    ...row.files.map((path): ItemProps => ({ id: path, title: path, mono: true, leading: 'file', meta: [kind(path)] })),
  ];
  return (
    // Ready: the files are the list row's own (read with the skills list, whole), and SKILL.md is always there.
    <AnatomySection
      id="skill-files"
      title={t('files.title')}
      info={t('files.info')}
      {...(stoppedReason ? { description: stoppedReason } : {})}
      state={{ kind: 'ready' }}
      {...(row.files.length === 0 ? { note: t('files.none') } : {})}
    >
      <ItemList label={t('files.title')} items={items} />
      <SkillMdReader row={row} at={at} t={t} isOpen={reading} onOpenChange={setReading} />
    </AnatomySection>
  );
}

/** SKILL.md as the agent reads it, in a drawer. The read is in the drawer's body, so it runs only while the drawer is open. */
function SkillMdReader({ row, at, t, isOpen, onOpenChange }: { row: SkillRow; at: SkillsAt; t: T; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Drawer overlayId="ai-skill-read" resizeKey="ai-skill-read" isOpen={isOpen} onOpenChange={onOpenChange} title={t('files.readTitle', { name: row.name })} size="lg">
      {isOpen && <SkillMd row={row} at={at} t={t} />}
    </Drawer>
  );
}

function SkillMd({ row, at, t }: { row: SkillRow; at: SkillsAt; t: T }) {
  const src = useSkillSource(at, row);
  // An answer that carried no text is said as that (never shown as an empty file, nor as a network failure).
  if (!src.isPending && !src.error && src.data === null) {
    return (
      <Band
        // noDetails: the agent answered, without the file's text; there is no rejection to show.
        tone="warn"
        actions={<Button size="sm" onPress={() => void src.refetch()}>{t('files.readAgain')}</Button>}
      >
        {t('files.readBad')}
      </Band>
    );
  }
  return (
    <MarkdownViewer
      label={t('files.readLabel')}
      loading={src.isPending}
      error={src.error ?? undefined}
      onRetry={() => void src.refetch()}
      {...(typeof src.data === 'string' ? { source: src.data } : {})}
    />
  );
}
