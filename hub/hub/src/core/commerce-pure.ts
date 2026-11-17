// commerce-pure.ts: the DOM-free money rules of the Market, the buy panel, the wallet and the paid-subserver
// list. Its names, constants and storage keys are a contract with what a browser already stores: never rename one.
//
// Contract:
//   - Money is integer cents. A price is a safe non-negative integer; the only decimal text accepted is the
//     wallet wire form "D.CC" (canonical, two fractional digits). Anything else is "unknown" (null, or the
//     "—" marker when formatting), never a fabricated number. Formatting is integer string math, no floats.
//   - Tier validity: a rental-day key is the canonical string of an integer in 1..3650 ("07", "7.0", 7 are
//     not keys). An offer tier is valid only with a safe-int price >= 0, a hold >= 1, and a fee (the per-day
//     override when present, else the scalar default; absent scalar is NaN, never "free") whose total stays
//     safe. A stock tier is valid when its total_first_payment parses; that total is READ, never recomputed.
//     The charge path's own verdict (maps.denied) outranks what a refetched row advertises.
//   - Rows are normalized into one shape (stock and offer rails); unreadable specs become null, never a dash
//     or a guess; a disk total is withheld whole if any disk entry is unprovable. Filters drop rows whose
//     spec is unknown when a floor is active. Sorts keep buyable rows first and unquotable rows last.
//   - Purchase transition table (purchaseTransition): a pure (state, event, mode) -> next map; every
//     unlisted pair is null (no-op). Initial mode: a pre-handler refusal (429, banned, typed 4xx, intent
//     mismatch, PRICING_INVALID 5xx) is a definitive "failed"; any other 5xx, a transport failure, the
//     posting budget, or the rent 409 SERVER_UNAVAILABLE is ambiguous and goes to "reconciling". Replay
//     mode (after an ambiguous original): only a 2xx is definitive, every other outcome is "indeterminate".
//     Terminals (confirmed, failed, not-found, indeterminate) leave only by a user action. canClose is false
//     exactly in posting and reconciling. Effects (retryAfter, bannedNow, advisory, suppressReplay,
//     reconfirm) only annotate; they never change the state.
//   - Ambiguity classifier: isAmbiguous (no numeric status, or status 0 = no verdict arrived) and
//     postEventFor (a rejection -> a table event; ban first, then deadline, then transport, then status).
//   - Resume markers: the Market top-up marker (sessionStorage hub_market_resume, 24 h TTL, shape kind/id/
//     days/at only) and the buy panel's top-up continuation (hub_buy_resume, 24 h, owned by one user, no key
//     and no ceiling) and plan intent (hub_buy_intent in both sessionStorage and localStorage, 1 h, clock
//     skew into the future refused). Storage reads and writes never throw out of this module.
//   - Idempotency-key pending store (localStorage hub_money_pending): one entry per user + target
//     (family for buy, subscription for pay). A pending entry never expires: it is an unknown outcome until
//     the server answers definitively for its key. claimPending adopts a stored entry instead of
//     overwriting, reads back after writing and fails closed ({preflight:'store'}) if the write did not
//     stick; claimShown also refuses (preflight 'adopted') to send an entry other than the one the user
//     saw. Writes serialize through navigator.locks when present.
//   - Subscription card states (cardView): the server's state decides, never this browser's clock. Each
//     state maps to a tone, a plain-words text and the pay action (null / 'pay' / 'retry'); an unknown state
//     reads as unavailable, never as the raw enum. Cards sort by need of attention.
//   - Language and strings: lang() is the module language (default the page's _hoodyInitialLang, else
//     'en'); the subs strings come from an injectable translator whose default substitutes {{name}} into
//     the English fallback.

// Storage goes through the host env (web: localStorage; terminal: the mount's session), never the global itself.
import { hostEnv, localStore, sessionStore } from './host-env';

type Rec = Record<string, unknown>;

const has = Object.hasOwn;
const isObj = (v: unknown): v is Rec => v !== null && typeof v === 'object';
const asObj = (v: unknown): Rec => (isObj(v) ? v : {});
const isSafeInt = (v: unknown): v is number => Number.isSafeInteger(v);

// ── language and translator ──

let langOverride: string | null = null;

export function setLang(l: string | null | undefined): void {
  langOverride = (typeof l === 'string' && l) ? l : null;
}

export function lang(): string {
  if (langOverride) return langOverride;
  const initial = (globalThis as { _hoodyInitialLang?: unknown })._hoodyInitialLang;
  return (typeof initial === 'string' && initial) || 'en';
}

export type Vars = Record<string, unknown>;
export type Translator = (key: string, fallback: string, vars?: Vars) => string;

// The default needs no shell: the English fallback with {{name}} filled in.
const fallbackTranslator: Translator = (_key, fallback, vars) => {
  let s = fallback;
  if (vars) for (const k in vars) if (has(vars, k)) s = String(s).split('{{' + k + '}}').join(String(vars[k]));
  return s;
};
let translator: Translator = fallbackTranslator;

export function setTranslator(fn: Translator | null | undefined): void {
  translator = typeof fn === 'function' ? fn : fallbackTranslator;
}

function tt(key: string, fb: string, vars?: Vars): string { return translator(key, fb, vars); }

function isCount(n: unknown): n is number { return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0; }

// ════════════════════════════════════════════════════════════════════════════
// market
// ════════════════════════════════════════════════════════════════════════════

export type ErrLike = { status?: unknown; code?: unknown; data?: unknown } | null | undefined;

export function isAccountBannedError(err: unknown): boolean {
  const e = err as ErrLike;
  return !!(e && e.status === 403 && e.code === 'ACCOUNT_BANNED');
}

export const RENTAL_DAYS_MAX = 3650;

export function normRuleMap(v: unknown): Rec | null {
  return (v !== null && typeof v === 'object' && !Array.isArray(v)) ? (v as Rec) : null;
}

function mCentsFromUsdString(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(s)) return null;
  const dot = s.indexOf('.');
  const intPart = s.slice(0, dot);
  if (intPart.length > 13) return null;
  return parseInt(intPart, 10) * 100 + parseInt(s.slice(dot + 1), 10);
}

function mFmtCents(cents: unknown): string {
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0) return '—';
  const f = cents % 100;
  const d = (cents - f) / 100;
  return '$' + String(d) + '.' + (f < 10 ? '0' : '') + String(f);
}

export function canonicalDayKey(d: unknown): d is string {
  if (typeof d !== 'string') return false;
  const n = parseInt(d, 10);
  return String(n) === d && n >= 1 && n <= RENTAL_DAYS_MAX;
}

export interface Maps {
  // offer rail
  pricing?: Rec | null;
  hold?: Rec | null;
  fees?: Rec | null;
  feeCents?: number;
  // stock rail
  tiers?: Rec | null;
  // the charge path's own verdict on a tier (denyRowTiers)
  denied?: Rec;
}

export function tierValidity(kind: string, d: unknown, maps: Maps | null | undefined): boolean {
  if (!canonicalDayKey(d) || !maps) return false;
  // The charge path's own verdict outranks the advertisement: a tier the
  // reserve/rent handler refused — or one absent from its available_days —
  // stays visible-but-inert even when a refetched row still advertises it.
  if (maps.denied && has(maps.denied, d)) return false;
  if (kind === 'offer') {
    const pricing = maps.pricing;
    if (!pricing || !has(pricing, d)) return false;
    const price = pricing[d];
    if (!isSafeInt(price) || price < 0) return false;
    const hold = maps.hold;
    if (!hold || !has(hold, d)) return false;
    const holdDays = hold[d];
    if (!isSafeInt(holdDays) || holdDays < 1) return false;
    const fee = (maps.fees && has(maps.fees, d)) ? maps.fees[d] : maps.feeCents;
    if (!isSafeInt(fee) || fee < 0) return false;
    if (!Number.isSafeInteger(price + fee)) return false;
    return true;
  }
  if (kind === 'stock') {
    const tiers = maps.tiers;
    if (!tiers || !has(tiers, d)) return false;
    const tier = tiers[d];
    if (tier === null || typeof tier !== 'object' || Array.isArray(tier)) return false;
    return mCentsFromUsdString((tier as Rec).total_first_payment) !== null;
  }
  return false;
}

export interface Quote {
  priceCents: number | null;
  feeCents: number | null;
  totalCents: number | null;
  holdDays: number | null;
}

export interface MarketRow {
  kind: 'stock' | 'offer';
  seq: number;
  id: string | null;
  name: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  datacenter: string | null;
  model: string | null;
  featured: boolean;
  stockLeft: number | null;
  deliveryHours: number | null;
  setupMinutes: number | null;
  cores: number | null;
  ramGb: number | null;
  diskGb: number | null;
  threads: number | null;
  cpuScore: number | null;
  cpuScoreType: string | null;
  ramType: string | null;
  ramMhz: number | null;
  diskSummary: string | null;
  bandwidthMbps: number | null;
  bandwidthFmt: string | null;
  trafficTb: number | null;
  trafficUnlimited: boolean;
  ipv4Count: number | null;
  /** Each group of identical disks the row lists (stock specs.disks.config, offer disks), in its order. */
  disks: MarketDisk[];
  /** Stock rail only (specs.additional.ipv6_enabled); offers do not say: null. */
  ipv6: boolean | null;
  /** Stock rail only (is_vm): a virtual machine rather than a whole one; offers do not say: null. */
  isVm: boolean | null;
  /** Stock rail only: compute | memory | storage | general | gpu, else null. */
  category: string | null;
  maps: Maps;
  days: string[];
  fromCents: number | null;
  fromDays: string | null;
  buyable: boolean;
  searchText: string;
}

