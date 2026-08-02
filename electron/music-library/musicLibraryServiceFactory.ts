import path from "node:path";

import type { LocalDirectoryScanOptions } from "../../src/features/local-library/localDirectoryEntryScanner";
import { DesktopAudioCandidateStore } from "./candidateStore";
import {
  MUSIC_DIRECTORY_REGISTRY_FILE_NAME,
  MusicDirectoryRegistry
} from "./directoryRegistry";
import { scanDesktopMusicDirectory } from "./directoryScanner";
import {
  JsonLocalAudioBindingRepository,
  LOCAL_AUDIO_BINDING_STORE_FILE_NAME
} from "./jsonLocalAudioBindingRepository";
import { DesktopMusicLibraryService } from "./musicLibraryService";

export interface DesktopMusicLibraryServiceFactoryOptions {
  readonly userDataPath: string;
  readonly selectDirectoryPath: () => Promise<string | null>;
  readonly parseOptions?: LocalDirectoryScanOptions;
  readonly scanDirectory?: typeof scanDesktopMusicDirectory;
  readonly candidateIdFactory?: () => string;
  readonly bindingIdFactory?: () => string;
  readonly clock?: () => Date;
}

export function createDesktopMusicLibraryService({
  userDataPath,
  selectDirectoryPath,
  parseOptions,
  scanDirectory,
  candidateIdFactory,
  bindingIdFactory,
  clock
}: DesktopMusicLibraryServiceFactoryOptions): DesktopMusicLibraryService {
  const registry = new MusicDirectoryRegistry({
    filePath: path.join(userDataPath, MUSIC_DIRECTORY_REGISTRY_FILE_NAME)
  });
  const bindingRepository = new JsonLocalAudioBindingRepository({
    filePath: path.join(userDataPath, LOCAL_AUDIO_BINDING_STORE_FILE_NAME)
  });

  return new DesktopMusicLibraryService({
    registry,
    bindingRepository,
    selectDirectoryPath,
    parseOptions,
    scanDirectory,
    candidateStore: new DesktopAudioCandidateStore({ candidateIdFactory }),
    bindingIdFactory,
    clock
  });
}
