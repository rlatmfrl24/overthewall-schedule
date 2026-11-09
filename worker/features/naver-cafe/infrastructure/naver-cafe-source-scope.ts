import type { SiteId } from "@contracts/site-definition";
import { publicationHiddenSql } from "../../content-access";

export function naverCafeSourceMemberSql(alias: string, site: SiteId): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error("Invalid cafe source alias");
  return `(${alias}.member_uid IS NULL OR EXISTS (
    SELECT 1 FROM members cafe_member WHERE cafe_member.uid=${alias}.member_uid
      AND cafe_member.content_access='normal'
      AND (cafe_member.is_deprecated IS NULL OR cafe_member.is_deprecated=0)
      AND NOT (${publicationHiddenSql("members", "cafe_member", site)})
  ))`;
}
