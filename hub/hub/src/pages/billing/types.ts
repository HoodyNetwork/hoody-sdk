// Shapes of the billing page. The raw records are the API's answers as hub-core's commerce module returns them
// (loadSubscriptions, catalogue, githubBonus, balances, the AI usage read); every field is optional because the
// API is untrusted input and logic.ts checks each one before it shows it.
import type strings from './strings.en.json';
import type { StringKey } from '@kit';

export type Key = StringKey<typeof strings>;
export type Vars = Readonly<Record<string, string | number>>;

/** A sentence as a string key plus its values, so logic stays free of the translator. */
export interface Word {
  k: Key;
  v?: Vars;
}

export type AiTier = 'free' | 'plus' | 'pro' | 'bare_metal';

export interface Resources {
  cpu_cores?: number;
  ram_gb?: number;
  disk_limit_gb?: number;
  disk_io_read_mib?: number;
  disk_io_write_mib?: number;
  network_limit_mbps?: number;
  max_computers?: number;
  snapshots_per_computer?: number;
  ai_multiplier?: number;
  [field: string]: number | undefined;
}

/** A plan on sale (GET /subserver-plans). */
export interface RawPlan {
  id: string;
  family_id: string;
  price_cents_per_month: number;
  hold_days: number;
  ai_tier?: string;
  sort_order?: number;
  max_proxy_aliases?: number;
  max_bot_urls?: number;
  resources?: Resources;
  text?: {
    title?: string;
    type_label?: string;
    description?: string;
    features?: string[];
  };
}

/** The plan version a subscription holds, in the user's terms. */
export interface PlanTerms {
  family_id?: string;
  title?: string;
  price_cents_per_month?: number;
  hold_days?: number;
  resources?: Resources;
  max_proxy_aliases?: number;
  max_bot_urls?: number;
  ai_tier?: string;
}

export interface RawSub {
  id: string;
  state: string;
  server_id?: string;
  server_name?: string;
  plan_id?: string;
  plan?: PlanTerms;
  paid_through?: string | null;
  delete_at?: string | null;
  active_operation_id?: string | null;
  auto_renew?: boolean;
  /** Country code of the machine, for the flag. */
  country?: string;
  /** Where the server is ({region, country, city}); null or absent while it has none (a failed delivery, a closed one). */
  region?: { region?: unknown; country?: unknown; city?: unknown } | null;
}

export interface UsageLane {
  status?: string;
  percent_used?: number;
  resets_at?: string;
}

export interface UsageServer {
  server?: { id?: string; name?: string };
  status?: string;
  as_of?: string;
  lanes?: Record<string, UsageLane | undefined>;
}

export interface RawUsage {
  servers?: UsageServer[];
  truncated?: boolean;
}

export interface RawBonus {
  enabled?: boolean;
  claimed?: boolean;
  claim?: { amount_usd?: string; at?: string };
  github_linked?: boolean;
  identity_claimed_elsewhere?: boolean;
  github_username?: string;
  amount_usd?: string;
}

export interface BonusResult {
  result: string;
  amount_usd?: string;
}

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent';

export interface SubsRead {
  subs: RawSub[];
  /** The list stopped early: `shown` of `total` paid servers were read. */
  partial: { shown: number; total: number } | null;
}

/** A payment-return check (core's verifyReturn), plus `checking` while it runs. */
export type ReturnState =
  | { state: 'checking' }
  | {
      state: 'unverified' | 'gone' | 'received' | 'failed' | 'cancelled' | 'processing';
    }
  | { state: 'review'; credited: boolean };

export interface TopUpMethod {
  key: 'card' | 'crypto';
  min: number;
  max: number;
}
