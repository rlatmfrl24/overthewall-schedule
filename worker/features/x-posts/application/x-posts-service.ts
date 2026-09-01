import type { XCollectionRunResultDto } from "@contracts/operations";
import type {
  XLinkedPostPreviewDto,
  XPostsByHandleDto,
  XPostsResponseDto,
  XPostsVisibility,
} from "@contracts/x-posts";
import { authorizeXHandleTargets } from "./authorize-handle-targets";

const X_RICH_LINK_PREVIEW_SETTING_KEY = "x_rich_link_preview_enabled";
const X_POSTS_VISIBILITY_SETTING_KEY = "x_posts_visibility";

export type XPostsContent = Pick<XPostsResponseDto, "posts" | "byHandle">;

export type XPostsFetchOptions = {
  maxResults: number;
  richXLinkPreviewEnabled: boolean;
  refresh: boolean;
};

export type XActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorIp?: string | null;
};

export type XCollectionAuditInput = XActor & {
  status: "success" | "skipped" | "failed";
  targetCount: number;
  successCount: number;
  failureCount: number;
  detail: {
    checkedHandles: number;
    refreshedHandles: number;
    postsReturned: number;
    postsStored: number;
    apiCalls: number;
    estimatedCostMicros: number;
  } | null;
  error: string | null;
};

export interface XPostsApplicationPorts {
  readSetting(key: string): Promise<string | null>;
  readAllowedHandles(): Promise<ReadonlySet<string>>;
  fetchPosts(
    handles: string[],
    options: XPostsFetchOptions,
  ): Promise<XPostsContent>;
  readStoredReplyReference(
    sourcePostId: string,
  ): Promise<{ handle: string; replyToPostId: string } | null>;
  fetchPostPreview(postId: string): Promise<XLinkedPostPreviewDto | null>;
  redactStoredPost(postId: string): Promise<boolean>;
  writePostRedactionAudit(postId: string, actor: XActor, changed: boolean): Promise<void>;
  runCollection(): Promise<XCollectionRunResultDto>;
  writeCollectionAudit(input: XCollectionAuditInput): Promise<void>;
  warn(message: string, error: unknown): void;
}

export class XAllowlistUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("X handle allowlist is unavailable", options);
    this.name = "XAllowlistUnavailableError";
  }
}

export class XTargetsNotAllowedError extends Error {
  readonly unauthorized: string[];

  constructor(unauthorized: string[]) {
    super("Unapproved X handle targets");
    this.name = "XTargetsNotAllowedError";
    this.unauthorized = unauthorized;
  }
}

export class XReplyContextNotFoundError extends Error {
  constructor() {
    super("X reply context was not found");
    this.name = "XReplyContextNotFoundError";
  }
}

export type XPostFeedErrorDetails = {
  code?: string | null;
  sourceStatus?: number | null;
  detail?: string | null;
  diagnostics?: Array<{
    handle?: string;
    error: string | null;
    status: number | null;
    detail: string | null;
  }>;
};

export class XPostFeedError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly sourceStatus: number | null;
  readonly detail: string | null;
  readonly diagnostics: NonNullable<XPostFeedErrorDetails["diagnostics"]>;

  constructor(
    message: string,
    status: number,
    details: XPostFeedErrorDetails = {},
  ) {
    super(message);
    this.name = "XPostFeedError";
    this.status = status;
    this.code = details.code ?? null;
    this.sourceStatus = details.sourceStatus ?? null;
    this.detail = details.detail ?? null;
    this.diagnostics = details.diagnostics ?? [];
  }
}

const normalizeVisibility = (
  value: string | null | undefined,
): XPostsVisibility =>
  value === "public" || value === "private" ? value : "members";

const toAuditInput = (
  result: XCollectionRunResultDto,
  actor: XActor,
): XCollectionAuditInput => ({
  ...actor,
  status:
    result.status === "success"
      ? "success"
      : result.status === "skipped"
        ? "skipped"
        : "failed",
  targetCount: result.checkedHandles,
  successCount: result.refreshedHandles,
  failureCount:
    result.status === "failed"
      ? Math.max(1, result.checkedHandles - result.refreshedHandles)
      : 0,
  detail: {
    checkedHandles: result.checkedHandles,
    refreshedHandles: result.refreshedHandles,
    postsReturned: result.postsReturned,
    postsStored: result.postsStored,
    apiCalls: result.apiCalls,
    estimatedCostMicros: result.estimatedCostMicros,
  },
  error: result.error,
});

export const createXPostsApplication = (ports: XPostsApplicationPorts) => ({
  async readVisibility(): Promise<XPostsVisibility> {
    try {
      return normalizeVisibility(
        await ports.readSetting(X_POSTS_VISIBILITY_SETTING_KEY),
      );
    } catch (error) {
      ports.warn("Failed to read X posts visibility setting", error);
      return "members";
    }
  },

  async readPosts(handles: string[], maxResults: number) {
    let allowedHandles: ReadonlySet<string>;
    try {
      allowedHandles = await ports.readAllowedHandles();
    } catch (error) {
      throw new XAllowlistUnavailableError({ cause: error });
    }
    const authorized = authorizeXHandleTargets(handles, allowedHandles);
    if (!authorized.ok) {
      throw new XTargetsNotAllowedError(authorized.unauthorized);
    }

    let richXLinkPreviewEnabled = false;
    try {
      richXLinkPreviewEnabled =
        (await ports.readSetting(X_RICH_LINK_PREVIEW_SETTING_KEY)) === "true";
    } catch (error) {
      ports.warn("Failed to read X rich link preview setting", error);
    }

    return ports.fetchPosts(handles, {
      maxResults,
      richXLinkPreviewEnabled,
      refresh: false,
    });
  },

  async readReplyContext(sourcePostId: string) {
    let allowedHandles: ReadonlySet<string>;
    try {
      allowedHandles = await ports.readAllowedHandles();
    } catch (error) {
      throw new XAllowlistUnavailableError({ cause: error });
    }

    const reference = await ports.readStoredReplyReference(sourcePostId);
    if (!reference || !allowedHandles.has(reference.handle.toLowerCase())) {
      throw new XReplyContextNotFoundError();
    }

    const replyTo = await ports.fetchPostPreview(reference.replyToPostId);
    if (!replyTo) {
      throw new XReplyContextNotFoundError();
    }

    return {
      sourcePostId,
      replyTo,
    };
  },

  async redactPost(postId: string, actor: XActor) {
    const changed = await ports.redactStoredPost(postId);
    await ports.writePostRedactionAudit(postId, actor, changed);
    return changed;
  },

  async runManualCollection(actor: XActor) {
    try {
      const result = await ports.runCollection();
      await ports.writeCollectionAudit(toAuditInput(result, actor));
      return { ok: true as const, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      await ports.writeCollectionAudit({
        ...actor,
        status: "failed",
        targetCount: 0,
        successCount: 0,
        failureCount: 1,
        detail: null,
        error: message,
      });
      return { ok: false as const, error: message };
    }
  },
});

export type XPostsApplication = ReturnType<typeof createXPostsApplication>;
export type XPostFeedItem = XPostsByHandleDto["posts"][number];
