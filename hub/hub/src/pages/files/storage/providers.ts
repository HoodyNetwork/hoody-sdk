// The storage providers and the fields each one asks for, as the files program takes them (its openapi
// POST /api/v1/backends/<type>; flat bodies). One table drives the form, the body and what is secret. First the
// key-based ones. Then the sign-in ones (Drive, Dropbox, OneDrive, pCloud, Box), which take a token the person
// makes with rclone on their own machine and pastes (the program has no sign-in flow of its own), optionally with
// their own client id and secret (blank: rclone's shared one, which is being retired). Every other type the program
// can connect has a form generated from its openapi (generate.ts → providers.gen.json).
import gen from './providers.gen.json';
import type { GenField, GenTable } from './generate';

/** A hand-made type, or one of the generated ones (providers.gen.json). */
export type ProviderId = string;
const GEN = gen as GenTable;
export interface Field {
  /** The body key the program takes. */
  key: string;
  /** token: rclone's token text, pasted (a secret spanning lines, sent as printed: logic.ts tokenText). number: a
   *  port; int: any other whole number; boolean: sent only when set against the program's default. */
  kind: 'text' | 'secret' | 'number' | 'int' | 'boolean' | 'select' | 'pem' | 'token';
  required?: boolean;
  /** Prefilled (never for a secret). */
  initial?: string;
  options?: readonly string[];
  /** An address (URL or host): a password or token inside it is refused. */
  address?: boolean;
  /** Sent only with this other field filled (a client secret needs its client id, and the reverse where the provider
   *  refreshes tokens with the secret). */
  needs?: string;
  /** A plain name (letters, digits, dot, dash, underscore): it is shown inside a shell command (logic.ts NAME). */
  name?: boolean;
  /** Generated fields: their words come from the openapi, not the page's strings. */
  label?: string;
  hint?: string;
  /** The program's own value when the field is left empty (shown, never sent). */
  default?: string | number | boolean;
  /** Suggested values, never a closed list. */
  suggest?: readonly string[];
  /** Under "More options". */
  more?: boolean;
}
export interface Provider {
  id: ProviderId;
  /** A generated type's name (hand-made ones are named by the page's strings). */
  label?: string;
  /** Sent as they are, never shown (a value the program takes no other of). */
  fixed?: Readonly<Record<string, string>>;
  fields: readonly Field[];
  /** At least one of these keys must be filled (e.g. a password or a private key). */
  oneOf?: readonly string[];
  /** Signs in with a pasted token. */
  token?: boolean;
}

// What each sign-in provider may also need: a shared drive or start folder, OneDrive's drive (rclone cannot use
// OneDrive without it), pCloud's region.
const TOKEN_EXTRA: Record<'drive' | 'dropbox' | 'onedrive' | 'pcloud' | 'box', readonly Field[]> = {
  drive: [{ key: 'team_drive', kind: 'text' }, { key: 'root_folder_id', kind: 'text' }],
  dropbox: [],
  onedrive: [{ key: 'drive_id', kind: 'text', required: true }, { key: 'drive_type', kind: 'select', required: true, options: ['personal', 'business', 'documentLibrary'] }],
  pcloud: [{ key: 'hostname', kind: 'select', initial: 'api.pcloud.com', options: ['api.pcloud.com', 'eapi.pcloud.com'] }],
  box: [{ key: 'root_folder_id', kind: 'text' }],
};