/** One group of identical disks as the row lists it. A field left out, or of the wrong shape, is null (never 0). */
export interface MarketDisk {
  count: number | null;
  /** Capacity of one disk, in GB. */
  gb: number | null;
  /** The kind as the row words it (HDD, SSD, NVMe, SAS, any case). */
  type: string | null;
  /** The interface (SATA, PCIe, SAS) as the row words it. */
  iface: string | null;
  model: string | null;
}

const MARKET_CATEGORIES = ['compute', 'memory', 'storage', 'general', 'gpu'];
const diskWord = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
/** A disk count: a positive whole number of disks (at most 1024 in one group), else not listed. */
const diskCount = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 1024 ? v : null);
/** One disk's capacity in GB: above zero and at most 1 PiB (fractions kept: 1.92 TB is 1.92), else not listed. */
const diskGb = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1_048_576 ? v : null);

/** The disk groups of a raw disk list; entries that are not objects are skipped. */
export function disksOf(list: unknown): MarketDisk[] {
  if (!Array.isArray(list)) return [];
  const out: MarketDisk[] = [];
  for (const d of list as unknown[]) {
    if (!isObj(d)) continue;
    out.push({ count: diskCount(d.count), gb: diskGb(d.capacity_gb), type: diskWord(d.type, 20), iface: diskWord(d.interface, 20), model: diskWord(d.model, 60) });
  }
  return out;
}

type RowLike = Pick<MarketRow, 'kind' | 'maps'>;

export function quoteFor(row: RowLike | null | undefined, d: unknown): Quote | null {
  if (!row || !tierValidity(row.kind, d, row.maps)) return null;
  const maps = row.maps;
  const key = d as string;
  if (row.kind === 'offer') {
    const price = (maps.pricing as Rec)[key] as number;
    const fee = (maps.fees && has(maps.fees, key)) ? (maps.fees[key] as number) : (maps.feeCents as number);
    return { priceCents: price, feeCents: fee, totalCents: price + fee, holdDays: (maps.hold as Rec)[key] as number };
  }
  const tier = (maps.tiers as Rec)[key] as Rec;
  return {
    priceCents: mCentsFromUsdString(tier.price), // display-only; may be null — total is authoritative
    feeCents: null,                              // already resolved into total_first_payment
    totalCents: mCentsFromUsdString(tier.total_first_payment),
    holdDays: (typeof tier.hold_days === 'number' && isFinite(tier.hold_days)) ? tier.hold_days : null,
  };
}

function numOrNull(v: unknown): number | null { return (typeof v === 'number' && isFinite(v)) ? v : null; }

function strOrNull(v: unknown): string | null { return (typeof v === 'string' && v) ? v : null; }

function searchTextOf(parts: unknown[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (typeof p === 'string' && p) out.push(p.toLowerCase());
  }
  return out.join(' ');
}

function validDaysOf(row: RowLike, driving: Rec | null | undefined): string[] {
  const out: string[] = [];
  if (!driving) return out;
  for (const k of Object.keys(driving)) {
    if (tierValidity(row.kind, k, row.maps)) out.push(k);
  }
  out.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return out;
}

function minTotalOf(row: RowLike & { days: string[] }): { cents: number | null; days: string | null } {
  let best: number | null = null;
  let bestDays: string | null = null;
  for (const day of row.days) {
    const q = quoteFor(row, day);
    if (q && typeof q.totalCents === 'number' && (best === null || q.totalCents < best)) {
      best = q.totalCents;
      bestDays = day;
    }
  }
  return { cents: best, days: bestDays };
}

export function normalizeStockRow(rawIn: unknown, seq: number): MarketRow {
  const raw = asObj(rawIn);
  const specs = asObj(raw.specs);
  const cpu = asObj(specs.cpu);
  const ram = asObj(specs.ram);
  const disks = asObj(specs.disks);
  const net = asObj(specs.network);
  const extra = asObj(specs.additional);
  // pricing==null stays the defensive unbuyable path — the live route cannot emit
  // it (INNER JOIN required:true + !pricing filter), the guard is for skew.
  const pricing = isObj(raw.pricing) ? raw.pricing : null;
  const row: MarketRow = {
    kind: 'stock',
    seq,
    id: strOrNull(raw.id),
    name: strOrNull(raw.name),
    country: strOrNull(raw.country),
    region: strOrNull(raw.region),
    city: strOrNull(raw.city),
    datacenter: strOrNull(raw.datacenter),
    model: strOrNull(raw.model) || strOrNull(cpu.model),
    featured: raw.featured === true,
    stockLeft: null,               // in-stock rows are singular machines, no counter
    deliveryHours: 0,              // the API's own distinguishing constant
    setupMinutes: numOrNull(raw.setup_time_minutes), // NULLABLE on the stock rail
    cores: numOrNull(cpu.cores),
    ramGb: numOrNull(ram.capacity_gb),
    diskGb: numOrNull(disks.total_gb),
    // Additive spec surface: every field the public schema
    // already emits, normalized to value-or-null — the sheet renders only
    // what exists, never a dash. Stock CPU model precedence: the top-level
    // marketing `model` wins; specs.cpu.model is the fallback.
    threads: numOrNull(cpu.threads),
    cpuScore: numOrNull(cpu.score),
    cpuScoreType: strOrNull(cpu.score_type),
    ramType: strOrNull(ram.type),
    ramMhz: numOrNull(ram.speed_mhz),
    diskSummary: strOrNull(disks.summary),
    bandwidthMbps: numOrNull(net.bandwidth_mbps),
    bandwidthFmt: strOrNull(net.bandwidth_formatted),
    trafficTb: numOrNull(net.traffic_tb),
    trafficUnlimited: net.traffic_unlimited === true,
    ipv4Count: numOrNull(extra.ipv4_count),
    disks: disksOf(disks.config),
    ipv6: typeof extra.ipv6_enabled === 'boolean' ? extra.ipv6_enabled : null,
    isVm: typeof raw.is_vm === 'boolean' ? raw.is_vm : null,
    category: typeof raw.category === 'string' && MARKET_CATEGORIES.includes(raw.category) ? raw.category : null,
    maps: { tiers: pricing ? normRuleMap(pricing.price_tiers) : null },
    days: [], fromCents: null, fromDays: null, buyable: false,
    searchText: '',
  };
  row.days = validDaysOf(row, row.maps.tiers);
  const min = minTotalOf(row);
  row.fromCents = min.cents;
  row.fromDays = min.days;
  row.buyable = row.days.length > 0;
  row.searchText = searchTextOf([row.name, row.country, row.region, row.city, row.datacenter, row.model]);
  return row;
}

function diskTotalOf(disks: unknown): number | null {
  if (!Array.isArray(disks) || disks.length === 0) return null;
  let sum = 0;
  for (const dkRaw of disks as unknown[]) {
    const dk = dkRaw as Rec | null;
    if (dk === null || typeof dk !== 'object'
        || typeof dk.capacity_gb !== 'number' || !(dk.capacity_gb > 0)
        || !Number.isSafeInteger(dk.count) || (dk.count as number) < 1) return null;
    sum += dk.capacity_gb * (dk.count as number);
  }
  return sum <= Number.MAX_SAFE_INTEGER ? sum : null;
}

export function normalizeOfferRow(rawIn: unknown, seq: number): MarketRow {
  const raw = asObj(rawIn);
  const diskGb = diskTotalOf(raw.disks);
  const row: MarketRow = {
    kind: 'offer',
    seq,
    id: strOrNull(raw.id),
    name: strOrNull(raw.name),
    country: strOrNull(raw.country),
    region: strOrNull(raw.region),
    city: strOrNull(raw.city),
    datacenter: strOrNull(raw.datacenter),
    model: strOrNull(raw.cpu_model),
    featured: false,               // stock-only concept; offers sort after
    // stock: null = unlimited (no scarcity chip); a number is the finite counter.
    stockLeft: numOrNull(raw.stock),
    deliveryHours: numOrNull(raw.delivery_hours),
    setupMinutes: numOrNull(raw.setup_time_minutes), // NOT NULL by contract; normalized defensively
    cores: numOrNull(raw.cpu_cores),
    ramGb: numOrNull(raw.ram_gb),
    diskGb,
    // Additive spec surface — the offer rail's flat fields.
    threads: numOrNull(raw.cpu_threads),
    cpuScore: null,               // offers carry no benchmark fields
    cpuScoreType: null,
    ramType: null,
    ramMhz: null,
    diskSummary: null,
    bandwidthMbps: numOrNull(raw.bandwidth_mbps),
    bandwidthFmt: null,
    trafficTb: numOrNull(raw.traffic_tb),
    trafficUnlimited: raw.traffic_unlimited === true,
    ipv4Count: numOrNull(raw.ipv4_count),
    disks: disksOf(raw.disks),
    ipv6: null,                   // the offers rail has no IPv6, VM or category fields
    isVm: null,
    category: null,
    maps: {
      pricing: normRuleMap(raw.pricing_rules),
      hold: normRuleMap(raw.hold_rules),
      fees: normRuleMap(raw.setup_fee_rules),
      // NaN, not 0, when the scalar is off-contract: an absent default fee must
      // fail tierValidity's safe-int check, never silently read as "free".
      feeCents: (typeof raw.setup_fee_cents === 'number') ? raw.setup_fee_cents : NaN,
    },
    days: [], fromCents: null, fromDays: null, buyable: false,
    searchText: '',
  };
  row.days = validDaysOf(row, row.maps.pricing);
  const min = minTotalOf(row);
  row.fromCents = min.cents;
  row.fromDays = min.days;
  row.buyable = row.days.length > 0;
  row.searchText = searchTextOf([row.name, row.country, row.region, row.city, row.datacenter, row.model]);
  return row;
}

