import type { OtwPlayIngestionBudgetDto } from "@contracts/otw-play";
import type { IngestionReadBudget } from "../application/ports/ingestion-read-budget";

export const INGESTION_READ_BUDGET_QUERY = `query PlayIngestionReadBudget(
  $accountTag: string, $filter: ZoneWorkersRequestsFilter_InputObject
) { viewer { accounts(filter: { accountTag: $accountTag }) {
  usage: d1AnalyticsAdaptiveGroups(limit: 1, filter: $filter) { sum { rowsRead } }
} } }`;

const DAY_MS = 86_400_000;
const DEFAULT_TARGET = 4_000_000;
type BudgetCache = Pick<Cache, "match" | "put">;

/** Account analytics only: admission must not itself spend D1 reads or writes. */
export class CloudflareIngestionReadBudget implements IngestionReadBudget {
  private readonly accountId: string | undefined;
  private readonly token: string | undefined;
  private readonly configuredTarget: string | undefined;
  private readonly fetcher: typeof fetch;
  private readonly clock: () => number;
  private readonly cache: BudgetCache | null;

  constructor(
    accountId: string | undefined,
    token: string | undefined,
    configuredTarget?: string,
    fetcher: typeof fetch = fetch,
    clock: () => number = Date.now,
    cache: BudgetCache | null = typeof caches === "undefined" ? null : caches.default,
  ) {
    this.accountId = accountId; this.token = token; this.configuredTarget = configuredTarget;
    this.fetcher = fetcher; this.clock = clock; this.cache = cache;
  }

  async read(): Promise<OtwPlayIngestionBudgetDto> {
    const now = this.clock();
    const today = Math.floor(now / DAY_MS) * DAY_MS;
    const configured = Number(this.configuredTarget);
    const dailyTarget = Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_TARGET;
    const base = { dailyTarget, measuredAt: new Date(now).toISOString(), resetAt: new Date(today + DAY_MS).toISOString() };
    const key = new Request(`https://play-budget.internal/${encodeURIComponent(this.accountId ?? "unconfigured")}/${today}/${dailyTarget}`);
    const save = async (result: OtwPlayIngestionBudgetDto) => {
      try { await this.cache?.put(key, Response.json(result, { headers: { "Cache-Control": "max-age=60" } })); } catch { /* Observation remains valid. */ }
      return result;
    };
    const unavailable = (reason: string): Promise<OtwPlayIngestionBudgetDto> => {
      console.warn("play.ingestion.read_budget_unavailable", { reason });
      return save({ ...base, status: "unavailable", rowsRead: null, reason });
    };
    try {
      const cached = await this.cache?.match(key);
      if (cached) {
        const value = await cached.json() as OtwPlayIngestionBudgetDto;
        const age = now - Date.parse(value.measuredAt);
        if (age >= 0 && age < 60_000 && value.status === "unavailable" && value.rowsRead === null &&
          value.resetAt === base.resetAt && value.dailyTarget === dailyTarget) return value;
        if (age >= 0 && age < 60_000 && value.resetAt === base.resetAt &&
          value.dailyTarget === dailyTarget && typeof value.rowsRead === "number" &&
          Number.isFinite(value.rowsRead) && value.rowsRead >= 0) {
          return { ...value, status: value.rowsRead >= dailyTarget ? "blocked" : "available" };
        }
      }
    } catch { /* A cache failure still permits a fresh analytics read. */ }
    if (!this.accountId?.trim() || !this.token?.trim()) return unavailable("unconfigured");
    try {
      const response = await this.fetcher("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: INGESTION_READ_BUDGET_QUERY, variables: {
          accountTag: this.accountId,
          // No databaseId filter: the daily allowance belongs to the account.
          filter: { datetimeHour_geq: new Date(today).toISOString(), datetimeHour_leq: new Date(now).toISOString() },
        } }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return unavailable(response.status === 401 || response.status === 403 ? "permission_denied" : "upstream_error");
      const payload = await response.json() as {
        errors?: unknown[];
        data?: { viewer?: { accounts?: Array<{ usage?: Array<{ sum?: { rowsRead?: number } }> }> } };
      };
      const accounts = payload.data?.viewer?.accounts;
      const usage = accounts?.[0]?.usage;
      if (payload.errors?.length || accounts?.length !== 1 || !Array.isArray(usage) || usage.length > 1) return unavailable("invalid_response");
      const rowsRead = usage.length === 0 ? 0 : usage[0]?.sum?.rowsRead;
      if (typeof rowsRead !== "number" || !Number.isFinite(rowsRead) || rowsRead < 0) return unavailable("invalid_response");
      const result: OtwPlayIngestionBudgetDto = { ...base, status: rowsRead >= dailyTarget ? "blocked" : "available", rowsRead, reason: rowsRead >= dailyTarget ? "daily_read_target" : null };
      return save(result);
    } catch { return unavailable("upstream_error"); }
  }
}
