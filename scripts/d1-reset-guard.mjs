export const shouldBlockDestructiveLocalReset = ({
  validateOnly,
  force,
  hasCurrentDatabase,
}) => !validateOnly && !force && hasCurrentDatabase;
