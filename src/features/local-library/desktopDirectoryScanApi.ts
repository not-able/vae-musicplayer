import type { DesktopMusicLibraryApi } from "../../../electron/music-library/types";

export type DesktopDirectoryScanApi = Pick<
  DesktopMusicLibraryApi,
  "listDirectories" | "scanDirectory" | "selectDirectory"
>;

export function getDesktopDirectoryScanApi(
  globalObject: unknown
): DesktopDirectoryScanApi | undefined {
  if (!isRecord(globalObject)) {
    return undefined;
  }

  const desktop = globalObject.desktop;
  if (!isRecord(desktop) || !isRecord(desktop.musicLibrary)) {
    return undefined;
  }

  const musicLibrary = desktop.musicLibrary;
  if (
    typeof musicLibrary.selectDirectory !== "function" ||
    typeof musicLibrary.listDirectories !== "function" ||
    typeof musicLibrary.scanDirectory !== "function"
  ) {
    return undefined;
  }

  return musicLibrary as unknown as DesktopDirectoryScanApi;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
