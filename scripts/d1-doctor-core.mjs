export const getMigrationListStatus = (output) => {
  if (output.includes("No migrations to apply")) {
    return {
      ok: true,
      message: "no pending migrations",
    };
  }

  return {
    ok: false,
    message: "pending migrations detected; apply local migrations before continuing",
  };
};
