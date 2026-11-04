import type { XCollectionProvider, XCollectionStatusDto } from "@contracts/x-collection";
import { XActivityError } from "./x-activity-service";

export interface XCollectionControlPorts {
  read(): Promise<XCollectionStatusDto>;
  change(source: XCollectionProvider): Promise<void>;
  audit(previous: XCollectionProvider, next: XCollectionProvider): Promise<void>;
}
export function createXCollectionApplication(ports: XCollectionControlPorts) {
  return {
    status: ports.read,
    async change(source: XCollectionProvider) {
      const before = await ports.read();
      await ports.change(source);
      const after = await ports.read();
      if (after.primarySource !== source) throw new Error("x_collection_source_readback_failed");
      if (source === "fxembed" && after.hybridPolicy !== "rss_v1") throw new XActivityError("x_collection_policy_readback_failed", 503);
      await ports.audit(before.primarySource, after.primarySource);
      return after;
    },
  };
}
export type XCollectionApplication = ReturnType<typeof createXCollectionApplication>;