export interface Filters {
  q: string;
  kind: string;
  country: string;
  maxTotalCents: number | null;
  minCores: number | null;
  minRamGb: number | null;
  minDiskGb: number | null;
  sort: string;
}

export function defaultFilters(): Filters {
  return {
    q: '', kind: 'all', country: '',
    maxTotalCents: null, minCores: null, minRamGb: null, minDiskGb: null,
    sort: 'featured',
  };
}

export function applyFilters(listIn: unknown, fIn?: Filters | null): MarketRow[] {
  const list: Array<MarketRow | null | undefined> = Array.isArray(listIn) ? listIn : [];
  const f = fIn || defaultFilters();
  const q = (typeof f.q === 'string') ? f.q.toLowerCase().trim() : '';
  const out: MarketRow[] = [];
  for (const r of list) {
    if (!r) continue;
    if (f.kind === 'stock' && r.kind !== 'stock') continue;
    if (f.kind === 'offer' && r.kind !== 'offer') continue;
    if (f.country && r.country !== f.country) continue;
    if (q && (r.searchText || '').indexOf(q) === -1) continue;
    if (f.minCores != null && !(typeof r.cores === 'number' && r.cores >= f.minCores)) continue;
    if (f.minRamGb != null && !(typeof r.ramGb === 'number' && r.ramGb >= f.minRamGb)) continue;
    if (f.minDiskGb != null && !(typeof r.diskGb === 'number' && r.diskGb >= f.minDiskGb)) continue;
    if (f.maxTotalCents != null && !(typeof r.fromCents === 'number' && r.fromCents <= f.maxTotalCents)) continue;
    out.push(r);
  }
  let cmp: (a: MarketRow, b: MarketRow) => number;
  if (f.sort === 'priceAsc' || f.sort === 'priceDesc') {
    const sign = (f.sort === 'priceAsc') ? 1 : -1;
    cmp = (a, b) => {
      const ap = (typeof a.fromCents === 'number') ? a.fromCents : null;
      const bp = (typeof b.fromCents === 'number') ? b.fromCents : null;
      // Unquotable rows sort last in BOTH directions — an unknown price is not
      // a cheap price and not an expensive one.
      if (ap === null && bp === null) return a.seq - b.seq;
      if (ap === null) return 1;
      if (bp === null) return -1;
      if (ap !== bp) return sign * (ap - bp);
      return a.seq - b.seq;
    };
  } else if (f.sort === 'delivery') {
    // Buyable-first: a dead card must not outrank purchasable
    // inventory — the label says so out loud ("Available first, then
    // delivery"). priceAsc/Desc already hold this doctrine structurally
    // (fromCents === null ⇔ !buyable sorts last in both directions).
    cmp = (a, b) => {
      const av = (a.buyable ? 0 : 1) - (b.buyable ? 0 : 1);
      if (av !== 0) return av;
      const ad = (typeof a.deliveryHours === 'number') ? a.deliveryHours : null;
      const bd = (typeof b.deliveryHours === 'number') ? b.deliveryHours : null;
      if (ad === null && bd === null) return a.seq - b.seq;
      if (ad === null) return 1;
      if (bd === null) return -1;
      if (ad !== bd) return ad - bd;
      return a.seq - b.seq;
    };
  } else {
    // Featured (default): the SERVER'S own listing order for stock
    // (featured DESC, popularity_rank ASC NULLS LAST, created ASC — already the
    // arrival order of /servers/available), offers appended in listing order.
    // seq preserves both arrival orders; stock ranks before offers — and
    // buyable rows before dead ones within each rail.
    cmp = (a, b) => {
      const av = (a.buyable ? 0 : 1) - (b.buyable ? 0 : 1);
      if (av !== 0) return av;
      const ak = (a.kind === 'stock') ? 0 : 1;
      const bk = (b.kind === 'stock') ? 0 : 1;
      if (ak !== bk) return ak - bk;
      return a.seq - b.seq;
    };
  }
  out.sort(cmp);
  return out;
}

export function errData(err: unknown): Rec | null {
  const e = err as { data?: { data?: unknown } } | null | undefined;
  return (e && e.data && typeof e.data.data === 'object' && e.data.data !== null)
    ? (e.data.data as Rec) : null;
}

export function isAmbiguous(err: unknown): boolean {
  const e = err as ErrLike;
  return !e || typeof e.status !== 'number' || e.status === 0;
}

export type PostEvent =
  | 'http_403_banned' | 'posting_budget_expired' | 'transport_ambiguous' | 'http_429'
  | 'rent_409_server_unavailable' | 'http_409_intent_mismatch' | 'http_5xx_pricing_invalid'
  | 'http_5xx_other' | 'typed_4xx';

export function postEventFor(rail: string, err: unknown): PostEvent {
  if (isAccountBannedError(err)) return 'http_403_banned';
  const e = err as ErrLike;
  if (e && e.code === 'OP_DEADLINE') return 'posting_budget_expired';
  if (isAmbiguous(err)) return 'transport_ambiguous';
  const s = (e as { status: number }).status;
  if (s === 429) return 'http_429';
  if (rail === 'rent' && s === 409 && (e as ErrLike)?.code === 'SERVER_UNAVAILABLE') return 'rent_409_server_unavailable';
  if (s === 409 && (e as ErrLike)?.code === 'IDEMPOTENCY_INTENT_MISMATCH') return 'http_409_intent_mismatch';
  if (s >= 500) return ((e as ErrLike)?.code === 'PRICING_INVALID') ? 'http_5xx_pricing_invalid' : 'http_5xx_other';
  return 'typed_4xx';
}

export const PM_TERMINALS: Record<string, 1> = { confirmed: 1, failed: 1, 'not-found': 1, indeterminate: 1 };

export function pmCanClose(state: string): boolean { return state !== 'posting' && state !== 'reconciling'; }

export type PurchaseState = 'idle' | 'posting' | 'reconciling' | 'confirmed' | 'failed' | 'not-found' | 'indeterminate';
export type PurchaseMode = 'initial' | 'replay';

export interface Transition {
  state: PurchaseState;
  mode: PurchaseMode | null;
  canClose: boolean;
  retryAfter?: boolean;
  bannedNow?: boolean;
  advisory?: boolean;
  suppressReplay?: boolean;
  reconfirm?: boolean;
}

type Fx = Partial<Pick<Transition, 'retryAfter' | 'bannedNow' | 'advisory' | 'suppressReplay' | 'reconfirm'>>;

