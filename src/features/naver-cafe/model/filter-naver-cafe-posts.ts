import type { NaverCafePostDto } from "@contracts/naver-cafe";

export function filterNaverCafePostsByMembers(
  posts: NaverCafePostDto[],
  selectedMemberUids: number[] | null,
) {
  if (!selectedMemberUids || selectedMemberUids.length === 0) {
    return posts;
  }

  const uidSet = new Set(selectedMemberUids);
  return posts.filter(
    (post) => post.memberUid !== null && uidSet.has(post.memberUid),
  );
}
