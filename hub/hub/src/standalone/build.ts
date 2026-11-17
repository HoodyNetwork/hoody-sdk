// build.ts: the one-file Hub's own build number, held against the `hub_file_min` a Hoody answers on
// GET /api/v1/hub/config (core/origin.ts readHubConfig).
//
// Contract:
//   - HUB_FILE_BUILD is a whole number that only grows. Raise it in a release whose file a Hoody must be able to tell
//     apart from older files; the API then raises HUB_FILE_MIN to it when an API change breaks older files.
//   - fileTooOld is true only when the Hoody named a floor above this build. No floor (an older Hoody, a malformed
//     value, no answer) never refuses: the check tells the person to get the current file before signing in; it is not
//     a security boundary, and nothing is downloaded for them.
export const HUB_FILE_BUILD = 1;

export function fileTooOld(fileMin: number | null, build: number = HUB_FILE_BUILD): boolean {
  return fileMin !== null && build < fileMin;
}
