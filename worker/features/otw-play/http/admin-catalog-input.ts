// The owning HTTP handler and handoff codec share the same parser.
export { parseCreateSong, parseCreatePerformance, parseCreateChannel, parseUpdateChannel, parseCreateEntity, parseUpdateEntity, parseVersionRequest, parseRejectProposal, parseApproveProposal, parseRecheckSource, parseUpdateSong, parseUpdatePerformance, parseCatalogEntryPreflight, parseCreateCatalogEntry } from "../domain/admin-catalog-input";
export type { AdminInputResult } from "../domain/admin-catalog-input";
