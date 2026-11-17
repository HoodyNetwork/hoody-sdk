// Edit an alias: its name, and for an alias that goes to a port (http/https) that port. An alias that goes to a Hoody
// program (a terminal, a desktop) can only be renamed here. One PATCH with only what changed (never a PUT: the API
// serves none on this route); a port sent alone keeps the alias's program. The change is sent once (C9): a lost
// answer is held under the alias's own lock (shared with its remove) until a fresh alias list shows what was sent or
// the person dismisses it after the warning; it is never sent again and never reported as failed.
// A rename changes the address, so the drawer says the old one stops working before anything is sent.
import { aliasAtPort, aliasProblem } from '@core';
import { Band, Drawer, FormFooter, Notice, Stack, TextField, useStrings } from '@kit';
import { useEffect, useState } from 'react';
import { useAliases, useEditAlias, useRuntime, type EditAliasVars } from '../data';
import { bucket } from '../logic';
import type { Computer } from '../types';
import strings from './AliasEdit.strings.en.json';
import { aliasSender } from './aliasHold';
import { KIT_PORTS } from './Firewall.logic';
import { Held } from './Held';
import { refusal, useRunner } from './runner';

/** A typed port as the API takes it: digits only, 1 to 65535; null for anything else. */
export const editPort = (v: string): number | null => {
  const n = /^[0-9]{1,5}$/.test(v) ? Number(v) : 0;
  return n >= 1 && n <= 65535 ? n : null;
};

/** What an edit sends: only the values that differ from the alias as listed; null when nothing does. The port is only
 *  ever sent for an alias that goes to a port. */
export function editChange(row: { name: string; port: number; program?: string }, name: string, port: number | null): { name?: string; port?: number } | null {
  const out: { name?: string; port?: number } = {};
  if (name !== row.name) out.name = name;
  if (aliasAtPort(row) && port !== null && port !== row.port) out.port = port;
  return out.name === undefined && out.port === undefined ? null : out;
}