export function purchaseTransition(state: string, event: string, modeIn?: string | null): Transition | null {
  const mode: PurchaseMode = (modeIn === 'replay') ? 'replay' : 'initial';
  function to(next: PurchaseState, m?: PurchaseMode | null, fx?: Fx): Transition {
    const out: Transition = { state: next, mode: (next === 'idle') ? null : (m || mode), canClose: pmCanClose(next) };
    if (fx) for (const k in fx) if (has(fx, k)) (out as unknown as Rec)[k] = (fx as Rec)[k];
    return out;
  }
  if (state === 'idle') {
    if (event === 'confirm') return to('posting', 'initial');
    return null;
  }
  if (state === 'posting') {
    if (event === 'http_2xx') return to('confirmed');
    if (mode === 'replay') {
      // After an ambiguous original, ONLY a replay 2xx is definitive.
      // EVERY non-2xx replay outcome is indeterminate — a refusal can come from
      // layers that never reach the idempotency lookup, and even a post-lookup
      // refusal proves absence only at that serialization point (the ambiguous
      // original can still commit later; there is no negative tombstone).
      // Effects only annotate the card; they never upgrade the state.
      switch (event) {
        case 'http_429': return to('indeterminate', null, { retryAfter: true });
        case 'http_403_banned': return to('indeterminate', null, { bannedNow: true });
        case 'http_409_intent_mismatch': return to('indeterminate', null, { advisory: true }); // a row under this key EXISTS
        case 'typed_4xx':
        case 'rent_409_server_unavailable': // unreachable (rent has no replay mode); the ANY-non-2xx rule stays literal
        case 'http_5xx_pricing_invalid':
        case 'http_5xx_other':
        case 'transport_ambiguous':
        case 'posting_budget_expired':
          return to('indeterminate');
      }
      return null;
    }
    switch (event) {
      // Definitive pre-handler refusals: the limiter increments-then-rejects and
      // auth throws before the handler — nothing executed.
      case 'http_429': return to('failed', null, { retryAfter: true });
      case 'http_403_banned': return to('failed', null, { bannedNow: true });
      case 'typed_4xx': return to('failed');
      // A row under this key already exists with another intent: this request did not run, but the earlier one
      // may have: never "failed", held like any unknown outcome, the key kept.
      case 'http_409_intent_mismatch': return to('indeterminate', null, { advisory: true });
      // The one typed 4xx whose meaning is ambiguous → ownership check.
      case 'rent_409_server_unavailable': return to('reconciling');
      // Charge resolution precedes the debit in both services, so this
      // one 5xx is provably pre-commit; every OTHER initial 5xx can follow a
      // committed transaction.
      case 'http_5xx_pricing_invalid': return to('failed');
      case 'http_5xx_other': return to('reconciling');
      case 'transport_ambiguous': return to('reconciling');
      case 'posting_budget_expired': return to('reconciling');
    }
    return null;
  }
  if (state === 'reconciling') {
    switch (event) {
      // Rent rows — /rentals is owner-scoped, but a rent has no key: an active rental of the server does not say which
      // attempt made it (an earlier one, another tab, Rent again anyway). So a match is evidence only (advisory): the
      // attempt stays unknown and keeps its hold. Only the POST's own answer settles it.
      case 'read_match': return to('indeterminate', null, { advisory: true });
      case 'reads_clean_no_match': return to('not-found');
      case 'reads_exhausted_failure': return to('indeterminate');
      case 'read_403_banned': return to('indeterminate', null, { bannedNow: true });
      case 'reconcile_budget_expired': return to('indeterminate');
      // Reserve rows, all four named. The advisory page-0 read NEVER
      // terminates the machine by itself (rows are advisory-only)…
      case 'ambiguity_read_match': return to('reconciling', null, { advisory: true });
      case 'ambiguity_read_no_match': return to('reconciling');
      case 'ambiguity_read_failure': return to('reconciling');
      // …EXCEPT the banned row: the machine leaves at once (outcome unknown, banned). No reserve is ever sent
      // again by itself; the ban latch (bannedNow) keeps the person's Retry away. suppressReplay is a no-op effect
      // kept for the table's tests (nothing reads it).
      case 'ambiguity_read_403_banned': return to('indeterminate', null, { bannedNow: true, suppressReplay: true });
      case 'replay_dispatch': return to('posting', 'replay');
    }
    return null;
  }
  if (PM_TERMINALS[state]) {
    // No automatic exits from a terminal — ban included; these rows
    // are all user actions.
    if (event === 'dismiss') return to('idle');
    if ((state === 'not-found' || state === 'indeterminate') && event === 'check_again') {
      return to('reconciling'); // reads only; runs under its own retained 15s check budget
    }
    if (state === 'not-found' && event === 'retry_rent') {
      // Rent has no idempotency: retry demands the detail confirm again —
      // fresh quote, explicit confirm, then a NEW posting(initial).
      return to('idle', null, { reconfirm: true });
    }
    if (state === 'indeterminate') {
      if (event === 'retry_replay') return to('posting', 'replay'); // manual same-key POST
      // Refresh-reservations: a pure read that NEVER moves the
      // purchase state — all four outcomes are state-preserving rows, listed
      // so invariant 1 stays provable rather than accidental.
      if (event === 'refresh_read_match') return to('indeterminate', null, { advisory: true });
      if (event === 'refresh_read_no_match') return to('indeterminate');
      if (event === 'refresh_read_failure') return to('indeterminate');
      if (event === 'refresh_read_403_banned') return to('indeterminate', null, { bannedNow: true });
    }
    return null;
  }
  return null;
}

export function advisoryMatch(list: unknown, offerId: unknown, days: unknown, attemptAtIso: unknown): Rec | null {
  if (!Array.isArray(list)) return null;
  const at = Date.parse(attemptAtIso as string);
  if (isNaN(at)) return null;
  const want = parseInt(days as string, 10);
  for (const item of list as unknown[]) {
    const r = item as Rec | null;
    if (!r || r.offer_id !== offerId) continue;
    if (typeof r.days !== 'number' || r.days !== want) continue;
    const ct = Date.parse(r.created_at as string);
    if (isNaN(ct) || ct < at) continue;
    return r;
  }
  return null;
}

const MARKET_RESUME_TTL_MS = 24 * 60 * 60 * 1000;

export interface ResumeMarker { kind: 'stock' | 'offer'; id: string; days: string; at: number }

export function validResumeMarker(m: unknown, now: number): m is ResumeMarker {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const r = m as Rec;
  if (r.kind !== 'stock' && r.kind !== 'offer') return false;
  if (typeof r.id !== 'string' || !r.id) return false;
  if (typeof r.days !== 'string' || !canonicalDayKey(r.days)) return false;
  if (typeof r.at !== 'number' || !isFinite(r.at)) return false;
  if (now - r.at > MARKET_RESUME_TTL_MS) return false;
  return true;
}

export function lruPollPick(trackedMap: unknown, exclude: unknown, cap: unknown): string[] {
  const out: Array<{ id: string; at: number; seq: number }> = [];
  if (!trackedMap || typeof trackedMap !== 'object') return [];
  const tracked = trackedMap as Rec;
  for (const id in tracked) {
    if (!has(tracked, id)) continue;
    if (exclude && has(exclude as object, id)) continue;
    const t = tracked[id] as Rec | null;
    out.push({
      id,
      at: (t && typeof t.lastPolledAt === 'number') ? t.lastPolledAt : 0,
      seq: (t && typeof t.seq === 'number') ? t.seq : 0,
    });
  }
  out.sort((a, b) => (a.at - b.at) || (a.seq - b.seq));
  const n = (typeof cap === 'number' && cap >= 0) ? cap : 0;
  const ids: string[] = [];
  for (let i = 0; i < out.length && i < n; i++) ids.push((out[i] as { id: string }).id);
  return ids;
}

