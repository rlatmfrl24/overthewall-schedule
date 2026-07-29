export const hasProtectedLocalSeedData = (row) => {
  const destructiveRowCount = Number(row?.destructive_row_count);
  return destructiveRowCount !== 0;
};
