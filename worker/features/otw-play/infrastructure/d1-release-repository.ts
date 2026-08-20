import type {
  OtwPlayAdminReleaseAuditDto,
  OtwPlayAdminReleaseFlagsDto,
  OtwPlayAdminReleaseStateDto,
  OtwPlayAdminReleaseTransition,
} from "@contracts/otw-play";
import type {
  ReleaseRepository,
  ReleaseUpdateCommand,
  ReleaseUpdateResult,
} from "../application/ports/release-repository";
import { ReleaseRepositoryError } from "../application/ports/release-repository";

type StateRow = {
  catalog_revision: number;
  read_model_revision: number | null;
  public_read_enabled: number;
  navigation_visible: number;
  updated_at: number;
};

type AuditRow = {
  id: number;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  detail: string | null;
  created_at: number;
};

const STATE_SQL = `SELECT
  catalog.revision AS catalog_revision,
  read_model.revision AS read_model_revision,
  catalog.public_read_enabled,
  catalog.navigation_visible,
  catalog.updated_at
FROM music_catalog_meta AS catalog
LEFT JOIN music_public_read_model_meta AS read_model ON read_model.id = catalog.id
WHERE catalog.id = 1`;

const toState = (row: StateRow | undefined): OtwPlayAdminReleaseStateDto => {
  if (!row) throw new ReleaseRepositoryError("Release state is unavailable");
  const catalogRevision = Number(row.catalog_revision);
  const readModelRevision =
    row.read_model_revision === null ? null : Number(row.read_model_revision);
  const publicReadEnabled = Boolean(row.public_read_enabled);
  const navigationVisible = Boolean(row.navigation_visible);
  const updatedAt = Number(row.updated_at);
  if (
    !Number.isSafeInteger(catalogRevision) ||
    catalogRevision < 0 ||
    (readModelRevision !== null &&
      (!Number.isSafeInteger(readModelRevision) || readModelRevision < 0)) ||
    (navigationVisible && !publicReadEnabled) ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt < 0
  ) {
    throw new ReleaseRepositoryError("Release state is invalid");
  }
  return {
    catalogRevision,
    readModelRevision,
    publicReadEnabled,
    navigationVisible,
    updatedAt,
    readyForPublicRead: readModelRevision === catalogRevision,
  };
};

const isFlags = (value: unknown): value is OtwPlayAdminReleaseFlagsDto =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).publicReadEnabled === "boolean" &&
      typeof (value as Record<string, unknown>).navigationVisible === "boolean",
  );

const transitions = new Set<OtwPlayAdminReleaseTransition>([
  "enable_public_read",
  "enable_navigation",
  "disable_navigation",
  "rollback_all",
]);

const toAudit = (row: AuditRow): OtwPlayAdminReleaseAuditDto | null => {
  if (!row.actor_id || !transitions.has(row.action as OtwPlayAdminReleaseTransition)) {
    return null;
  }
  try {
    const detail = JSON.parse(row.detail ?? "null") as Record<string, unknown> | null;
    if (!detail || !isFlags(detail.previous) || !isFlags(detail.current)) {
      return null;
    }
    return {
      id: String(row.id),
      transition: row.action as OtwPlayAdminReleaseTransition,
      previous: detail.previous,
      current: detail.current,
      actor: { id: row.actor_id, displayName: row.actor_name },
      changedAt: Number(row.created_at),
    };
  } catch {
    return null;
  }
};

