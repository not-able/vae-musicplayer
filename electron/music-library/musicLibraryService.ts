import type { LocalDirectoryScanOptions } from "../../src/features/local-library/localDirectoryEntryScanner";
import type { MusicDirectoryRegistry } from "./directoryRegistry";
import { scanDesktopMusicDirectory } from "./directoryScanner";
import { MusicLibraryError } from "./errors";
import type { DesktopMusicDirectoryScanResult, SelectedMusicDirectory } from "./types";

export interface DesktopMusicLibraryServiceOptions {
  registry: MusicDirectoryRegistry;
  selectDirectoryPath: () => Promise<string | null>;
  parseOptions?: LocalDirectoryScanOptions;
  scanDirectory?: typeof scanDesktopMusicDirectory;
}

export class DesktopMusicLibraryService {
  private readonly registry: MusicDirectoryRegistry;
  private readonly selectDirectoryPath: () => Promise<string | null>;
  private readonly parseOptions: LocalDirectoryScanOptions | undefined;
  private readonly scanDirectoryImplementation: typeof scanDesktopMusicDirectory;

  constructor(options: DesktopMusicLibraryServiceOptions) {
    this.registry = options.registry;
    this.selectDirectoryPath = options.selectDirectoryPath;
    this.parseOptions = options.parseOptions;
    this.scanDirectoryImplementation =
      options.scanDirectory ?? scanDesktopMusicDirectory;
  }

  async selectDirectory(): Promise<SelectedMusicDirectory | null> {
    let directoryPath: string | null;

    try {
      directoryPath = await this.selectDirectoryPath();
    } catch {
      throw new MusicLibraryError("selection_failed", "无法打开本地音乐目录选择器。");
    }

    return directoryPath === null
      ? null
      : this.registry.registerDirectory(directoryPath);
  }

  listDirectories(): Promise<readonly SelectedMusicDirectory[]> {
    return this.registry.listDirectories();
  }

  async scanDirectory(directoryId: string): Promise<DesktopMusicDirectoryScanResult> {
    const directoryPath = await this.registry.resolveDirectoryPath(directoryId);

    return this.scanDirectoryImplementation({
      directoryId,
      directoryPath,
      parseOptions: this.parseOptions
    });
  }

  forgetDirectory(directoryId: string): Promise<void> {
    return this.registry.forgetDirectory(directoryId);
  }
}
