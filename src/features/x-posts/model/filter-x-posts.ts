import type { XPostViewModel } from "./types";

export function filterXPostsByMembers(
  posts: XPostViewModel[],
  selectedMemberUids: number[] | null,
): XPostViewModel[] {
  if (!selectedMemberUids || selectedMemberUids.length === 0) {
    return posts;
  }

  const uidSet = new Set(selectedMemberUids);
  return posts.filter(
    (post) => post.memberUid !== undefined && uidSet.has(post.memberUid),
  );
}
