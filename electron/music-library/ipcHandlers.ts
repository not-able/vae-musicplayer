import { MusicLibraryError, toMusicLibraryError } from "./errors";
import type { DesktopMusicLibraryService } from "./musicLibraryService";
import {
  isValidMusicDirectoryId,
  type DesktopIpcResult,
  type DesktopMusicDirectoryScanResult,
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
        "已拒绝来自非受信 Renderer 的本地目录请求。"
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

function throwInvalidRequest(): never {
  throw new MusicLibraryError("invalid_request", "本地音乐目录请求参数无效。");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