function mNewIdemKey(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch { /* fall through to the hex fallback */ }
  let s = 'mk-';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

const MARKET_RESUME_KEY = 'hub_market_resume';

export function writeResumeMarker(kind: string, id: string, days: string): void {
  try {
    sessionStore().setItem(MARKET_RESUME_KEY, JSON.stringify({ kind, id, days, at: Date.now() }));
  } catch { /* continuation lost, handoff proceeds */ }
}

export function readResumeMarker(): ResumeMarker | null {
  try {
    const raw = sessionStore().getItem(MARKET_RESUME_KEY);
    if (!raw) return null;
    const m: unknown = JSON.parse(raw);
    return validResumeMarker(m, Date.now()) ? m : null;
  } catch { return null; }
}

export function clearResumeMarker(): void {
  try { sessionStore().removeItem(MARKET_RESUME_KEY); } catch { /* nothing to lose */ }
}

export function hasResume(): boolean { return !!readResumeMarker(); }

export function readAvailableDays(d: unknown): Record<string, true> | null {
  const raw = d && (d as Rec).available_days;
  if (!Array.isArray(raw)) return null; // absent (rent rail / max-days bound): deny only the refused day
  const allow: Record<string, true> = {};
  for (const item of raw as unknown[]) {
    const k = typeof item === 'number' ? String(item) : item;
    if (canonicalDayKey(k)) allow[k] = true;
  }
  return allow; // {} = the server sells nothing → every advertised tier denied
}

export function denyRowTiers(row: MarketRow, prune: { allow?: Rec | null; deny?: string | null }): MarketRow {
  const driving = row.kind === 'offer' ? row.maps.pricing : row.maps.tiers;
  const denied: Rec = {};
  if (prune.allow) {
    const keys = driving ? Object.keys(driving) : [];
    for (const k of keys) {
      if (!has(prune.allow, k)) denied[k] = true;
    }
  }
  if (prune.deny) denied[prune.deny] = true;
  row.maps.denied = denied;
  // Recompute what the normalizers cached FROM the maps — chips selection and
  // the buy gate read these, and a denied tier must not survive in any of them
  // (fromDays included: a denied winner must not keep captioning the price).
  row.days = validDaysOf(row, driving);
  const min = minTotalOf(row);
  row.fromCents = min.cents;
  row.fromDays = min.days;
  row.buyable = row.days.length > 0;
  return row;
}

// ════════════════════════════════════════════════════════════════════════════
// buy
// ════════════════════════════════════════════════════════════════════════════

export const INTENT_KEY = 'hub_buy_intent';

export const INTENT_TTL_MS = 60 * 60 * 1000;

const FAMILY_RE = /^[0-9a-f]{24}$/;

const BCP47: Record<string, string> = { zht: 'zh-TW', br: 'pt-BR' };

export function dropIntent(): void {
  try { sessionStore().removeItem(INTENT_KEY); } catch { /* ignore */ }
  try { localStore().removeItem(INTENT_KEY); } catch { /* ignore */ }
}

function tabIntent(): string | null { try { return sessionStore().getItem(INTENT_KEY); } catch { return null; } }

function crossTabIntent(): string | null { try { return localStore().getItem(INTENT_KEY); } catch { return null; } }

export function readIntent(now: number): string | null {
  const raw = tabIntent() || crossTabIntent();
  if (!raw) return null;
  const d = parseIntent(raw, now);
  if (!d) dropIntent();
  return d;
}

const BUY_RESUME_KEY = 'hub_buy_resume';

const BUY_RESUME_TTL_MS = 24 * 60 * 60 * 1000;

export interface BuyResume { user: string; plan: string; title: string; region?: string }
export interface PayResume {
  user: string;
  pay: string;
  title: string;
  name: string;
  paid_through: string | null;
  holdDays: number | null;
}

export function parseResume(raw: string, now: number): BuyResume | PayResume | null {
  let m: Rec | null;
  try { m = JSON.parse(raw) as Rec | null; } catch { return null; }
  if (!m || typeof m.at !== 'number' || !(now - m.at >= 0) || now - m.at > BUY_RESUME_TTL_MS) return null;
  if (typeof m.user !== 'string' || !m.user) return null;   // no owner: never shown to anyone
  const title = (typeof m.title === 'string') ? m.title.slice(0, 80) : '';
  if (m.kind === 'subserver-pay') {                 // Pay now → Add funds: back to that subscription's Pay dialog
    if (typeof m.sub !== 'string' || !SUB_ID_RE.test(m.sub)) return null;
    return {
      user: m.user, pay: m.sub, title, name: (typeof m.name === 'string') ? m.name.slice(0, 80) : '',
      paid_through: (typeof m.paid_through === 'string') ? m.paid_through.slice(0, 40) : null,
      holdDays: isCount(m.hold_days) ? m.hold_days : null,
    };
  }
  if (m.kind !== 'subserver' || typeof m.plan !== 'string' || !FAMILY_RE.test(m.plan)) return null;
  return { user: m.user, plan: m.plan, title, ...(regionCode(m.region) ? { region: m.region } : {}) };
}

export function parseIntent(raw: string, now: number): string | null {
  let d: Rec | null;
  try { d = JSON.parse(raw) as Rec | null; } catch { return null; }
  if (!d || d.kind !== 'subserver' || typeof d.plan !== 'string' || !FAMILY_RE.test(d.plan)) return null;
  if (typeof d.at !== 'number' || !(now - d.at >= 0) || now - d.at > INTENT_TTL_MS) return null;
  return d.plan;
}

export const PENDING_KEY = 'hub_money_pending';

const SUB_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function shortStr(v: unknown, max: number): v is string { return typeof v === 'string' && v.length > 0 && v.length <= max; }

export interface PendingEntry {
  kind: 'buy' | 'pay';
  user_id: string;
  key: string;
  max_charge_cents: number;
  at: number;
  title?: string | null;
  family_id?: string;
  plan_id?: string;
  sub_id?: string;
  /** buy: the location the person chose (a region code of the plan's list). Absent: Automatic. Part of the request:
   *  a kept buy is resent with it or without it, exactly as it was first sent. */
  region?: string;
}

/** A region code as the API lists one: 1-64 characters, already trimmed and lower-case (the form the API compares). */
export function regionCode(x: unknown): x is string {
  return typeof x === 'string' && x.length >= 1 && x.length <= 64 && x === x.trim().toLowerCase();
}

function validPending(eIn: unknown): eIn is PendingEntry {
  const e = eIn as Rec | null | undefined;
  if (!e || (e.kind !== 'buy' && e.kind !== 'pay')) return false;
  if (!shortStr(e.user_id, 128) || !shortStr(e.key, 128) || !isCount(e.max_charge_cents)) return false;
  if (typeof e.at !== 'number' || !isFinite(e.at)) return false;   // display only: never an expiry
  if (e.title != null && typeof e.title !== 'string') return false;
  // A location belongs to a buy only, and only as a whole code: an entry with any other value is no request this Hub made.
  if (e.region != null && (e.kind !== 'buy' || !regionCode(e.region))) return false;
  if (e.kind === 'buy') return typeof e.family_id === 'string' && FAMILY_RE.test(e.family_id) && shortStr(e.plan_id, 64);
  return typeof e.sub_id === 'string' && SUB_ID_RE.test(e.sub_id);
}

export function parsePending(raw: string): PendingEntry[] {
  let a: unknown;
  try { a = JSON.parse(raw); } catch { return []; }
  return Array.isArray(a) ? a.filter(validPending) : [];
}

export function readPendingAll(): PendingEntry[] {
  try { const raw = localStore().getItem(PENDING_KEY); return raw ? parsePending(raw) : []; } catch { return []; }
}

export function writePendingAll(list: PendingEntry[]): void {
  try {
    if (list.length) localStore().setItem(PENDING_KEY, JSON.stringify(list));
    else localStore().removeItem(PENDING_KEY);
  } catch { /* quota / private mode: claimPending reads back and refuses to send */ }
}

function sameTarget(a: PendingEntry, b: PendingEntry): boolean {
  return a.kind === b.kind && a.user_id === b.user_id
    && (a.kind === 'buy' ? a.family_id === b.family_id : a.sub_id === b.sub_id);
}

export function findPending(q: PendingEntry): PendingEntry | null {
  for (const e of readPendingAll()) if (sameTarget(e, q)) return e;
  return null;
}

/** True when this browser offers Web Locks (navigator.locks.request; the host's lock manager, hostEnv().locks). */
export function hasWebLocks(): boolean {
  try {
    const locks = (hostEnv().locks as { request?: unknown } | null);
    return !!locks && typeof locks.request === 'function';
  } catch { return false; }
}

// Depth of callbacks running inside a GRANTED Web Lock on the pending store (callbacks are synchronous).
let pendingLockDepth = 0;
/** True only inside a withPendingLock callback that a real Web Lock granted (never on the in-tab fallback). */
export function pendingLockHeld(): boolean { return pendingLockDepth > 0; }

// Without Web Locks the fallback below orders only this tab, so two tabs could each claim a
// different key for one purchase. Work on keys already stored (drops, rewrites, replays) still runs on it, except a
// kept reservation's (commerce.ts: every write of hub_market_pending, and a reservation's resend, needs a granted
// lock); every claim of a NEW money key checks pendingLockHeld() and is refused ('noLocks') when it is false.
// A Web Locks API that is present but never grants (request throws, or its promise rejects without running the
// callback) is no lock either: the work runs on the in-tab fallback, unheld, so a new money key is refused 'noLocks'
// there too. An error of the callback itself (it ran) passes through, and the work never runs twice.
export function withPendingLock<T>(fn: () => T): Promise<T> {
  let granted = false;
  const held = (): T => { granted = true; pendingLockDepth++; try { return fn(); } finally { pendingLockDepth--; } };
  const fallback = (): Promise<T> => new Promise<T>((resolve) => { resolve(fn()); });
  let req: Promise<T> | null = null;
  try {
    const locks = (hostEnv().locks as { request?: unknown } | null);
    if (locks && typeof locks.request === 'function') {
      req = Promise.resolve((locks as { request: (name: string, cb: () => T) => Promise<T> }).request(PENDING_KEY, held));
    }
  } catch (err) {
    // A request that runs the callback synchronously and lets its error escape: the callback ran, so its error stands.
    if (granted) return Promise.reject(err);
    req = null;
  }
  if (!req) return fallback();
  return req.then(undefined, (err: unknown) => { if (granted) throw err; return fallback(); });
}

export function claimPending(mine: PendingEntry): Promise<PendingEntry> {
  return withPendingLock(() => {
    const cur = findPending(mine);
    if (cur) return cur;
    if (!pendingLockHeld()) throw { preflight: 'noLocks' };
    writePendingAll(readPendingAll().concat([mine]));
    const back = findPending(mine);
    if (!back || back.key !== mine.key) throw { preflight: 'store' };
    return mine;
  });
}

export function claimShown(mine: PendingEntry): Promise<PendingEntry> {
  return claimPending(mine).then((e) => {
    if (e.key !== mine.key) throw { preflight: 'adopted', entry: e };
    return e;
  });
}

export function dropPending(e: PendingEntry | null | undefined): Promise<void> {
  if (!e) return Promise.resolve();
  return withPendingLock(() => {
    writePendingAll(readPendingAll().filter((x) => !(sameTarget(x, e) && x.key === e.key)));
  });
}

export function pendingBody(e: PendingEntry): { plan_id?: string; idempotency_key: string; max_charge_cents: number; region?: string } {
  // `region` only when one was chosen: a buy without it is "Automatic", and its body is the one it always was.
  return e.kind === 'buy'
    ? { plan_id: e.plan_id as string, idempotency_key: e.key, max_charge_cents: e.max_charge_cents, ...(e.region ? { region: e.region } : {}) }
    : { idempotency_key: e.key, max_charge_cents: e.max_charge_cents };
}

export function failedOutcome(d: unknown): boolean {
  const r = d as Rec | null | undefined;
  const op = r && r.operation as Rec | undefined;
  const sub = r && r.subscription as Rec | undefined;
  return !!((op && op.result === 'failed') || (sub && sub.state === 'delivery_failed'));
}

// The operation results a buy, pay or upgrade answer may carry (null while in progress, the normal 202).
// superseded belongs to hold and wipe operations, never to these: anything else is not this contract's answer.
const ENVELOPE_RESULTS: ReadonlySet<unknown> = new Set([null, 'succeeded', 'failed']);

// The operation each action admits (the API's own rule): buy a 'purchase' and upgrade an 'upgrade',
// both recording the plan sent (by its exact id) as target_plan_id; pay a 'resume'.
const ENVELOPE_KINDS = { buy: 'purchase', upgrade: 'upgrade', pay: 'resume' } as const;
/** What was sent: the action, the subscription a pay or upgrade named, the plan a buy or upgrade sent. */
export interface EnvelopeRequest { kind: 'buy' | 'pay' | 'upgrade'; subId?: string; planId?: string }

/** A buy, pay or upgrade 2xx counts only with the route's operation + subscription + boolean `replayed`, agreeing with
 *  each other (the operation is the subscription's), with a known result, an operation of this action's kind and, for
 *  a buy or an upgrade, of the plan sent; for pay and upgrade about the subscription the request named. The
 *  subscription's own plan is never compared: a replay returns the subscription as it is now. Anything else proves
 *  nothing: the caller keeps the request held as unknown (C9). */
export function validEnvelope(d: unknown, req: EnvelopeRequest): boolean {
  const r = d as Rec | null | undefined;
  const op = r && r.operation as Rec | undefined;
  const sub = r && r.subscription as Rec | undefined;
  return !!(op && typeof op === 'object' && shortStr(op.id, 128) && shortStr(op.subscription_id, 128)
    && sub && typeof sub === 'object' && shortStr(sub.id, 128) && shortStr(sub.state, 64)
    && op.subscription_id === sub.id && ENVELOPE_RESULTS.has(op.result)
    && typeof (r as Rec).replayed === 'boolean' && op.kind === ENVELOPE_KINDS[req.kind]
    && (req.kind === 'pay' || (shortStr(req.planId, 128) && op.target_plan_id === req.planId))
    && (req.subId === undefined || sub.id === req.subId));
}

/** A rent or reserve 2xx counts only in the route's own shape, about what was sent (`sent`: the server or offer id and
 *  the days in the body). Reserve (201): `replayed` is always a boolean; only a replay may leave the reservation out (a
 *  replay this realm does not show, or a caller without billing reads); a fresh request always has at least {id,
 *  state}, and an offer_id or days it carries are the ones sent. Rent (201): the rental always has its id, and its
 *  server_id is the rented server. Anything else proves nothing (transport_ambiguous). */
export function validMarketReceipt(rail: 'rent' | 'reserve', d: unknown, sent: { id: string; days: number }): boolean {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const r = d as Rec;
  if (rail === 'rent') {
    const rental = r.rental as Rec | null | undefined;
    return !!rental && typeof rental === 'object' && !Array.isArray(rental) && shortStr(rental.id, 128)
      && rental.server_id === sent.id;
  }
  if (typeof r.replayed !== 'boolean') return false;
  if (r.reservation === undefined) return r.replayed === true;
  const res = r.reservation as Rec | null;
  return !!res && typeof res === 'object' && !Array.isArray(res) && shortStr(res.id, 128) && shortStr(res.state, 64)
    && (res.offer_id === undefined || res.offer_id === sent.id) && (res.days === undefined || res.days === sent.days);
}

// Refusals that prove THIS request was not run and nothing was charged for it (refused before any debit).
// IDEMPOTENCY_INTENT_MISMATCH is not one: an operation already exists under the key with another intent, so this
// request did not run but the earlier one may have charged. createAttempt keeps it held as unknown (kind 'intent',
// key kept), never "nothing was charged". Core always replays the same body under a key, so it is not expected.
export const MONEY_DEFINITIVE: { buy: string[]; pay: string[] } = {
  buy: ['PLAN_NOT_AVAILABLE', 'PAID_SUBSERVER_LIMIT_REACHED', 'NO_PAID_CAPACITY', 'NO_PAID_CAPACITY_IN_REGION', 'PAID_REGION_UNKNOWN',
    'CHARGE_CONFIRMATION_REQUIRED', 'CHARGE_EXCEEDS_MAX', 'INSUFFICIENT_BALANCE'],
  pay: ['SUBSERVER_WIPE_IN_PROGRESS', 'SUBSCRIPTION_NOT_PAYABLE', 'SUBSERVER_DORMANT', 'HOST_UNAVAILABLE',
    'CHARGE_CONFIRMATION_REQUIRED', 'CHARGE_EXCEEDS_MAX', 'INSUFFICIENT_BALANCE'],
};

export function definitive(kind: string, err: unknown): boolean {
  const e = err as ErrLike;
  // A pending rejection (api(): the answer came after its context died, or the route says the change may still be
  // under way) settles nothing, whatever its code: the key stays and the attempt is unknown.
  if (e && typeof e === 'object' && ((e as { pending?: unknown }).pending === true || (e as { kind?: unknown }).kind === 'pending')) return false;
  const st = e && e.status;
  if (typeof st !== 'number' || st < 400 || st >= 500 || st === 401 || st === 403 || st === 404 || st === 429) return false;
  const codes: string[] = (MONEY_DEFINITIVE as Record<string, string[]>)[kind] || [];
  return typeof (e as { code?: unknown }).code === 'string' && codes.indexOf((e as { code: string }).code) !== -1;
}

function bFmtCents(cents: unknown): string {
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0) return '—';
  const f = cents % 100;
  const d = (cents - f) / 100;
  return '$' + String(d) + '.' + (f < 10 ? '0' : '') + String(f);
}

