/**
 * The realm-alias rules the CLI uses (`--realm <alias>`, `hoody use`): the vault key that holds the Hub's alias map, how
 * two aliases are compared, which words are reserved, and how a stored map is read.
 *
 * These are the SDK sidecar's rules (`REALM_ALIASES_VAULT_KEY` .. `validateRealmAliases`), which the Hub's own copy
 * also mirrors. They are MIRRORED rather than imported
 * because the sidecar is not part of the SDK's or the CLI's typecheck, and importing it from `lib/` would pull all of it
 * into both. A unit test holds the two copies together: the constants are read out of the sidecar's source, and every
 * vector is run through both implementations.
 *
 * Imports nothing, so the CLI bundle takes it without the sidecar's dependencies.
 */
export declare const REALM_ALIASES_VAULT_KEY = "hoody.realm-aliases";
export declare const REALM_ALIAS_MAX_LEN = 64;
/** The alias as the kit would COMPARE it: invisibles removed, trimmed, lowercased. */
export declare function foldRealmAlias(value: string): string;
/** The stored value (a JSON string) as a map. A corrupt or non-object value reads as `{}`; an invalid entry is dropped. */
export declare function parseRealmAliases(raw: unknown): Record<string, string>;
/** Throws on a reserved word, a bad id or a bad alias; an empty alias is a removal. Returns the accepted entries. */
export declare function validateRealmAliases(input: unknown): Record<string, string>;
