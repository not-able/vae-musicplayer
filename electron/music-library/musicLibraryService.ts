import { randomUUID } from "node:crypto";

import type { LocalDirectoryScanOptions } from "../../src/features/local-library/localDirectoryEntryScanner";
import type { LocalAudioBindingRepository } from "../../src/features/local-library/localAudioBindingRepository";
import {
  isLocalAudioBindingId,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioTrackId
} from "../../src/types/localAudioBinding";
import {
  DesktopAudioCandidateStore,
  type TrustedDesktopAudioCandidate
} from "./candidateStore";
import type { MusicDirectoryRegistry } from "./directoryRegistry";
import { scanDesktopMusicDirectory } from "./directoryScanner";
import { MusicLibraryError } from "./errors";
import type {
  BindCandidateToTrackRequest,
  DesktopLocalAudioBindingSummary,
  DesktopMusicDirectoryScanPreviewResult,
  DesktopMusicDirectorySummary,
  RegisteredMusicDirectory,
  UnbindLocalAudioTrackRequest
} from "./types";

export interface DesktopMusicLibraryServiceOptions {
  readonly registry: MusicDirectoryRegistry;
  readonly bindingRepository: LocalAudioBindingRepository;
  readonly selectDirectoryPath: () => Promise<string | null>;
  readonly parseOptions?: LocalDirectoryScanOptions;
  readonly scanDirectory?: typeof scanDesktopMusicDirectory;
  readonly candidateStore?: DesktopAudioCandidateStore;
  readonly bindingIdFactory?: () => string;
  readonly clock?: () => Date;
}

export class DesktopMusicLibraryService {
  private readonly registry: MusicDirectoryRegistry;
  private readonly bindingRepository: LocalAudioBindingRepository;
  private readonly selectDirectoryPath: () => Promise<string | null>;
  private readonly parseOptions: LocalDirectoryScanOptions | undefined;
  private readonly scanDirectoryImplementation: typeof scanDesktopMusicDirectory;
  private readonly candidateStore: DesktopAudioCandidateStore;
  private readonly bindingIdFactory: () => string;
  private readonly clock: () => Date;
  private bindingMutationTail: Promise<void> = Promise.resolve();

  constructor(options: DesktopMusicLibraryServiceOptions) {
    this.registry = options.registry;
    this.bindingRepository = options.bindingRepository;
    this.selectDirectoryPath = options.selectDirectoryPath;
    this.parseOptions = options.parseOptions;
    this.scanDirectoryImplementation =
      options.scanDirectory ?? scanDesktopMusicDirectory;
    this.candidateStore = options.candidateStore ?? new DesktopAudioCandidateStore();
    this.bindingIdFactory = options.bindingIdFactory ?? randomUUID;
    this.clock = options.clock ?? (() => new Date());
  }

  async selectDirectory(): Promise<DesktopMusicDirectorySummary | null> {
    let directoryPath: string | null;

    try {
      directoryPath = await this.selectDirectoryPath();
    } catch {
      throw new MusicLibraryError("selection_failed", "无法打开本地音乐目录选择器。");
    }

    if (directoryPath === null) {
      return null;
    }

    return toDirectorySummary(await this.registry.registerDirectory(directoryPath));
  }

  async listDirectories(): Promise<readonly DesktopMusicDirectorySummary[]> {
    return (await this.registry.listDirectories()).map(toDirectorySummary);
  }

  async scanDirectory(
    ownerId: number,
    directoryId: string
  ): Promise<DesktopMusicDirectoryScanPreviewResult> {
    const scanToken = this.candidateStore.beginScan(ownerId, directoryId);

    try {
      const directoryPath = await this.registry.resolveDirectoryPath(directoryId);
      const result = await this.scanDirectoryImplementation({
        directoryId,
        directoryPath,
        parseOptions: this.parseOptions
      });
      return this.candidateStore.publishScan(scanToken, result);
    } catch (error) {
      this.candidateStore.abortScan(scanToken);
      throw error;
    }
  }

  async forgetDirectory(directoryId: string): Promise<void> {
    await this.registry.forgetDirectory(directoryId);
    this.candidateStore.invalidateDirectory(directoryId);
  }

  invalidateCandidatesForOwner(ownerId: number): void {
    this.candidateStore.invalidateOwner(ownerId);
  }

  async listLocalAudioBindings(): Promise<readonly DesktopLocalAudioBindingSummary[]> {
    return (await this.bindingRepository.list()).map(toBindingSummary);
  }

  async findLocalAudioBindingByBindingId(
    bindingId: LocalAudioBindingId
  ): Promise<DesktopLocalAudioBindingSummary | undefined> {
    const binding = await this.bindingRepository.findByBindingId(bindingId);
    return binding ? toBindingSummary(binding) : undefined;
  }

