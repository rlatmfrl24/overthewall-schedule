export const chunkOtwPlayIngestionSelections = <T>(items: readonly T[]) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += 100) {
    chunks.push(items.slice(index, index + 100));
  }
  return chunks;
};