export function AliasEditDrawer({ c, alias, onClose }: { c: Computer | null; alias: string | null; onClose: () => void }) {
  const t = useStrings(strings);
  const aliases = useAliases(c?.id);
  const row = alias === null ? undefined : aliases.data?.find((a) => a.id === alias);
  const edit = useRunner(useEditAlias(), {
    lock: 'proxy.alias',
    change: 'aliasEdit',
    guess: aliasSender,
    pick: (i) => i.alias === alias,
    vars: (i): EditAliasVars => ({
      id: String(i.computer ?? ''),
      alias: String(i.alias ?? ''),
      ...(typeof i.name === 'string' ? { name: i.name } : {}),
      ...(typeof i.port === 'number' ? { port: i.port } : {}),
    }),
  });
  const [name, setName] = useState('');
  const [typed, setTyped] = useState('');
  // The name the last refused send carried: "already in use" is said only while the field still holds it.
  const [refusedName, setRefusedName] = useState<string | null>(null);
  // The form starts from the alias as listed: when the drawer opens on an alias, and once its row has been read.
  const known = row !== undefined;
  useEffect(() => {
    setName(row?.name ?? '');
    setTyped(row && aliasAtPort(row) ? String(row.port) : '');
    setRefusedName(null);
    edit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id, alias, known]);

  const atPort = row !== undefined && aliasAtPort(row);
  const port = atPort ? editPort(typed) : null;
  const change = row ? editChange(row, name, port) : null;
  const portChanged = change?.port !== undefined;
  // A port Hoody uses takes no alias (the create drawer's rule): the fixed list of the kits' ports whatever the
  // computer's state, and, while it runs, what its listeners say. Asked only for a port the person changed; nothing is
  // sent while that read is out, and a read that failed refuses nothing.
  const running = c !== null && bucket(c.status) === 'running';
  const runtime = useRuntime(c?.id, running && alias !== null);
  const listenersRead = !running || ((runtime.data !== undefined || runtime.isError) && !runtime.isFetching);
  const hoodyPort = portChanged && port !== null && (KIT_PORTS.includes(port) || (running && (!!runtime.data?.yours.some((l) => l.port === port && l.kit) || !!runtime.data?.system.includes(port))));
  // The name as listed is never judged again (an alias made under older rules keeps its name while its port changes).
  const problem = row !== undefined && name === row.name ? null : aliasProblem(name);
  const portBad = atPort && port === null;
  const waiting = portChanged && !hoodyPort && !listenersRead;
  const valid = row !== undefined && problem === null && !portBad && !hoodyPort && !waiting;
  const reason = !row
    ? undefined
    : problem !== null
      ? t('edit.reason.name')
      : portBad || hoodyPort
        ? t('edit.reason.port')
        : waiting
          ? t('edit.reason.wait')
          : change === null
            ? t('edit.same')
            : undefined;
  const failed = refusal(edit.outcome);
  const taken = failed?.code === 'ALIAS_IN_USE' && refusedName !== null && refusedName === name;
  const check = async () => { await edit.check(); };
  return (
    <Drawer overlayId="computers-alias-edit" resizeKey="computers-alias-edit"
      isOpen={c !== null && alias !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t('edit.title', { name: row?.name ?? '' })}
      subtitle={t('edit.lede')}
      size="sm"
      dirty={change !== null && !edit.held}
      footer={
        <FormFooter
          dirty={change !== null && !edit.held}
          submitDisabled={edit.held !== null || !valid || change === null}
          busy={edit.busy}
          outcome={edit.held ? undefined : edit.outcome}
          error={failed}
          failedDetail={taken ? t('edit.taken') : undefined}
          reason={edit.held ? undefined : reason}
          onCheck={check}
          submitLabel={t('edit.go')}
          onSubmit={() => {
            if (!c || alias === null || !valid || change === null || edit.held) return;
            const sent = change;
            void edit.run({ id: c.id, alias, ...sent }).then((r) => {
              if (r.outcome === 'done') onClose();
              else setRefusedName(r.outcome === 'failed' && sent.name !== undefined ? sent.name : null);
            });
          }}
        />
      }
    >
      {edit.held ? (
        <Held
          kind="aliasRemove"
          name={row?.name ?? ''}
          text={t('edit.held', { name: typeof edit.held.name === 'string' ? edit.held.name : (row?.name ?? '') })}
          elsewhere={edit.elsewhere}
          onCheck={check}
          onDismiss={edit.dismiss}
        />
      ) : !row ? (
        // The list no longer holds the alias (removed meanwhile) or has not answered: nothing to edit, nothing is sent.
        aliases.dataUpdatedAt > 0 ? <Notice>{t('edit.gone')}</Notice> : null
      ) : (
        <Stack gap={3}>
          <TextField
            label={t('edit.name')}
            value={name}
            onChange={(v) => setName(v.toLowerCase())}
            description={t('edit.rule')}
            errorMessage={problem ? t(problem === 'reserved' ? 'edit.reserved' : 'edit.rule') : taken ? t('edit.taken') : undefined}
          />
          {atPort ? (
            <TextField
              label={t('edit.port')}
              value={typed}
              onChange={(v) => setTyped(v.trim())}
              inputMode="numeric"
              errorMessage={hoodyPort ? t('edit.kit', { port: port ?? 0 }) : portBad ? t('edit.portRule') : undefined}
            />
          ) : (
            <Notice>{t('edit.program', { program: row.program ?? '' })}</Notice>
          )}
          {change?.name !== undefined && problem === null ? (
            <Band tone="warn" /* noDetails: says what a rename does; nothing was sent */>
              {t('edit.rename', { old: row.name })} {t('edit.cname', { old: row.name })}
            </Band>
          ) : null}
        </Stack>
      )}
    </Drawer>
  );
}