const sumMeta = (
  results: readonly D1Result<unknown>[],
  key: "rows_read" | "rows_written",
) => {
  const values = results.map((result) => {
    const value = (result.meta as Record<string, unknown> | undefined)?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  });
  return values.every((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
};

export class D1ReleaseRepository implements ReleaseRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async readState(): Promise<OtwPlayAdminReleaseStateDto> {
    try {
      const result = await this.db.prepare(STATE_SQL).all<StateRow>();
      return toState(result.results[0]);
    } catch (error) {
      if (error instanceof ReleaseRepositoryError) throw error;
      throw new ReleaseRepositoryError("Release state read failed");
    }
  }

  async readRecentChanges(limit: number): Promise<OtwPlayAdminReleaseAuditDto[]> {
    const bounded = Math.min(20, Math.max(1, Math.trunc(limit)));
    try {
      const result = await this.db
        .prepare(`SELECT id, action, actor_id, actor_name, detail, created_at
          FROM admin_audit_logs
          WHERE event_type = 'otw_play.release.updated'
            AND resource_type = 'otw_play_release'
            AND status = 'success'
          ORDER BY created_at DESC, id DESC
          LIMIT ?`)
        .bind(bounded)
        .all<AuditRow>();
      return result.results.flatMap((row) => {
        const audit = toAudit(row);
        return audit ? [audit] : [];
      });
    } catch {
      throw new ReleaseRepositoryError("Release audit read failed");
    }
  }

  async update(command: ReleaseUpdateCommand): Promise<ReleaseUpdateResult> {
    const expectedPublic = Number(command.expected.publicReadEnabled);
    const expectedNavigation = Number(command.expected.navigationVisible);
    const targetPublic = Number(command.target.publicReadEnabled);
    const targetNavigation = Number(command.target.navigationVisible);
    const requiresReadiness = Number(
      command.transition === "enable_public_read" ||
        command.transition === "enable_navigation",
    );
    const detail = JSON.stringify({
      previous: {
        publicReadEnabled: command.expected.publicReadEnabled,
        navigationVisible: command.expected.navigationVisible,
      },
      current: command.target,
      transition: command.transition,
    });
    try {
      const results = await this.db.batch([
        this.db
          .prepare(`INSERT INTO admin_audit_logs (
              event_type, resource_type, resource_id, action, status,
              actor_id, actor_name, actor_ip, target_count, success_count,
              failure_count, detail, error, created_at
            )
            SELECT 'otw_play.release.updated', 'otw_play_release', ?, ?, 'success',
              ?, ?, ?, 1, 1, 0, ?, NULL, ?
            FROM music_catalog_meta AS catalog
            LEFT JOIN music_public_read_model_meta AS read_model
              ON read_model.id = catalog.id
            WHERE catalog.id = 1
              AND catalog.public_read_enabled = ?
              AND catalog.navigation_visible = ?
              AND catalog.updated_at = ?
              AND (? = 0 OR read_model.revision = catalog.revision)`)
          .bind(
            command.auditId,
            command.transition,
            command.actor.userId,
            command.actor.displayName,
            command.actor.ipAddress,
            detail,
            command.changedAt,
            expectedPublic,
            expectedNavigation,
            command.expected.updatedAt,
            requiresReadiness,
          ),
        this.db
          .prepare(`UPDATE music_catalog_meta AS catalog
            SET public_read_enabled = ?, navigation_visible = ?, updated_at = ?
            WHERE id = 1
              AND public_read_enabled = ?
              AND navigation_visible = ?
              AND updated_at = ?
              AND (? = 0 OR revision = (
                SELECT revision FROM music_public_read_model_meta WHERE id = 1
              ))
            RETURNING revision AS catalog_revision,
              public_read_enabled, navigation_visible, updated_at`)
          .bind(
            targetPublic,
            targetNavigation,
            command.changedAt,
            expectedPublic,
            expectedNavigation,
            command.expected.updatedAt,
            requiresReadiness,
          ),
        this.db.prepare(STATE_SQL),
      ]);
      const state = toState((results[2]?.results ?? [])[0] as StateRow | undefined);
      const diagnostics = {
        rowsRead: sumMeta(results, "rows_read"),
        rowsWritten: sumMeta(results, "rows_written"),
      };
      const updated = (results[1]?.results ?? []).length === 1;
      if (updated) {
        return {
          kind: "updated",
          response: {
            data: state,
            transition: command.transition,
            changedAt: command.changedAt,
          },
          diagnostics,
        };
      }
      const stale =
        state.publicReadEnabled !== command.expected.publicReadEnabled ||
        state.navigationVisible !== command.expected.navigationVisible ||
        state.updatedAt !== command.expected.updatedAt;
      return {
        kind: stale ? "stale" : "policy_unresolved",
        state,
        diagnostics,
      };
    } catch (error) {
      if (error instanceof ReleaseRepositoryError) throw error;
      throw new ReleaseRepositoryError("Release update failed");
    }
  }
}
