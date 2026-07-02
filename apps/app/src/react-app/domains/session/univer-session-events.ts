export const UNIVER_SESSION_METADATA_UPDATED_EVENT = "openwork-univer-session-metadata-updated";

export function notifyUniverSessionMetadataUpdated() {
  window.dispatchEvent(new Event(UNIVER_SESSION_METADATA_UPDATED_EVENT));
}