export const PROVIDERS: readonly Provider[] = [
  {
    id: 's3',
    fields: [
      { key: 'provider', kind: 'select', initial: 'AWS', options: GEN.s3.flatMap((c) => (c.provider ? [c.provider] : [])) },
      { key: 'access_key_id', kind: 'text', required: true },
      { key: 'secret_access_key', kind: 'secret', required: true },
      { key: 'region', kind: 'text' },
      { key: 'endpoint', kind: 'text', address: true },
    ],
  },
  {
    id: 'sftp',
    fields: [
      { key: 'host', kind: 'text', required: true, address: true },
      { key: 'port', kind: 'number', initial: '22' },
      { key: 'user', kind: 'text', required: true },
      { key: 'pass', kind: 'secret' },
      { key: 'key_pem', kind: 'pem' },
      { key: 'key_file_pass', kind: 'secret' },
    ],
    oneOf: ['pass', 'key_pem'],
  },
  {
    id: 'webdav',
    fields: [
      { key: 'url', kind: 'text', required: true, address: true },
      { key: 'vendor', kind: 'select', initial: 'other', options: ['other', 'nextcloud', 'owncloud', 'fastmail', 'sharepoint'] },
      { key: 'user', kind: 'text' },
      { key: 'pass', kind: 'secret' },
    ],
  },
  {
    id: 'mega',
    fields: [
      { key: 'user', kind: 'text', required: true },
      { key: 'pass', kind: 'secret', required: true },
      { key: '2fa', kind: 'secret' },
    ],
  },
  {
    id: 'smb',
    fields: [
      { key: 'host', kind: 'text', required: true, address: true },
      { key: 'port', kind: 'number', initial: '445' },
      { key: 'user', kind: 'text' },
      { key: 'pass', kind: 'secret' },
      { key: 'domain', kind: 'text', initial: 'WORKGROUP' },
    ],
  },
  {
    id: 'ftp',
    fields: [
      { key: 'host', kind: 'text', required: true, address: true },
      { key: 'port', kind: 'number', initial: '21' },
      { key: 'user', kind: 'text' },
      { key: 'pass', kind: 'secret' },
    ],
  },
  ...(['drive', 'dropbox', 'onedrive', 'pcloud', 'box'] as const).map((id): Provider => ({
    id,
    token: true,
    fields: [
      { key: 'token', kind: 'token', required: true },
      // Drive, Dropbox and Box refresh a token with the client secret: an own client id without it fails an hour on.
      { key: 'client_id', kind: 'text', name: true, ...(id === 'drive' || id === 'dropbox' || id === 'box' ? { needs: 'client_secret' } : {}) },
      { key: 'client_secret', kind: 'secret', needs: 'client_id' },
      ...TOKEN_EXTRA[id],
    ],
  })),
  ...GEN.generated.map((g): Provider => ({
    id: g.id,
    label: g.label,
    ...(g.token ? { token: true } : {}),
    ...(g.fixed ? { fixed: g.fixed } : {}),
    fields: g.fields.map(fieldOfGen),
  })),
];

function fieldOfGen(f: GenField): Field {
  return {
    key: f.key,
    kind: f.kind,
    label: f.label,
    ...(f.required ? { required: true } : {}),
    ...(f.main ? {} : { more: true }),
    ...(f.options ? { options: f.options } : {}),
    ...(f.suggest ? { suggest: f.suggest } : {}),
    ...(f.default !== undefined ? { default: f.default } : {}),
    ...(f.hint ? { hint: f.hint } : {}),
    ...(f.address ? { address: true } : {}),
    ...(f.name ? { name: true } : {}),
    ...(f.needs ? { needs: f.needs } : {}),
  };
}

/** One choice in the storage picker: a type, or an S3-compatible service (the S3 form with its provider set, or
 *  another type's form for one that has its own, like Backblaze B2). `label` is set for generated words only. */
export interface Choice { value: string; type: ProviderId; provider?: string; label?: string; s3?: boolean }
export const CHOICES: readonly Choice[] = [
  ...PROVIDERS.map((p): Choice => ({ value: p.id, type: p.id, ...(p.label ? { label: p.label } : {}) })),
  ...GEN.s3.map((c): Choice => (c.provider ? { value: `s3:${c.provider}`, type: 's3', provider: c.provider, label: c.label, s3: true } : { value: `s3x:${c.type}`, type: c.type ?? '', label: c.label, s3: true })),
].filter((c) => PROVIDERS.some((p) => p.id === c.type));
export const choiceOf = (value: string): Choice | undefined => CHOICES.find((c) => c.value === value);
/** The six best-known storage of the picker (picker values), named under an empty storage list so it reads as storage
 *  you have elsewhere; the rest is counted (STORAGE_KINDS). */
export const BEST_KNOWN: readonly string[] = ['s3:AWS', 'drive', 'dropbox', 'onedrive', 'box', 'mega'];
/** How many storage kinds the picker connects: its entries, one per name (a service listed twice counts once), less
 *  the two ways in that are not storage of their own (the plain S3 form and "Other S3-compatible service"). */
export const STORAGE_KINDS: number = new Set(CHOICES.filter((c) => c.value !== 's3' && c.value !== 's3:Other').map((c) => c.label ?? c.type)).size;

export const providerOf = (id: string): Provider | undefined => PROVIDERS.find((p) => p.id === id);
const all = PROVIDERS.flatMap((p) => p.fields);
/** Every key that holds a secret: the route's secret keys, never prefilled, never kept. */
export const SECRET_KEYS: readonly string[] = [...new Set(all.filter((f) => f.kind === 'secret' || f.kind === 'pem' || f.kind === 'token').map((f) => f.key))];
/** Every key any provider sends (the connect route's body): the fields and the fixed values. */
export const BODY_KEYS: readonly string[] = [...new Set([...all.map((f) => f.key), ...PROVIDERS.flatMap((p) => Object.keys(p.fixed ?? {}))])];
