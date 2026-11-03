import type { XCollectionProvider, XCollectionStatusDto } from "@contracts/x-collection";

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
      await ports.audit(before.primarySource, after.primarySource);
      return after;
    },
  };
}
export type XCollectionApplication = ReturnType<typeof createXCollectionApplication>;
