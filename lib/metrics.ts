/**
 * Metrics normalization and humanization utilities.
 *
 * Data flow:
 *   API response (envelope with `.data`) -> deep clone -> normalize CPU/memory
 *   in-place on the clone -> attach lazy `metrics_human` getter via
 *   Object.defineProperty -> return modified clone (original response untouched).
 *
 * Why this exists:
 * Some container CPU payloads expose a cumulative CPU time ratio as
 * `usage_percent`, which can grow far beyond sane percentage ranges (e.g. 50000%).
 * These helpers detect such broken formulas, normalize them using delta-sampling
 * or uptime-based fallbacks, and attach friendly `metrics_human` / `metrics_human_summary`
 * fields while preserving raw values for debugging.
 *
 * Key design choices:
 * - All mutation happens on a clone; callers get a new object.
 * - `metrics_human` is a lazy self-replacing getter (see `defineCachedGetter`)
 *   so humanization work is skipped if the field is never accessed.
 * - Type guards use `UnknownRecord` throughout for defensive narrowing:
 *   server schemas can drift, so every field access is guarded.
 */

type UnknownRecord = Record<string, unknown>;
type ByteUnitSystem = 'iec' | 'si';
/** Tracks whether a reference timestamp came from the server response or from Date.now(). */
type ReferenceClockSource = 'server' | 'client';

/** Nanoseconds per millisecond — used to convert between wall-clock deltas and CPU ns counters. */
const NS_PER_MS = 1_000_000;
/** Nanoseconds per second — used for duration formatting. */
const NS_PER_SECOND = 1_000_000_000;
/**
 * Maximum number of entries in the per-container CPU delta sample cache.
 * Prevents unbounded memory growth when monitoring many containers over time.
 * FIFO eviction: when exceeded, the oldest (first-inserted) entries are deleted.
 */
const MAX_CPU_SAMPLE_CACHE = 5_000;
/** Default byte unit system: IEC binary units (KiB, MiB, GiB) match infrastructure conventions. */
const DEFAULT_BYTE_UNIT_SYSTEM: ByteUnitSystem = 'iec';

interface IReferenceNow {
  nowMs: number;
  source: ReferenceClockSource;
}

interface ICpuUsageSample {
  usageNs: number;
  observedAtMs: number;
}

/**
 * Module-level singleton cache: maps container ID -> most recent CPU usage sample.
 * Used by normalizeCpuInPlace to compute CPU % via delta sampling (current - previous).
 * FIFO eviction via pruneCpuUsageSampleCache keeps size <= MAX_CPU_SAMPLE_CACHE.
 * Map insertion order is used as the eviction key (oldest first).
 */
const cpuUsageSamplesByContainerId = new Map<string, ICpuUsageSample>();

/** Evict oldest entries when cache exceeds MAX_CPU_SAMPLE_CACHE to prevent memory leaks. */
function pruneCpuUsageSampleCache(): void {
  while (cpuUsageSamplesByContainerId.size > MAX_CPU_SAMPLE_CACHE) {
    const oldest = cpuUsageSamplesByContainerId.keys().next();
    if (oldest.done) break;
    cpuUsageSamplesByContainerId.delete(oldest.value);
  }
}

/**
 * Type guard: narrows unknown -> UnknownRecord.
 * Defensive against schema drift: API responses are typed as `unknown` throughout
 * this module, so every nested field access goes through these guards.
 */
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns value as UnknownRecord if it passes isRecord, undefined otherwise. */
function asRecord(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined;
}

/** Coerces value to a finite number (accepts numeric strings). Returns undefined if not representable. */
function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Parse an unknown value into a millisecond-epoch timestamp.
 *
 * Heuristic: values < 1e12 (1_000_000_000_000) are assumed to be Unix seconds
 * and are multiplied by 1000. Values >= 1e12 are assumed to already be
 * milliseconds. This threshold corresponds to ~2001-09-09 in ms, which is
 * safely in the past, and ~33658 AD in seconds, which is safely in the future.
 *
 * Also handles ISO 8601 date strings via Date.parse as a last resort.
 */
function parseTimestampMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Interpret values < 1e12 as unix seconds, otherwise milliseconds.
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const direct = Number(value);
  if (Number.isFinite(direct)) {
    return direct < 1_000_000_000_000 ? direct * 1000 : direct;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Deep-clone a value using a three-tier strategy:
 *   1. structuredClone (best — handles Dates, Maps, circular refs; available in modern runtimes)
 *   2. JSON round-trip (loses non-JSON types but works everywhere)
 *   3. Shallow return of the original reference (last resort if JSON.stringify throws,
 *      e.g. on BigInt values — at least the caller still gets usable data)
 */
function cloneValue<T>(value: T): T {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
  } catch {
    // Fall through to JSON clone fallback.
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    // Last resort: return original value.
    return value;
  }
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Floating-point approximate equality using combined relative + absolute tolerance.
 *
 * Returns true when `|a - b| <= max(absolute, max(|a|, |b|) * relative)`.
 *
 * The dual-tolerance approach avoids false negatives near zero (where relative
 * tolerance collapses) and near large values (where absolute tolerance is too tight).
 * Default relative=0.001 (0.1%) and absolute=0.5 are tuned for metrics percentages
 * where server-side rounding can introduce small discrepancies.
 */
function almostEqual(a: number, b: number, relative = 0.001, absolute = 0.5): boolean {
  const diff = Math.abs(a - b);
  return diff <= Math.max(absolute, Math.max(Math.abs(a), Math.abs(b)) * relative);
}

function formatPercent(value: number): string {
  return `${roundTo(value, 2).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}%`;
}

/**
 * Bytes are rendered with explicit IEC (binary) units by default:
 * KiB, MiB, GiB, TiB.
 */
function formatBytes(bytes: number, unitSystem: ByteUnitSystem = DEFAULT_BYTE_UNIT_SYSTEM): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes === 0) return '0 B';

  const base = unitSystem === 'si' ? 1000 : 1024;
  const units = unitSystem === 'si'
    ? ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    : ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

  let value = bytes;
  let unit = 0;
  while (value >= base && unit < units.length - 1) {
    value /= base;
    unit += 1;
  }

  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unit]}`;
}

function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;

  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatDurationNs(ns: number): string {
  return formatDurationSeconds(ns / NS_PER_SECOND);
}

/**
 * Lazy self-replacing getter pattern.
 *
 * On first access of `target[key]`, calls `compute()`, then uses
 * Object.defineProperty to replace the getter with a plain data property
 * holding the computed value. Subsequent accesses read the cached value
 * directly with no function call overhead.
 *
 * This is used for `metrics_human` and `metrics_human_summary`: the
 * humanization logic is non-trivial, and many consumers only need the
 * raw normalized data, so we defer the work until actually needed.
 *
 * The setter is also overridden so that explicit assignment (`target[key] = x`)
 * replaces the getter with a plain property, preserving normal object semantics.
 *
 * Skips installation if the key already exists as an own property (explicit value wins).
 */
function defineCachedGetter(
  target: UnknownRecord,
  key: string,
  compute: () => unknown,
): void {
  // Respect existing explicit values.
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    return;
  }

  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: true,
    get() {
      const computed = compute();
      // Replace getter with plain data property on first access (self-replacing).
      Object.defineProperty(target, key, {
        value: computed,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      return computed;
    },
    set(value: unknown) {
      // Allow explicit assignment to override the lazy getter.
      Object.defineProperty(target, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    },
  });
}

/**
 * Extract the best available "now" timestamp from the API response.
 *
 * Priority: checks the envelope (wrapper) first, then the data object, for a
 * list of known server timestamp field names. If found, returns it as
 * source='server'. If none found, falls back to the provided Date.now() value
 * with source='client'.
 *
 * The clock source distinction matters for CPU normalization: when computing
 * container uptime (now - started_at), mixing a server-generated `started_at`
 * with a client-generated `now` introduces clock skew. The `source` field lets
 * downstream code tag the normalization reason accordingly.
 */
function extractReferenceNowMs(
  envelope: UnknownRecord,
  data: UnknownRecord,
  fallbackNowMs: number,
): IReferenceNow {
  const serverTimeKeys = [
    'server_time',
    'serverTime',
    'timestamp',
    'time',
    'generated_at',
    'captured_at',
    'collected_at',
    'now',
  ];

  for (const key of serverTimeKeys) {
    const fromEnvelope = parseTimestampMs(envelope[key]);
    if (fromEnvelope !== undefined) {
      return { nowMs: fromEnvelope, source: 'server' };
    }

    const fromData = parseTimestampMs(data[key]);
    if (fromData !== undefined) {
      return { nowMs: fromData, source: 'server' };
    }
  }

  return { nowMs: fallbackNowMs, source: 'client' };
}

function extractNetworkCounters(networkValue: unknown): {
  interfaces: UnknownRecord[];
  totalRxBytes: number;
  totalTxBytes: number;
} {
  if (!Array.isArray(networkValue)) {
    return { interfaces: [], totalRxBytes: 0, totalTxBytes: 0 };
  }

  const interfaces: UnknownRecord[] = [];
  let totalRxBytes = 0;
  let totalTxBytes = 0;

  for (const item of networkValue) {
    const iface = asRecord(item);
    if (!iface) continue;

    const counters = asRecord(iface.counters);
    const rx = asFiniteNumber(counters?.bytes_received) ?? 0;
    const tx = asFiniteNumber(counters?.bytes_sent) ?? 0;

    totalRxBytes += rx;
    totalTxBytes += tx;

    interfaces.push({
      interface: typeof iface.interface === 'string' ? iface.interface : null,
      rx_bytes: rx,
      tx_bytes: tx,
      rx_text: formatBytes(rx),
      tx_text: formatBytes(tx),
      unit_system: DEFAULT_BYTE_UNIT_SYSTEM,
    });
  }

  return { interfaces, totalRxBytes, totalTxBytes };
}

/**
 * CRITICAL FUNCTION — Normalize CPU usage_percent in place.
 *
 * Problem: some container runtimes expose `usage_percent` computed as
 * `(cumulative_cpu_ns / allocated_time_ns) * 100`. Because cumulative CPU time
 * grows monotonically, this "percent" can reach 50,000%+ and is useless as a
 * current utilization metric.
 *
 * Detection: the function checks whether `rawPercent > 1000` AND approximately
 * equals `(usage / allocated_time) * 100` using almostEqual. This fingerprints
 * the broken cumulative formula.
 *
 * Three normalization strategies (tried in order):
 *
 * 1. **Delta sampling (primary)**: compare current CPU ns to the previous sample
 *    for this container ID (stored in cpuUsageSamplesByContainerId). Compute
 *    `deltaUsageNs / elapsedNs * 100`. This gives true instantaneous CPU % and
 *    avoids clock-origin mismatch between server and client.
 *    Reason tag: 'delta_usage_over_elapsed_time'
 *
 * 2. **Uptime fallback (secondary)**: if no previous sample exists (first poll),
 *    estimate average CPU since start: `usageNs / (now - started_at) * 100`.
 *    Uses extractReferenceNowMs to prefer server clock when available.
 *    Reason tag: 'cumulative_usage_over_server_uptime' or
 *    'cumulative_usage_over_client_uptime'
 *
 * 3. **Raw fallback (tertiary)**: if no time reference is available, keeps
 *    the raw value and tags it 'cumulative_usage_percent_unstable_no_time_reference'
 *    so consumers know it is unreliable.
 *
 * After normalization, the original value is preserved as `cpu.usage_percent_raw`
 * and the strategy used is recorded in `cpu.usage_percent_normalization`.
 */
function normalizeCpuInPlace(
  containerStats: UnknownRecord,
  referenceNow: IReferenceNow,
): void {
  const cpu = asRecord(containerStats.cpu);
  if (!cpu) return;

  const rawPercent = asFiniteNumber(cpu.usage_percent);
  if (rawPercent === undefined) return;

  const usageNs = asFiniteNumber(cpu.usage);
  const allocatedNs = asFiniteNumber(cpu.allocated_time);

  let normalizedPercent = rawPercent;
  let normalizationReason: string | undefined;

  // Detect the broken cumulative formula: rawPercent > 1000 AND ≈ (usage/allocated_time)*100
  const looksLikeBrokenCumulativeFormula =
    usageNs !== undefined
    && allocatedNs !== undefined
    && allocatedNs > 0
    && rawPercent > 1000
    && almostEqual(rawPercent, (usageNs / allocatedNs) * 100, 0.002, 1);

  if (looksLikeBrokenCumulativeFormula && usageNs !== undefined) {
    const containerId =
      typeof containerStats.id === 'string' && containerStats.id.trim() !== ''
        ? containerStats.id
        : undefined;

    // Primary normalization path: use local delta samples to avoid clock-origin mismatch.
    if (containerId) {
      const observedAtMs = Date.now();
      const previous = cpuUsageSamplesByContainerId.get(containerId);
      cpuUsageSamplesByContainerId.set(containerId, { usageNs, observedAtMs });
      pruneCpuUsageSampleCache();

      if (
        previous
        && observedAtMs > previous.observedAtMs
        && usageNs >= previous.usageNs
      ) {
        const elapsedNs = (observedAtMs - previous.observedAtMs) * NS_PER_MS;
        if (elapsedNs > 0) {
          const deltaUsageNs = usageNs - previous.usageNs;
          if (deltaUsageNs > 0) {
            const deltaPercent = (deltaUsageNs / elapsedNs) * 100;
            if (Number.isFinite(deltaPercent) && deltaPercent >= 0) {
              normalizedPercent = deltaPercent;
              normalizationReason = 'delta_usage_over_elapsed_time';
            }
          }
        }
      }
    }

    // Secondary fallback: estimate average since start, using explicit clock source marker.
    if (!normalizationReason) {
      const startedAtMs = parseTimestampMs(containerStats.started_at);
      if (startedAtMs !== undefined && referenceNow.nowMs > startedAtMs) {
        const uptimeNs = (referenceNow.nowMs - startedAtMs) * NS_PER_MS;
        if (uptimeNs > 0) {
          const uptimePercent = (usageNs / uptimeNs) * 100;
          if (Number.isFinite(uptimePercent) && uptimePercent >= 0) {
            normalizedPercent = uptimePercent;
            normalizationReason = referenceNow.source === 'server'
              ? 'cumulative_usage_over_server_uptime'
              : 'cumulative_usage_over_client_uptime';
          }
        }
      }
    }

    if (!normalizationReason) {
      normalizationReason = 'cumulative_usage_percent_unstable_no_time_reference';
    }
  }

  cpu.usage_percent = roundTo(normalizedPercent, 6);

  if (!almostEqual(normalizedPercent, rawPercent, 0, 0) || normalizationReason) {
    cpu.usage_percent_raw = rawPercent;
    if (normalizationReason) {
      cpu.usage_percent_normalization = normalizationReason;
    }
  }
}

/**
 * Normalize memory usage_percent in place.
 *
 * Detects when usage_percent is a fraction (0..1) rather than a true percentage (0..100)
 * by checking whether it approximately equals `usage / total`. If confirmed,
 * multiplies by 100 and records the normalization reason.
 * Only converts when usage/total ratio corroborates the fraction hypothesis —
 * this prevents false positives on containers that genuinely use <1% memory.
 */
function normalizeMemoryInPlace(containerStats: UnknownRecord): void {
  const memory = asRecord(containerStats.memory);
  if (!memory) return;

  const rawPercent = asFiniteNumber(memory.usage_percent);
  if (rawPercent === undefined) return;

  const usageBytes = asFiniteNumber(memory.usage);
  const totalBytes = asFiniteNumber(memory.total);

  let normalizedPercent = rawPercent;
  let normalizationReason: string | undefined;

  // Only convert fraction-to-percent when we can prove it from usage/total ratio.
  if (
    rawPercent >= 0
    && rawPercent <= 1
    && usageBytes !== undefined
    && totalBytes !== undefined
    && totalBytes > 0
  ) {
    const usageFraction = usageBytes / totalBytes;
    if (almostEqual(rawPercent, usageFraction, 0.01, 0.001)) {
      normalizedPercent = rawPercent * 100;
      normalizationReason = 'fraction_to_percent_by_usage_total_ratio';
    }
  }

  memory.usage_percent = roundTo(normalizedPercent, 6);
  if (normalizationReason) {
    memory.usage_percent_raw = rawPercent;
    memory.usage_percent_normalization = normalizationReason;
  }
}

/**
 * Build the human-readable metrics object for a single container.
 *
 * Orchestration role: reads the already-normalized CPU/memory fields plus raw
 * disk and network data, and produces a flat `metrics_human` object with
 * formatted text strings (e.g. "45.2%", "1.23 GiB", "2h 15m"), network
 * interface breakdowns, and timing information including uptime.
 *
 * This function is called lazily via defineCachedGetter — it only runs
 * when a consumer accesses `containerStats.metrics_human`.
 */
function buildContainerHumanMetrics(
  containerStats: UnknownRecord,
  referenceNow: IReferenceNow,
): UnknownRecord {
  const cpu = asRecord(containerStats.cpu);
  const memory = asRecord(containerStats.memory);
  const disk = asRecord(containerStats.disk);
  const rootDisk = asRecord(disk?.root);

  const cpuUsageNs = cpu ? asFiniteNumber(cpu.usage) : undefined;
  const cpuAllocatedNs = cpu ? asFiniteNumber(cpu.allocated_time) : undefined;
  const cpuPercent = cpu ? asFiniteNumber(cpu.usage_percent) : undefined;
  const cpuRawPercent = cpu ? asFiniteNumber(cpu.usage_percent_raw) : undefined;

  const memoryUsageBytes = memory ? asFiniteNumber(memory.usage) : undefined;
  const memoryTotalBytes = memory ? asFiniteNumber(memory.total) : undefined;
  const memoryPercent = memory ? asFiniteNumber(memory.usage_percent) : undefined;

  const rootUsageBytes = asFiniteNumber(rootDisk?.usage);
  const rootTotalBytes = asFiniteNumber(rootDisk?.total);
  const rootPercent =
    rootUsageBytes !== undefined
    && rootTotalBytes !== undefined
    && rootTotalBytes > 0
      ? (rootUsageBytes / rootTotalBytes) * 100
      : undefined;

  const startedAtMs = parseTimestampMs(containerStats.started_at);
  const uptimeSeconds =
    startedAtMs !== undefined && referenceNow.nowMs > startedAtMs
      ? (referenceNow.nowMs - startedAtMs) / 1000
      : undefined;

  const network = extractNetworkCounters(containerStats.network);
  const cpuNormalizationReason = cpu && typeof cpu.usage_percent_normalization === 'string'
    ? cpu.usage_percent_normalization
    : undefined;

  const cpuHuman: UnknownRecord = {
    usage_percent: cpuPercent ?? null,
    usage_percent_text: cpuPercent !== undefined ? formatPercent(cpuPercent) : null,
    normalized: cpuNormalizationReason !== undefined,
  };
  if (cpuRawPercent !== undefined) {
    cpuHuman.raw_usage_percent = cpuRawPercent;
  }
  if (cpuNormalizationReason) {
    cpuHuman.normalization = cpuNormalizationReason;
  }
  if (cpuUsageNs !== undefined) {
    cpuHuman.usage_time_ns = cpuUsageNs;
    cpuHuman.usage_time_text = formatDurationNs(cpuUsageNs);
  }
  if (cpuAllocatedNs !== undefined) {
    cpuHuman.allocated_time_ns = cpuAllocatedNs;
    cpuHuman.allocated_time_text = formatDurationNs(cpuAllocatedNs);
  }

  const memoryHuman: UnknownRecord = {
    usage_percent: memoryPercent ?? null,
    usage_percent_text: memoryPercent !== undefined ? formatPercent(memoryPercent) : null,
  };
  if (memoryUsageBytes !== undefined) {
    memoryHuman.usage_bytes = memoryUsageBytes;
    memoryHuman.usage_text = formatBytes(memoryUsageBytes);
  }
  if (memoryTotalBytes !== undefined) {
    memoryHuman.total_bytes = memoryTotalBytes;
    memoryHuman.total_text = formatBytes(memoryTotalBytes);
  }

  const diskHuman: UnknownRecord = {
    root_usage_percent: rootPercent ?? null,
    root_usage_percent_text: rootPercent !== undefined ? formatPercent(rootPercent) : null,
  };
  if (rootUsageBytes !== undefined) {
    diskHuman.root_usage_bytes = rootUsageBytes;
    diskHuman.root_usage_text = formatBytes(rootUsageBytes);
  }
  if (rootTotalBytes !== undefined) {
    diskHuman.root_total_bytes = rootTotalBytes;
    diskHuman.root_total_text = formatBytes(rootTotalBytes);
  }

  const timingHuman: UnknownRecord = {
    started_at: typeof containerStats.started_at === 'string' ? containerStats.started_at : null,
    processing_time:
      typeof containerStats.processing_time === 'string' ? containerStats.processing_time : null,
    uptime_seconds: uptimeSeconds ?? null,
    uptime_text: uptimeSeconds !== undefined ? formatDurationSeconds(uptimeSeconds) : null,
    reference_clock: referenceNow.source,
  };

  return {
    cpu: cpuHuman,
    memory: memoryHuman,
    disk: diskHuman,
    network: {
      total_rx_bytes: network.totalRxBytes,
      total_tx_bytes: network.totalTxBytes,
      total_rx_text: formatBytes(network.totalRxBytes),
      total_tx_text: formatBytes(network.totalTxBytes),
      interfaces: network.interfaces,
      unit_system: DEFAULT_BYTE_UNIT_SYSTEM,
    },
    timing: timingHuman,
    unit_system: DEFAULT_BYTE_UNIT_SYSTEM,
  };
}

/**
 * Orchestration: normalize CPU and memory on a single container stats object,
 * then attach a lazy `metrics_human` getter.
 */
function normalizeContainerStatsDataInPlace(
  containerStats: UnknownRecord,
  referenceNow: IReferenceNow,
): void {
  normalizeCpuInPlace(containerStats, referenceNow);
  normalizeMemoryInPlace(containerStats);

  defineCachedGetter(containerStats, 'metrics_human', () =>
    buildContainerHumanMetrics(containerStats, referenceNow),
  );
}

function buildProjectHumanSummary(stats: UnknownRecord[]): UnknownRecord {
  let runningCount = 0;
  let cpuTotalPercent = 0;
  let cpuCount = 0;

  let memoryUsageTotalBytes = 0;
  let memoryTotalBytes = 0;

  let diskUsageTotalBytes = 0;
  let diskTotalBytes = 0;

  let networkRxBytesTotal = 0;
  let networkTxBytesTotal = 0;

  for (const stat of stats) {
    const status = typeof stat.status === 'string' ? stat.status.toLowerCase() : '';
    if (status === 'running') runningCount += 1;

    const cpu = asRecord(stat.cpu);
    const memory = asRecord(stat.memory);
    const disk = asRecord(stat.disk);
    const rootDisk = asRecord(disk?.root);

    const cpuPercent = asFiniteNumber(cpu?.usage_percent);
    if (cpuPercent !== undefined) {
      cpuTotalPercent += cpuPercent;
      cpuCount += 1;
    }

    const memoryUsage = asFiniteNumber(memory?.usage);
    const memoryTotal = asFiniteNumber(memory?.total);
    if (memoryUsage !== undefined) memoryUsageTotalBytes += memoryUsage;
    if (memoryTotal !== undefined) memoryTotalBytes += memoryTotal;

    const rootUsage = asFiniteNumber(rootDisk?.usage);
    const rootTotal = asFiniteNumber(rootDisk?.total);
    if (rootUsage !== undefined) diskUsageTotalBytes += rootUsage;
    if (rootTotal !== undefined) diskTotalBytes += rootTotal;

    const network = extractNetworkCounters(stat.network);
    networkRxBytesTotal += network.totalRxBytes;
    networkTxBytesTotal += network.totalTxBytes;
  }

  const cpuAveragePercent = cpuCount > 0 ? cpuTotalPercent / cpuCount : undefined;
  const memoryPercent =
    memoryTotalBytes > 0 ? (memoryUsageTotalBytes / memoryTotalBytes) * 100 : undefined;
  const diskPercent =
    diskTotalBytes > 0 ? (diskUsageTotalBytes / diskTotalBytes) * 100 : undefined;

  return {
    container_count: stats.length,
    running_container_count: runningCount,
    cpu_usage_percent_total: roundTo(cpuTotalPercent, 4),
    cpu_usage_percent_average:
      cpuAveragePercent !== undefined ? roundTo(cpuAveragePercent, 4) : null,
    cpu_usage_percent_average_text:
      cpuAveragePercent !== undefined ? formatPercent(cpuAveragePercent) : null,
    memory_usage_bytes_total: memoryUsageTotalBytes,
    memory_usage_text_total: formatBytes(memoryUsageTotalBytes),
    memory_total_bytes: memoryTotalBytes,
    memory_total_text: formatBytes(memoryTotalBytes),
    memory_usage_percent: memoryPercent !== undefined ? roundTo(memoryPercent, 4) : null,
    memory_usage_percent_text: memoryPercent !== undefined ? formatPercent(memoryPercent) : null,
    disk_usage_bytes_total: diskUsageTotalBytes,
    disk_usage_text_total: formatBytes(diskUsageTotalBytes),
    disk_total_bytes: diskTotalBytes,
    disk_total_text: formatBytes(diskTotalBytes),
    disk_usage_percent: diskPercent !== undefined ? roundTo(diskPercent, 4) : null,
    disk_usage_percent_text: diskPercent !== undefined ? formatPercent(diskPercent) : null,
    network_rx_bytes_total: networkRxBytesTotal,
    network_rx_text_total: formatBytes(networkRxBytesTotal),
    network_tx_bytes_total: networkTxBytesTotal,
    network_tx_text_total: formatBytes(networkTxBytesTotal),
    unit_system: DEFAULT_BYTE_UNIT_SYSTEM,
  };
}

/**
 * Entry point for single-container stats API responses.
 *
 * Orchestration: clones the response, extracts the best server/client reference
 * timestamp, normalizes CPU + memory, attaches lazy `metrics_human` getter,
 * returns the modified clone. The original response object is never mutated.
 */
export function normalizeContainerStatsResponse<T>(response: T): T {
  const envelope = asRecord(response);
  if (!envelope) return response;

  const originalData = asRecord(envelope.data);
  if (!originalData) return response;

  const clonedResponse = cloneValue(response);
  const clonedEnvelope = asRecord(clonedResponse);
  if (!clonedEnvelope) return response;

  const data = asRecord(clonedEnvelope.data);
  if (!data) return response;

  const referenceNow = extractReferenceNowMs(clonedEnvelope, data, Date.now());
  normalizeContainerStatsDataInPlace(data, referenceNow);
  return clonedResponse;
}

/**
 * Entry point for project-level (multi-container) stats API responses.
 *
 * Orchestration: clones the response, normalizes each container in `data.stats[]`,
 * then attaches a lazy `metrics_human_summary` getter on `data` that aggregates
 * totals/averages across all containers (CPU avg, memory sum, disk sum, network sum).
 */
export function normalizeProjectStatsResponse<T>(response: T): T {
  const envelope = asRecord(response);
  if (!envelope) return response;

  const originalData = asRecord(envelope.data);
  if (!originalData) return response;

  const originalStats = originalData.stats;
  if (!Array.isArray(originalStats)) return response;

  const clonedResponse = cloneValue(response);
  const clonedEnvelope = asRecord(clonedResponse);
  if (!clonedEnvelope) return response;

  const data = asRecord(clonedEnvelope.data);
  if (!data) return response;

  const statsValue = data.stats;
  if (!Array.isArray(statsValue)) return response;

  const referenceNow = extractReferenceNowMs(clonedEnvelope, data, Date.now());
  const normalizedStats: UnknownRecord[] = [];

  for (const item of statsValue) {
    const stat = asRecord(item);
    if (!stat) continue;
    normalizeContainerStatsDataInPlace(stat, referenceNow);
    normalizedStats.push(stat);
  }

  defineCachedGetter(data, 'metrics_human_summary', () =>
    buildProjectHumanSummary(normalizedStats),
  );

  return clonedResponse;
}