function bCentsFromUsdString(s: unknown): number | null {
  if (typeof s !== 'string' || !/^(0|[1-9]\d{0,12})\.\d{2}$/.test(s)) return null;
  const dot = s.indexOf('.');
  return parseInt(s.slice(0, dot), 10) * 100 + parseInt(s.slice(dot + 1), 10);
}

const USD_TEXT = /^(0|[1-9]\d{0,12})\.\d{2}$/;

/**
 * A wallet amount as the API sends it ("1234.50") as text: "$1,234.50", thousands separated. Anything that is not
 * the canonical D.CC form is a dash, never a guess. Shared here so Billing and the Referrals page
 * format the same way without a page-to-page import.
 */
export function usdText(s: unknown): string {
  if (typeof s !== 'string' || !USD_TEXT.test(s)) return '—';
  const dot = s.indexOf('.');
  return `$${s.slice(0, dot).replace(/\B(?=(\d{3})+$)/g, ',')}${s.slice(dot)}`;
}

export function fmtUtcDate(iso: unknown): string | null {
  if (typeof iso !== 'string' || !iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  let s: string;
  try { s = new Intl.DateTimeFormat(BCP47[lang()] || lang(), { dateStyle: 'medium', timeZone: 'UTC' }).format(d); } catch { s = d.toISOString().slice(0, 10); }
  return s + ' UTC';
}

export interface Plan {
  id: string;
  family_id: string;
  price_cents_per_month: number;
  hold_days: number;
  [k: string]: unknown;
}

export function validPlan(pIn: unknown): pIn is Plan {
  const p = pIn as Rec | null | undefined;
  return !!(p && typeof p.id === 'string' && p.id && typeof p.family_id === 'string'
    && isCount(p.price_cents_per_month) && p.price_cents_per_month > 0 && isCount(p.hold_days));
}

/** A plan's facts in the order a person weighs them (Billing's plan rows and the Market's cards read this one list). */
export const PLAN_FACT_IDS = ['cores', 'ram', 'disk', 'computers', 'io', 'net', 'snapshots', 'aliases', 'boturls', 'ai'] as const;
export type PlanFactId = (typeof PLAN_FACT_IDS)[number];
/** One fact with its raw catalogue value; `write` only on `io`, when the write speed differs from the read speed. */
export interface PlanFact { id: PlanFactId; value: number; write?: number }

/**
 * The presentation facts of one catalogue row (GET /subserver-plans), raw values kept. A field the row leaves out or
 * sends malformed is left out, never 0. Disk read and write stay two numbers (never a min or a max); one side unknown
 * gives no disk-speed fact. The AI multiple is a fact only at 2 or more: an equal public multiple proves no allowance.
 * Retention days are not a fact here: each surface states them in its own sentence. Display only, never a purchase rule.
 */
export function planFacts(pIn: unknown): PlanFact[] {
  const p = asObj(pIn);
  const r = isObj(p.resources) && !Array.isArray(p.resources) ? p.resources : {};
  const out: PlanFact[] = [];
  const put = (id: PlanFactId, v: unknown) => { if (isCount(v)) out.push({ id, value: v }); };
  put('cores', r.cpu_cores);
  put('ram', r.ram_gb);
  put('disk', r.disk_limit_gb);
  put('computers', r.max_computers);
  const rd = r.disk_io_read_mib, wr = r.disk_io_write_mib;
  if (isCount(rd) && isCount(wr)) out.push(wr === rd ? { id: 'io', value: rd } : { id: 'io', value: rd, write: wr });
  put('net', r.network_limit_mbps);
  put('snapshots', r.snapshots_per_computer);
  put('aliases', p.max_proxy_aliases);
  put('boturls', p.max_bot_urls);
  if (isCount(r.ai_multiplier) && r.ai_multiplier >= 2) out.push({ id: 'ai', value: r.ai_multiplier });
  return out;
}

// ---- upgrade eligibility (Billing and the Market read this one copy; the server decides, the client only offers) ----

/** A paid subscription as GET /subserver-subscriptions sends it, as far as the upgrade rules read it. */
export interface UpgradeSub {
  state?: unknown;
  plan_id?: unknown;
  paid_through?: unknown;
  active_operation_id?: unknown;
  /** The server's OWN plan version (the subscription answer nests it), retired or not. */
  plan?: { resources?: unknown; max_proxy_aliases?: unknown; max_bot_urls?: unknown; max_storage_shares?: unknown; ai_tier?: unknown } | null;
}

/**
 * Whether a server can change plan now (the API's rule for when a plan can change): `ok` = active, no change running and the
 * paid period still running; `busy` = active with a change running; `ended` = active, paid period over; `state` =
 * any other state (or no server).
 */
export function upgradeGate(sub: UpgradeSub | null | undefined, now: number = Date.now()): 'ok' | 'busy' | 'ended' | 'state' {
  if (!sub || sub.state !== 'active') return 'state';
  if (sub.active_operation_id) return 'busy';
  // Billing's own expression, kept as it was: Date.parse reads any value as its text.
  const pt = Date.parse((sub.paid_through ?? '') as string);
  return Number.isFinite(pt) && pt > now ? 'ok' : 'ended';
}

const AI_RANK = ['free', 'plus', 'pro'];
/** An AI tier's rank: free 0, plus 1, pro 2; anything else counts as free. */
export const aiRank = (t: unknown) => Math.max(0, AI_RANK.indexOf(String(t)));
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The plans a paid server can move to in place: against the server's own version (sub.plan), every field it states
 * (each resources key on its own, so disk read and disk write are two fields; aliases; bot URLs; storage shares; the AI tier rank) is
 * kept or raised, and one at least is raised. Never its own version (`plan_id`), never a refused or unsellable plan.
 * Catalogue order, then price. The server's up-only rule decides; this only offers.
 */
export function upgradeCandidates<P extends { id?: unknown; resources?: unknown; sort_order?: unknown }>(
  sub: UpgradeSub | null | undefined,
  plans: readonly P[] | null | undefined,
  refused: readonly string[] = [],
): P[] {
  const cur = sub?.plan;
  if (!sub || !cur || !cur.resources || typeof cur.resources !== 'object' || typeof sub.plan_id !== 'string') return [];
  const curRes = cur.resources as Rec;
  const out: P[] = [];
  for (const p of plans ?? []) {
    if (!p || typeof p.id !== 'string' || !p.resources || typeof p.resources !== 'object' || p.id === sub.plan_id) continue;
    if (refused.includes(p.id)) continue;
    if (!validPlan(p)) continue;
    const pr = p.resources as Rec;
    let ok = true;
    let up = false;
    const cmp = (a: unknown, b: unknown) => {
      const x = finite(a);
      if (x === null) return;
      const y = finite(b);
      if (y === null || y < x) ok = false;
      else if (y > x) up = true;
    };
    for (const f of Object.keys(curRes)) cmp(curRes[f], pr[f]);
    cmp(cur.max_proxy_aliases, (p as Rec).max_proxy_aliases);
    cmp(cur.max_bot_urls, (p as Rec).max_bot_urls);
    cmp(cur.max_storage_shares, (p as Rec).max_storage_shares);
    cmp(aiRank(cur.ai_tier), aiRank((p as Rec).ai_tier));
    if (ok && up) out.push(p);
  }
  return out.sort((a, b) => (finite(a.sort_order) ?? 0) - (finite(b.sort_order) ?? 0) || ((a as Rec).price_cents_per_month as number) - ((b as Rec).price_cents_per_month as number));
}

export function findPlan(plans: unknown, familyId: string): Plan | null {
  if (!Array.isArray(plans)) return null;
  for (const p of plans as unknown[]) {
    if (validPlan(p) && p.family_id === familyId) return p;
  }
  return null;
}

export type ErrorClass =
  | 'unknown' | 'auth' | 'rate' | 'permission' | 'gone' | 'funds' | 'priceChanged' | 'limit' | 'capacity' | 'regionFull' | 'regionUnknown' | 'intent' | 'refused';

export function classifyError(err: unknown): ErrorClass {
  const e = err as ErrLike;
  const status = e && e.status;
  const code = e && e.code;
  if (typeof status !== 'number' || status === 0 || status >= 500) return 'unknown'; // verdict never arrived
  if (status === 401) return 'auth';
  if (status === 429) return 'rate';
  if (status === 403) return 'permission';
  if (code === 'PLAN_NOT_AVAILABLE') return 'gone';
  if (code === 'INSUFFICIENT_BALANCE') return 'funds';
  if (code === 'CHARGE_EXCEEDS_MAX' || code === 'CHARGE_CONFIRMATION_REQUIRED') return 'priceChanged';
  if (code === 'PAID_SUBSERVER_LIMIT_REACHED') return 'limit';
  if (code === 'NO_PAID_CAPACITY' || code === 'HOST_UNAVAILABLE') return 'capacity';
  // The chosen location has no room now (never placed elsewhere), or is not a location of the list any more.
  if (code === 'NO_PAID_CAPACITY_IN_REGION') return 'regionFull';
  if (code === 'PAID_REGION_UNKNOWN') return 'regionUnknown';
  if (code === 'IDEMPOTENCY_INTENT_MISMATCH') return 'intent';
  return 'refused';
}

// ---- where a paid plan's server can run ----
/** A location a server is or would be in: the region code and, for display, its country code and city (either may be ''). */
export interface PaidPlace { region: string; country: string; city: string }
/** A location of a plan's list: `available` says a server of THIS plan can be placed there now. */
export interface PaidRegion extends PaidPlace { available: boolean }

const placeText = (x: unknown): string | null => (x == null ? '' : typeof x === 'string' && x.length <= 128 ? x.trim() : null);
/** A location as the API sends one ({region, country, city}); null for anything else (no code, a field of another type). */
export function paidPlace(x: unknown): PaidPlace | null {
  const r = x as Rec | null | undefined;
  if (!r || typeof r !== 'object' || Array.isArray(r) || !regionCode(r.region)) return null;
  const country = placeText(r.country), city = placeText(r.city);
  return country === null || city === null ? null : { region: r.region, country, city };
}
/**
 * The locations of one plan, as GET /subserver-subscriptions/regions answers ({plan_id, regions}). The answer must be
 * about the plan that was asked and every row whole (a code, a real boolean `available`), each code once: anything else
 * is no list (null), never a shorter one, so a location is never shown as offered, or as having room, on a guess.
 */
export function paidRegions(d: unknown, planId: string): PaidRegion[] | null {
  const r = d as Rec | null | undefined;
  if (!r || typeof r !== 'object' || r.plan_id !== planId || !Array.isArray(r.regions) || r.regions.length > 500) return null;
  const out: PaidRegion[] = [];
  const seen = new Set<string>();
  for (const x of r.regions as unknown[]) {
    const p = paidPlace(x);
    const available = (x as Rec | null)?.available;
    if (!p || typeof available !== 'boolean' || seen.has(p.region)) return null;
    seen.add(p.region);
    out.push({ ...p, available });
  }
  return out;
}

function bNewIdemKey(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch { /* fall through */ }
  let s = 'sb-';
  try {
    const a = new Uint8Array(16);
    globalThis.crypto.getRandomValues(a);
    for (const b of a) s += (b < 16 ? '0' : '') + b.toString(16);
    return s;
  } catch {
    for (let j = 0; j < 32; j++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// wallet
// ════════════════════════════════════════════════════════════════════════════

export function normalizeAmount(raw: unknown): string | null {
  const s = (raw == null ? '' : String(raw)).trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(s)) return null;
  if (s.indexOf('.') === -1) return s + '.00';
  const p = s.split('.');
  return p[0] + '.' + (p[1] + '00').slice(0, 2);
}

export const REFETCH_AFTER: Record<string, 1> = { granted: 1, already_claimed: 1, not_linked: 1, retry: 1 };

export const CARD_HOST_RE = /^https:\/\/([a-z0-9-]+\.)*stripe\.com\//i;

export const CRYPTO_HOST_RE = /^https:\/\/([a-z0-9-]+\.)*nowpayments\.io\//i;

export const RETURN_POLL_MAX = 10;
export const RETURN_POLL_MS = 2000;

export function returnProviderPrefix(p: unknown): 'crypto' | 'card' { return p === 'crypto' ? 'crypto' : 'card'; }

// ════════════════════════════════════════════════════════════════════════════
// subs
// ════════════════════════════════════════════════════════════════════════════

const ORDER: Record<string, number> = { held: 0, past_due: 1, provisioning: 2, delivery_failed: 3, change_stuck: 4, active: 5, wiping: 6, terminated: 8, host_wiped: 8 };

export interface SubLike {
  id?: unknown;
  state?: unknown;
  plan?: unknown;
  plan_id?: unknown;
  delete_at?: unknown;
  active_operation_id?: unknown;
  auto_renew?: unknown;
  server_name?: unknown;
  server_id?: unknown;
  [k: string]: unknown;
}

export interface PlanInfo { title: string; priceCents: number | null; holdDays: number | null }

export function planIndex(plans: unknown): Record<string, PlanInfo> {
  const idx: Record<string, PlanInfo> = {};
  if (!Array.isArray(plans)) return idx;
  (plans as unknown[]).forEach((pIn) => {
    const p = pIn as Rec | null;
    if (!p || typeof p.id !== 'string' || !p.id) return;
    const t = (p.text || {}) as Rec;
    idx[p.id] = {
      title: (typeof t.title === 'string' && t.title) || (typeof t.type_label === 'string' && t.type_label) || '',
      priceCents: isCount(p.price_cents_per_month) ? p.price_cents_per_month : null,
      holdDays: isCount(p.hold_days) ? p.hold_days : null,
    };
  });
  return idx;
}

export function infoFor(sub: SubLike | null | undefined, idx: Record<string, PlanInfo> | null | undefined): PlanInfo {
  const own = sub && sub.plan && typeof sub.plan === 'object' ? (sub.plan as Rec) : null;
  const cat = (sub && idx && has(idx, sub.plan_id as PropertyKey)) ? (idx[sub.plan_id as string] as PlanInfo) : null;
  const title = (own && typeof own.title === 'string' && own.title) || (cat && cat.title) || '';
  const price = own && isCount(own.price_cents_per_month) ? own.price_cents_per_month : (cat ? cat.priceCents : null);
  const hold = own && isCount(own.hold_days) ? own.hold_days : (cat ? cat.holdDays : null);
  return { title, priceCents: price, holdDays: hold };
}

function heldPaid(sub: SubLike | null | undefined): boolean { return !!sub && sub.delete_at === null; }

export interface CardView { tone: 'busy' | 'ok' | 'warn' | 'danger' | 'muted'; text: string; pay: 'pay' | 'retry' | null }

export function cardView(sub: SubLike | null | undefined): CardView {
  const op = !!(sub && sub.active_operation_id);
  switch (sub && sub.state) {
    case 'provisioning': return { tone: 'busy', text: tt('auth.hub.subs.stProvisioning', 'Being set up — usually a few minutes'), pay: null };
    case 'active': return { tone: 'ok', text: tt('auth.hub.subs.stActive', 'Active'), pay: null };
    case 'past_due':
      // past_due exists while a hold is stopping it (set together with active_operation_id);
      // the API refuses a payment until that hold is done. An auto-renew-off subscription is
      // stopped the same way (reason auto_renew_off): not a failed payment, so the
      // words say why it is stopping.
      if (!op) return { tone: 'warn', text: tt('auth.hub.subs.stPastDue', 'Payment due'), pay: 'pay' };
      return { tone: 'busy', pay: null, text: (sub as SubLike).auto_renew === false
        ? tt('auth.hub.subs.stStoppingOff', 'Auto-renew is off, so it is stopping — you can pay to resume in a few minutes')
        : tt('auth.hub.subs.stStopping', 'Stopping for non-payment — you can pay in a few minutes') };
    case 'held': {
      if (heldPaid(sub)) {
        // Paid (pay() keeps it held until its resume op finishes): resuming, or that resume failed.
        return op
          ? { tone: 'busy', text: tt('auth.hub.subs.stResuming', 'Payment received — starting again'), pay: null }
          : { tone: 'warn', text: tt('auth.hub.subs.stResumeFailed', 'Payment received — starting again didn\'t complete'), pay: 'retry' };
      }
      const when = fmtUtcDate((sub as SubLike).delete_at);
      return { tone: 'danger', pay: 'pay', text: when
        ? tt('auth.hub.subs.stHeld', 'On hold — will be deleted {{date}}', { date: when })
        : tt('auth.hub.subs.stHeldNoDate', 'On hold — pay to resume before it is permanently deleted') };
    }
    case 'wiping': return { tone: 'danger', text: tt('auth.hub.subs.stWiping', 'Being permanently deleted'), pay: null };
    case 'terminated': case 'host_wiped': return { tone: 'muted', text: tt('auth.hub.subs.stEnded', 'Ended'), pay: null };
    case 'delivery_failed': return { tone: 'warn', text: tt('auth.hub.subs.stFailed', 'Setup didn\'t complete — our team has been alerted'), pay: null };
    case 'change_stuck': return { tone: 'warn', text: tt('auth.hub.subs.stStuck', 'A change is being finished — our team is checking it'), pay: null };
    default: return { tone: 'muted', text: tt('auth.hub.subs.stOther', 'Unavailable right now'), pay: null };
  }
}

export function stateView(sub: SubLike | null | undefined): Pick<CardView, 'tone' | 'text'> {
  const v = cardView(sub);
  return { tone: v.tone, text: v.text };
}

export function sortSubs<T extends SubLike>(list: T[]): T[] {
  return list.slice().sort((a, b) => {
    const oa = has(ORDER, a.state as PropertyKey) ? (ORDER[a.state as string] as number) : 7;
    const ob = has(ORDER, b.state as PropertyKey) ? (ORDER[b.state as string] as number) : 7;
    return oa - ob;
  });
}

export function validSub(s: unknown): boolean {
  const r = s as SubLike | null | undefined;
  return !!(r && typeof r.id === 'string' && r.id && typeof r.state === 'string');
}

const PAID_NAME_RE = /^paid-[0-9a-f]{24}$/;

export function hostLabel(sub: SubLike): string {
  if (typeof sub.server_name === 'string' && sub.server_name) {
    return PAID_NAME_RE.test(sub.server_name) ? '#' + sub.server_name.slice(-8) : sub.server_name.slice(0, 80);
  }
  const id = (typeof sub.server_id === 'string' && sub.server_id) || sub.id;
  return '#' + String(id).slice(-8);
}

// ════════════════════════════════════════════════════════════════════════════
// section objects (market / buy / wallet / subs)
// ════════════════════════════════════════════════════════════════════════════

export const market = {
  isAccountBannedError, normRuleMap, centsFromUsdString: mCentsFromUsdString, fmtCents: mFmtCents, tierValidity, quoteFor,
  normalizeStockRow, normalizeOfferRow, defaultFilters, applyFilters, errData, isAmbiguous, postEventFor,
  purchaseTransition, pmCanClose, PM_TERMINALS, advisoryMatch, validMarketReceipt, validResumeMarker, lruPollPick, readAvailableDays,
  denyRowTiers, RENTAL_DAYS_MAX, RESUME_TTL_MS: MARKET_RESUME_TTL_MS, newIdemKey: mNewIdemKey,
  writeResumeMarker, readResumeMarker, clearResumeMarker, hasResume, RESUME_KEY: MARKET_RESUME_KEY,
};

// ---- recovery reads: what a read-only check of a held money request may say ----
// A read never sends, never settles a hold and never shows failed or not sent: no read names the held key's own
// operation, so what it sees is evidence at most ("it may be this purchase") and the hold stays.
// Even an upgrade on its target plan may be another client's change while this one never arrived.
export type HoldEvidence =
  | { kind: 'created'; at: string; title: string | null }
  | { kind: 'paidThrough'; until: string }
  | { kind: 'reserved'; at: string }
  | { kind: 'planReached' }
  | { kind: 'rented' };
export type HoldCheck =
  | { check: 'running' }
  | { check: 'unknown'; evidence: HoldEvidence | null }
  /** No hold is kept for this target now (answered elsewhere, or another account): nothing to check. */
  | { check: 'none' };

/** An upgrade's subscription read: 'running' while it names an operation in progress; 'reached' on the target plan
 *  with the operation field present and empty (evidence only); null otherwise, a missing or malformed field included. */
export function upgradeSeen(sub: unknown, targetPlanId: string): 'running' | 'reached' | null {
  const r = sub as Rec | null | undefined;
  if (!r || typeof r !== 'object' || !('active_operation_id' in r)) return null;
  const op = r.active_operation_id;
  if (typeof op === 'string' && op !== '') return 'running';
  if (op !== null) return null;
  return typeof r.plan_id === 'string' && r.plan_id !== '' && r.plan_id === targetPlanId ? 'reached' : null;
}

/** A buy's list read: the newest subscription of the held plan (version or family) created at or after the claim. */
export function buyEvidence(subs: unknown, held: { plan_id?: string; family_id?: string; at: number }): HoldEvidence | null {
  if (!Array.isArray(subs)) return null;
  let best: { at: number; ev: HoldEvidence } | null = null;
  for (const item of subs as unknown[]) {
    const r = item as Rec | null;
    if (!r || typeof r !== 'object') continue;
    const plan = (r.plan && typeof r.plan === 'object' ? r.plan : {}) as Rec;
    const same = (!!held.plan_id && r.plan_id === held.plan_id) || (!!held.family_id && plan.family_id === held.family_id);
    if (!same) continue;
    const ct = Date.parse(r.created_at as string);
    if (isNaN(ct) || ct < held.at) continue;
    if (!best || ct > best.at) best = { at: ct, ev: { kind: 'created', at: new Date(ct).toISOString(), title: typeof plan.title === 'string' && plan.title ? plan.title.slice(0, 80) : null } };
  }
  return best ? best.ev : null;
}

/** A payment's subscription read: the paid period's end, shown as evidence only (an auto-renewal moves it too). */
export function payEvidence(sub: unknown): HoldEvidence | null {
  const r = sub as Rec | null | undefined;
  if (!r || typeof r !== 'object' || typeof r.paid_through !== 'string') return null;
  const t = Date.parse(r.paid_through);
  return isNaN(t) ? null : { kind: 'paidThrough', until: new Date(t).toISOString() };
}

/** The request a kept record would send, as one comparable string: owner, key, ceiling and every body field (never its
 *  phase, time or title). A resend goes only while the record still has exactly the signature it was confirmed for. */
export function heldRequestSig(e: { kind?: string; user_id: string; key: string; max_charge_cents?: number; ceiling?: number; sub_id?: string; plan_id?: string; family_id?: string; offer_id?: string; days?: string; region?: string }): string {
  // A buy's chosen location is a body field too; a request without one keeps the signature it always had.
  return JSON.stringify([e.kind ?? null, e.user_id, e.key, e.max_charge_cents ?? e.ceiling ?? null, e.sub_id ?? null, e.plan_id ?? null, e.family_id ?? null, e.offer_id ?? null, e.days ?? null, ...(e.region ? [e.region] : [])]);
}

export const buy = {
  parseIntent, readIntent, dropIntent, parseResume, centsFromUsdString: bCentsFromUsdString, fmtCents: bFmtCents,
  fmtUtcDate, findPlan, validPlan, classifyError, newIdemKey: bNewIdemKey, parsePending, failedOutcome, definitive,
  validEnvelope, claimPending, claimShown, dropPending, readPendingAll, pendingBody, withPendingLock, findPending,
  hasWebLocks, pendingLockHeld, regionCode,
  writePendingAll, INTENT_KEY, INTENT_TTL_MS, RESUME_KEY: BUY_RESUME_KEY, RESUME_TTL_MS: BUY_RESUME_TTL_MS,
  PENDING_KEY, MONEY_DEFINITIVE,
};

export const wallet = {
  normalizeAmount, CARD_HOST_RE, CRYPTO_HOST_RE, REFETCH_AFTER, RETURN_POLL_MAX, RETURN_POLL_MS, returnProviderPrefix,
};

export const subs = { planIndex, infoFor, cardView, stateView, sortSubs, hostLabel, validSub };

