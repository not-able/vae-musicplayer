import {
  isDesktopAudioSourceRef,
  isLocalAudioBindingId,
  isLocalAudioBindingSerializable,
  isLocalAudioTrackId,
  type LocalAudioBinding
} from "../../src/types/localAudioBinding";
import { MusicLibraryError, toMusicLibraryError } from "./errors";
import type { DesktopMusicLibraryService } from "./musicLibraryService";
import {
  isValidMusicDirectoryId,
  type DesktopIpcResult,
  type DesktopMusicDirectoryScanResult,
  type LocalAudioBindingIdRequest,
  type LocalAudioTrackIdRequest,
  type SaveLocalAudioBindingRequest,
  type SelectedMusicDirectory
} from "./types";

type TrustedSenderCheck = (senderUrl: string) => boolean;

export interface MusicLibraryIpcHandlers {
  selectDirectory(
    senderUrl: string,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<SelectedMusicDirectory | null>>;
  listDirectories(
    senderUrl: string,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<readonly SelectedMusicDirectory[]>>;
  scanDirectory(
    senderUrl: string,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<DesktopMusicDirectoryScanResult>>;
  forgetDirectory(
    senderUrl: string,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<void>>;
  listLocalAudioBindings(
    senderUrl: string,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<readonly LocalAudioBinding[]>>;
  findLocalAudioBindingByBindingId(
    senderUrl: string,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<LocalAudioBinding | undefined>>;
  findLocalAudioBindingByTrackId(
    senderUrl: string,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<LocalAudioBinding | undefined>>;
  saveLocalAudioBinding(
    senderUrl: string,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<void>>;
  removeLocalAudioBindingByBindingId(
    senderUrl: string,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<boolean>>;
  removeLocalAudioBindingByTrackId(
    senderUrl: string,
    args: readonly unknown[]
  ): Promise<DesktopIpcResult<boolean>>;
}

export function createMusicLibraryIpcHandlers(
  service: DesktopMusicLibraryService,
  isTrustedSender: TrustedSenderCheck
): MusicLibraryIpcHandlers {
  return {
    selectDirectory: (senderUrl, args) =>
      execute(senderUrl, args, isTrustedSender, validateNoArguments, () =>
        service.selectDirectory()
      ),
    listDirectories: (senderUrl, args) =>
      execute(senderUrl, args, isTrustedSender, validateNoArguments, () =>
        service.listDirectories()
      ),
    scanDirectory: (senderUrl, args) =>
      execute(senderUrl, args, isTrustedSender, validateScanRequest, (directoryId) =>
        service.scanDirectory(directoryId)
      ),
    forgetDirectory: (senderUrl, args) =>
      execute(
        senderUrl,
        args,
        isTrustedSender,
        validateDirectoryIdArgument,
        (directoryId) => service.forgetDirectory(directoryId)
      ),
    listLocalAudioBindings: (senderUrl, args) =>
      execute(senderUrl, args, isTrustedSender, validateNoArguments, () =>
        service.listLocalAudioBindings()
      ),
    findLocalAudioBindingByBindingId: (senderUrl, args) =>
      execute(
        senderUrl,
        args,
        isTrustedSender,
        validateBindingIdRequest,
        ({ bindingId }) => service.findLocalAudioBindingByBindingId(bindingId)
      ),
    findLocalAudioBindingByTrackId: (senderUrl, args) =>
      execute(senderUrl, args, isTrustedSender, validateTrackIdRequest, ({ trackId }) =>
        service.findLocalAudioBindingByTrackId(trackId)
      ),
    saveLocalAudioBinding: (senderUrl, args) =>
      execute(
        senderUrl,
        args,
        isTrustedSender,
        validateSaveBindingRequest,
        ({ binding }) => service.saveLocalAudioBinding(binding)
      ),
    removeLocalAudioBindingByBindingId: (senderUrl, args) =>
      execute(
        senderUrl,
        args,
        isTrustedSender,
        validateBindingIdRequest,
        ({ bindingId }) => service.removeLocalAudioBindingByBindingId(bindingId)
      ),
    removeLocalAudioBindingByTrackId: (senderUrl, args) =>
      execute(senderUrl, args, isTrustedSender, validateTrackIdRequest, ({ trackId }) =>
        service.removeLocalAudioBindingByTrackId(trackId)
      )
  };
}

async function execute<TArgument, TResult>(
  senderUrl: string,
  args: readonly unknown[],
  isTrustedSender: TrustedSenderCheck,
  validate: (args: readonly unknown[]) => TArgument,
  operation: (argument: TArgument) => Promise<TResult>
): Promise<DesktopIpcResult<TResult>> {
  try {
    if (!isTrustedSender(senderUrl)) {
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
  if (args.length !== 1 || !isRecord(args[0])) {
    throwInvalidRequest();
  }

  const request = args[0];
  const keys = Object.keys(request);

  if (
    keys.length !== 1 ||
    keys[0] !== "directoryId" ||
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

function validateSaveBindingRequest(
  args: readonly unknown[]
): SaveLocalAudioBindingRequest {
  const request = readSingleRecordArgument(args);

  if (
    !hasExactlyKeys(request, ["binding"]) ||
    !isLocalAudioBindingSerializable(request.binding) ||
    !isDesktopAudioSourceRef(request.binding.source)
  ) {
    throwInvalidRequest();
  }

  return { binding: request.binding };
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
