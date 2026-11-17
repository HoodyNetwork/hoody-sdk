// "Run it from a terminal" on a script's Overview: the hoody CLI command and a curl line for this
// script (parts/runit.ts holds the facts), and "Test it in a terminal", which opens a new, empty temporary terminal on the
// computer. Nothing is typed in: the Hub can't prove a line reaches this script alone, so the
// person copies a line (the block's own Copy), fills it in where it says so and presses Enter.
import { AnatomySection, Band, CodeBlock, currentPlatformHosts, useStrings, type CodeLine, openOutside } from '@kit';
import { portAddress } from '@core';
import { useScriptsTarget } from '../data';
import type { CompScripts, ScriptItem } from '../types';
import { runLines, type RunNote } from './runit';
import strings from './RunIt.strings.en.json';

const NOTE: Record<RunNote, string> = {
  folder: 'run.note.folder', typed: 'run.note.typed', typedKeyed: 'run.note.typedKeyed', unknownKeyed: 'run.note.unknownKeyed', noName: 'run.note.noName', clash: 'run.note.clash', unroutable: 'run.note.unroutable',
};

/** A new, empty temporary terminal (terminal-0, `ephemeral`, like Computers' Open terminal): no `cmd`, nothing typed in. */
export function terminalUrl(base: string): string {
  if (!base) return '';
  try {
    const u = new URL(base);
    u.search = '';
    u.searchParams.set('ephemeral', 'true');
    return u.toString();
  } catch {
    return '';
  }
}

export function RunIt({ item, comp }: { item: ScriptItem; comp: CompScripts }) {
  const t = useStrings(strings);
  const target = useScriptsTarget();
  const r = runLines(item, comp, currentPlatformHosts());
  const lines: CodeLine[] = [
    ...(r.cli ? [{ code: r.cli.code, copy: r.cli.copy }] : []),
    ...(r.curl ? [{ code: r.curl.code, copy: r.curl.copy }] : []),
  ];
  // The terminal of the computer this page reads (never another one), only while it runs.
  const base = target && target.container?.id === comp.id ? portAddress(target.project, target.container, 0, 'terminal') : '';
  const url = terminalUrl(base);
  // No line to show (a file name no address can carry): only the reason, with no terminal to paste into and nothing to copy.
  const none = lines.length === 0;
  const off = comp.state !== 'on' ? t('run.off', { computer: comp.name }) : !url ? t('run.noTerminal', { computer: comp.name }) : undefined;
  return (
    <AnatomySection
      id="script-run"
      title={t('run.title')}
      description={t('run.lede')}
      {...(none ? {} : { info: t('run.testOpens', { computer: comp.name }) })}
      actions={none ? undefined : {
        primary: {
          id: 'script-run-terminal',
          label: t('run.test'),
          icon: 'external',
          ...(off ? { disabledReason: off } : {}),
          onPress: () => {
            if (!off) openOutside(url);
          },
        },
      }}
      notices={
        r.note || r.cli || (item.keyed && !none) || r.fill ? (
          <>
            {r.note ? <Band size="table">{t(NOTE[r.note] as never)}</Band> : null}
            {r.cli ? <Band size="table">{t('run.cliCheck')}</Band> : null}
            {item.keyed && !none ? <Band size="table">{t('run.key')}</Band> : null}
            {r.fill ? <Band size="table">{t('run.fill')}</Band> : null}
          </>
        ) : undefined
      }
      state={{ kind: 'ready' }}
    >
      {none ? null : <CodeBlock label={t('run.code')} prompt lang="shell" wrap lines={lines} />}
    </AnatomySection>
  );
}
