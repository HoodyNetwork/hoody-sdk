// shape.ts: the helpers a parser uses to tell a wire or stored answer from an array, null or a primitive, and to read a
// field as text. One helper per behaviour, named for what it accepts and its fallback (the record helpers also for their
// array rule), so a site picks the one it always meant; they are not interchangeable. Guards narrow the type; the `...Or`
// helpers return the value they accept (a record, a string) or their fallback.
//   isRecord          non-null object, arrays excluded (the common case)
//   isRecordOrArray   non-null object, arrays allowed
//   isPlainRecord     the "[object Object]" tag: a class instance passes; a Map, Date, Set, RegExp or array is refused
//   recordOrEmpty     the record (arrays excluded), else {}
//   recordOrNull      the record (arrays excluded), else null
//   recordOrUndefined the record (arrays excluded), else undefined
//   stringOrEmpty     the string itself, else '' (any other value, including a String object)

export type Rec = Record<string, unknown>;

export const isRecord = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);

export const isRecordOrArray = (v: unknown): v is Rec | unknown[] => v !== null && typeof v === 'object';

export const isPlainRecord = (v: unknown): v is Rec => Object.prototype.toString.call(v) === '[object Object]';

export const recordOrEmpty = (v: unknown): Rec => (isRecord(v) ? v : {});

export const recordOrNull = (v: unknown): Rec | null => (isRecord(v) ? v : null);

export const recordOrUndefined = (v: unknown): Rec | undefined => (isRecord(v) ? v : undefined);

export const stringOrEmpty = (v: unknown): string => (typeof v === 'string' ? v : '');