  async findLocalAudioBindingByTrackId(
    trackId: LocalAudioTrackId
  ): Promise<DesktopLocalAudioBindingSummary | undefined> {
    const binding = await this.bindingRepository.findByTrackId(trackId);
    return binding ? toBindingSummary(binding) : undefined;
  }

  bindCandidateToTrack(
    ownerId: number,
    request: BindCandidateToTrackRequest
  ): Promise<DesktopLocalAudioBindingSummary> {
    return this.runBindingMutation(async () => {
      const initialCandidate = this.candidateStore.resolveCandidate(
        ownerId,
        request.candidateId
      );
      const existingBinding = await this.bindingRepository.findByTrackId(
        request.trackId
      );
      assertExpectedExistingBinding(existingBinding, request);
      await this.registry.resolveDirectoryPath(initialCandidate.source.directoryId);

      const currentCandidate = this.candidateStore.resolveCandidate(
        ownerId,
        request.candidateId
      );
      assertSameCandidate(initialCandidate, currentCandidate);

      const timestamp = this.clock().toISOString();
      const binding: LocalAudioBinding = {
        bindingId: this.createBindingId(),
        trackId: request.trackId,
        source: currentCandidate.source,
        fileName: currentCandidate.fileName,
        fileSize: currentCandidate.fileSize,
        modifiedAt: currentCandidate.modifiedAt,
        availability: "unknown",
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await this.bindingRepository.save(binding);
      return toBindingSummary(binding);
    });
  }

  unbindTrack(
    request: UnbindLocalAudioTrackRequest
  ): Promise<DesktopLocalAudioBindingSummary> {
    return this.runBindingMutation(async () => {
      const currentBinding = await this.bindingRepository.findByTrackId(
        request.trackId
      );

      if (!currentBinding || currentBinding.bindingId !== request.expectedBindingId) {
        throwBindingConflict();
      }

      const removed = await this.bindingRepository.removeByBindingId(
        request.expectedBindingId
      );
      if (!removed) {
        throwBindingConflict();
      }

      return toBindingSummary(currentBinding);
    });
  }

  private createBindingId(): LocalAudioBindingId {
    const bindingId = this.bindingIdFactory();
    if (!isLocalAudioBindingId(bindingId)) {
      throw new MusicLibraryError(
        "binding_invalid",
        "无法为本地音频绑定创建安全标识。"
      );
    }

    return bindingId;
  }

  private runBindingMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.bindingMutationTail.then(operation, operation);
    this.bindingMutationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

function assertExpectedExistingBinding(
  existingBinding: LocalAudioBinding | undefined,
  request: BindCandidateToTrackRequest
): void {
  if (existingBinding) {
    if (request.expectedExistingBindingId !== existingBinding.bindingId) {
      throwBindingConflict();
    }
    return;
  }

  if (request.expectedExistingBindingId !== undefined) {
    throwBindingConflict();
  }
}

function assertSameCandidate(
  initial: TrustedDesktopAudioCandidate,
  current: TrustedDesktopAudioCandidate
): void {
  if (
    initial.candidateId !== current.candidateId ||
    initial.generation !== current.generation ||
    initial.ownerId !== current.ownerId
  ) {
    throw new MusicLibraryError(
      "candidate_unavailable",
      "扫描候选已失效，请重新扫描音乐目录。"
    );
  }
}

function throwBindingConflict(): never {
  throw new MusicLibraryError(
    "binding_conflict",
    "本地音频绑定状态已变化，请刷新后重试。"
  );
}

function toDirectorySummary(
  directory: RegisteredMusicDirectory
): DesktopMusicDirectorySummary {
  return {
    directoryId: directory.directoryId,
    displayName: isSafeDirectoryDisplayName(directory.displayName)
      ? directory.displayName
      : "已授权音乐目录",
    selectedAt: directory.selectedAt,
    availability: directory.availability
  };
}

function isSafeDirectoryDisplayName(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !value.includes("\0") &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}

function toBindingSummary(binding: LocalAudioBinding): DesktopLocalAudioBindingSummary {
  return {
    bindingId: binding.bindingId,
    trackId: binding.trackId,
    fileName: isSafePublicFileName(binding.fileName)
      ? binding.fileName
      : "本地音频文件",
    ...(binding.fileSize !== undefined ? { fileSize: binding.fileSize } : {}),
    ...(binding.modifiedAt !== undefined ? { modifiedAt: binding.modifiedAt } : {}),
    availability: binding.availability,
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt
  };
}

function isSafePublicFileName(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !value.includes("\0") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes(":")
  );
}
