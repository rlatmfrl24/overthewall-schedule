export const isXPostId = (value:unknown): value is string => typeof value === "string" && /^[1-9]\d{4,24}$/.test(value);
export const parseXRedaction = (value:unknown):{postId:string}|null => {
  if(!value || typeof value!=="object" || Array.isArray(value)) return null;
  const postId=(value as {postId:unknown}).postId;
  return isXPostId(postId)?{postId}:null;
};
