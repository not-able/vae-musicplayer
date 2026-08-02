import type { LocalDirectoryScanOptions } from "../../src/features/local-library/localDirectoryEntryScanner";
import type { LocalAudioBindingRepository } from "../../src/features/local-library/localAudioBindingRepository";
import {
  isDesktopAudioSourceRef,
  isLocalAudioBindingSerializable,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioTrackId
} from "../../src/types/localAudioBinding";
import type { MusicDirectoryRegistry } from "./directoryRegistry";
import { scanDesktopMusicDirectory } from "./directoryScanner";
import { MusicLibraryError } from "./errors";
import type { DesktopMusicDirectoryScanResult, SelectedMusicDirectory } from "./types";

export interface DesktopMusicLibraryServiceOptions {
  registry: MusicDirectoryRegistry;
  bindingRepository: LocalAudioBindingRepository;
  selectDirectoryPath: () => Promise<string | null>;
  parseOptions?: LocalDirectoryScanOptions;
  scanDirectory?: typeof scanDesktopMusicDirectory;
}

export class DesktopMusicLibraryService {
  private readonly registry: MusicDirectoryRegistry;
  private readonly bindingRepository: LocalAudioBindingRepository;
  private readonly selectDirectoryPath: () => Promise<string | null>;
  private readonly parseOptions: LocalDirectoryScanOptions | undefined;
  private readonly scanDirectoryImplementation: typeof scanDesktopMusicDirectory;

  constructor(options: DesktopMusicLibraryServiceOptions) {
    this.registry = options.registry;
    this.bindingRepository = options.bindingRepository;
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

  listLocalAudioBindings(): Promise<readonly LocalAudioBinding[]> {
    return this.bindingRepository.list();
  }

  findLocalAudioBindingByBindingId(
    bindingId: LocalAudioBindingId
  ): Promise<LocalAudioBinding | undefined> {
    return this.bindingRepository.findByBindingId(bindingId);
  }

  findLocalAudioBindingByTrackId(
    trackId: LocalAudioTrackId
  ): Promise<LocalAudioBinding | undefined> {
    return this.bindingRepository.findByTrackId(trackId);
  }

  async saveLocalAudioBinding(binding: LocalAudioBinding): Promise<void> {
    if (
      !isLocalAudioBindingSerializable(binding) ||
      !isDesktopAudioSourceRef(binding.source)
    ) {
      throw new MusicLibraryError(
        "binding_invalid",
        "桌面音频绑定必须使用有效的受控目录文件引用。"
      );
    }

    await this.registry.resolveDirectoryPath(binding.source.directoryId);
    await this.bindingRepository.save(binding);
  }

  removeLocalAudioBindingByBindingId(bindingId: LocalAudioBindingId): Promise<boolean> {
    return this.bindingRepository.removeByBindingId(bindingId);
  }

  removeLocalAudioBindingByTrackId(trackId: LocalAudioTrackId): Promise<boolean> {
    return this.bindingRepository.removeByTrackId(trackId);
  }
}
