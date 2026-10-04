// Video files picked during import, kept for this visit only. Browsers can't keep
// a handle on a multi-GB local file between visits, so after a reload the rider
// re-selects it (we match by file name).
const files = new Map<string, File>();
export const rememberVideo = (f: File) => files.set(f.name, f);
export const recallVideo = (name: string) => files.get(name) ?? null;
