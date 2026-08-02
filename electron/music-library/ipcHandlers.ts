import {
  isLocalAudioBindingId,
  isLocalAudioTrackId
} from "../../src/types/localAudioBinding";
import { MusicLibraryError, toMusicLibraryError } from "./errors";
import type { DesktopMusicLibraryService } from "./musicLibraryService";
import {
  isDesktopAudioCandidateId,
  isValidMusicDirectoryId,
  type BindCandidateToTrackRequest,
  type DesktopIpcResult,
  type DesktopLocalAudioBindingSummary,
  type DesktopMusicDirectoryScanPreviewResult,
  type DesktopMusicDirectorySummary,
  type LocalAudioBindingIdRequest,
  type LocalAudioTrackIdRequest,
  type UnbindLocalAudioTrackRequest
} from "./types";

type TrustedSenderCheck = (senderUrl: string) => boolean;

export interface MusicLibraryIpcSender {
  readonly webContentsId: number;
  readonly url: string;
}

export interface MusicLibraryIpcHandlers {
  selectDirectory(
    sender: MusicLibraryIpcSender,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<DesktopMusicDirectorySummary | null>>;
  listDirectories(
    sender: MusicLibraryIpcSender,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<readonly DesktopMusicDirectorySummary[]>>;
  scanDirectory(
    sender: MusicLibraryIpcSender,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<DesktopMusicDirectoryScanPreviewResult>>;
  forgetDirectory(
    sender: MusicLibraryIpcSender,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<void>>;
  listLocalAudioBindings(
    sender: MusicLibraryIpcSender,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<readonly DesktopLocalAudioBindingSummary[]>>;
  findLocalAudioBindingByBindingId(
    sender: MusicLibraryIpcSender,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<DesktopLocalAudioBindingSummary | undefined>>;
  findLocalAudioBindingByTrackId(
    sender: MusicLibraryIpcSender,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<DesktopLocalAudioBindingSummary | undefined>>;
  bindCandidateToTrack(
    sender: MusicLibraryIpcSender,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<DesktopLocalAudioBindingSummary>>;
  unbindTrack(
    sender: MusicLibraryIpcSender,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<DesktopLocalAudioBindingSummary>>;
}

export function createMusicLibraryIpcHandlers(
  service: DesktopMusicLibraryService,
  isTrustedSender: TrustedSenderCheck
): MusicLibraryIpcHandlers {
  return {
    selectDirectory: (sender, args) =>
      execute(sender, args, isTrustedSender, validateNoArguments, () =>
        service.selectDirectory()
      ),
    listDirectories: (sender, args) =>
      execute(sender, args, isTrustedSender, validateNoArguments, () =>
        service.listDirectories()
      ),
    scanDirectory: (sender, args) =>
      execute(sender, args, isTrustedSender, validateScanRequest, (directoryId) =>
        service.scanDirectory(sender.webContentsId, directoryId)
      ),
    forgetDirectory: (sender, args) =>
      execute(
        sender,
        args,
        isTrustedSender,
        validateDirectoryIdArgument,
        (directoryId) => service.forgetDirectory(directoryId)
      ),
    listLocalAudioBindings: (sender, args) =>
      execute(sender, args, isTrustedSender, validateNoArguments, () =>
        service.listLocalAudioBindings()
      ),
    findLocalAudioBindingByBindingId: (sender, args) =>
      execute(
        sender,
        args,
        isTrustedSender,
        validateBindingIdRequest,
        ({ bindingId }) => service.findLocalAudioBindingByBindingId(bindingId)
      ),
    findLocalAudioBindingByTrackId: (sender, args) =>
      execute(sender, args, isTrustedSender, validateTrackIdRequest, ({ trackId }) =>
        service.findLocalAudioBindingByTrackId(trackId)
      ),
    bindCandidateToTrack: (sender, args) =>
      execute(sender, args, isTrustedSender, validateBindCandidateRequest, (request) =>
        service.bindCandidateToTrack(sender.webContentsId, request)
      ),
    unbindTrack: (sender, args) =>
      execute(sender, args, isTrustedSender, validateUnbindTrackRequest, (request) =>
        service.unbindTrack(request)
      )
  };
}

async function execute<TArgument, TResult>(
  sender: MusicLibraryIpcSender,
  args: readonly unknown[],
  isTrustedSender: TrustedSenderCheck,
  validate: (args: readonly unknown[]) => TArgument,
  operation: (argument: TArgument) => Promise<TResult>
): Promise<DesktopIpcResult<TResult>> {
  try {
    if (!isTrustedSender(sender.url)) {
      throw new MusicLibraryError(
        "untrusted_sender",
        "已拒绝来自非受信 Renderer 的本地音乐库请求。"
      );
    }

    const argument = validate(args);
    return { ok: true, value: await operation(argument) };
  } catch (error) {
    const publicError = toMusicLibraryError(error);
    return {
      ok: false,
      error: {
        code: publicError.code,
        message: publicError.message
      }
    };
  }
}

function validateNoArguments(args: readonly unknown[]): undefined {
  if (args.length !== 0) {
    throwInvalidRequest();
  }

  return undefined;
}

function validateScanRequest(args: readonly unknown[]): string {
  const request = readSingleRecordArgument(args);

  if (
    !hasExactlyKeys(request, ["directoryId"]) ||
    !isValidMusicDirectoryId(request.directoryId)
  ) {
    throwInvalidRequest();
  }

  return request.directoryId;
}

function validateDirectoryIdArgument(args: readonly unknown[]): string {
  if (args.length !== 1 || !isValidMusicDirectoryId(args[0])) {
    throwInvalidRequest();
  }

  return args[0];
}

function validateBindingIdRequest(
  args: readonly unknown[]
): LocalAudioBindingIdRequest {
  const request = readSingleRecordArgument(args);

  if (
    !hasExactlyKeys(request, ["bindingId"]) ||
    !isLocalAudioBindingId(request.bindingId)
  ) {
    throwInvalidRequest();
  }

  return { bindingId: request.bindingId };
}

function validateTrackIdRequest(args: readonly unknown[]): LocalAudioTrackIdRequest {
  const request = readSingleRecordArgument(args);

  if (!hasExactlyKeys(request, ["trackId"]) || !isLocalAudioTrackId(request.trackId)) {
    throwInvalidRequest();
  }

  return { trackId: request.trackId };
}

function validateBindCandidateRequest(
  args: readonly unknown[]
): BindCandidateToTrackRequest {
  const request = readSingleRecordArgument(args);
  const hasExpectedBindingId = Object.hasOwn(request, "expectedExistingBindingId");
  const expectedKeys = hasExpectedBindingId
    ? ["candidateId", "trackId", "expectedExistingBindingId"]
    : ["candidateId", "trackId"];

  if (
    !hasExactlyKeys(request, expectedKeys) ||
    !isDesktopAudioCandidateId(request.candidateId) ||
    !isLocalAudioTrackId(request.trackId)
  ) {
    throwInvalidRequest();
  }

  if (hasExpectedBindingId) {
    if (!isLocalAudioBindingId(request.expectedExistingBindingId)) {
      throwInvalidRequest();
    }

    return {
      candidateId: request.candidateId,
      trackId: request.trackId,
      expectedExistingBindingId: request.expectedExistingBindingId
    };
  }

  return {
    candidateId: request.candidateId,
    trackId: request.trackId
  };
}

function validateUnbindTrackRequest(
  args: readonly unknown[]
): UnbindLocalAudioTrackRequest {
  const request = readSingleRecordArgument(args);

  if (
    !hasExactlyKeys(request, ["trackId", "expectedBindingId"]) ||
    !isLocalAudioTrackId(request.trackId) ||
    !isLocalAudioBindingId(request.expectedBindingId)
  ) {
    throwInvalidRequest();
  }

  return {
    trackId: request.trackId,
    expectedBindingId: request.expectedBindingId
  };
}

function readSingleRecordArgument(args: readonly unknown[]): Record<string, unknown> {
  if (args.length !== 1 || !isRecord(args[0])) {
    throwInvalidRequest();
  }

  return args[0];
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const keys = Reflect.ownKeys(value);
  const expectedKeySet = new Set(expectedKeys);
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => typeof key === "string" && expectedKeySet.has(key))
  );
}

function throwInvalidRequest(): never {
  throw new MusicLibraryError("invalid_request", "本地音乐库请求参数无效。");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
