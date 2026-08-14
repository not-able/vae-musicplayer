import type {
  BindCandidateToTrackRequest,
  DesktopLocalAudioBindingApi,
  DesktopLocalAudioBindingSummary,
  UnbindLocalAudioTrackRequest as DesktopUnbindLocalAudioTrackRequest
} from "../../../electron/music-library/types";
import {
  isLocalAudioBindingId,
  isLocalAudioTrackId
} from "../../types/localAudioBinding";
import {
  isLocalAudioBindingKey,
  isLocalAudioCandidateId,
  localAudioBindingFailure,
  localAudioBindingSuccess,
  parseLocalAudioBindingSummaries,
  type LocalAudioBindingService,
  type LocalAudioBindingServiceErrorCode,
  type LocalAudioBindingServiceResult,
  type LocalAudioBindingSummary
} from "./localAudioBindingService";

type ElectronBindingOperation = "bind" | "list" | "read" | "unbind";

export function createElectronLocalAudioBindingService(
  api: DesktopLocalAudioBindingApi
): LocalAudioBindingService {
  return {
    listBindings: () =>
      invokeElectronBindingApi("list", async () =>
        parseElectronSummaries(await api.list())
      ),
    async findBindingById({ bindingId }) {
      if (!isLocalAudioBindingKey(bindingId) || !isLocalAudioBindingId(bindingId)) {
        return invalidRequest();
      }

      return invokeElectronBindingApi("read", async () => {
        const summary = await api.findByBindingId({ bindingId });
        return summary ? parseElectronSummary(summary) : undefined;
      });
    },
    async findBindingByTrack({ trackId }) {
      if (!isLocalAudioTrackId(trackId)) {
        return invalidRequest();
      }

      return invokeElectronBindingApi("read", async () => {
        const summary = await api.findByTrackId({ trackId });
        return summary ? parseElectronSummary(summary) : undefined;
      });
    },
    async bindCandidate(request) {
      if (
        !isLocalAudioCandidateId(request.candidateId) ||
        !isLocalAudioTrackId(request.trackId) ||
        (request.expectedExistingBindingId !== undefined &&
          (!isLocalAudioBindingKey(request.expectedExistingBindingId) ||
            !isLocalAudioBindingId(request.expectedExistingBindingId)))
      ) {
        return invalidRequest();
      }

      const desktopRequest: BindCandidateToTrackRequest = {
        candidateId:
          request.candidateId as unknown as BindCandidateToTrackRequest["candidateId"],
        trackId: request.trackId,
        ...(request.expectedExistingBindingId
          ? { expectedExistingBindingId: request.expectedExistingBindingId }
          : {})
      };

      return invokeElectronBindingApi("bind", async () =>
        parseElectronSummary(await api.bindCandidateToTrack(desktopRequest))
      );
    },
    async unbindTrack(request) {
      if (
        !isLocalAudioTrackId(request.trackId) ||
        !isLocalAudioBindingKey(request.expectedBindingId) ||
        !isLocalAudioBindingId(request.expectedBindingId)
      ) {
        return invalidRequest();
      }

      const desktopRequest: DesktopUnbindLocalAudioTrackRequest = {
        trackId: request.trackId,
        expectedBindingId: request.expectedBindingId
      };

      return invokeElectronBindingApi("unbind", async () =>
        parseElectronSummary(await api.unbindTrack(desktopRequest))
      );
    }
  };
}

function parseElectronSummaries(
  value: readonly DesktopLocalAudioBindingSummary[]
): readonly LocalAudioBindingSummary[] {
  return parseLocalAudioBindingSummaries(value.map(toCommonSummaryCandidate));
}

function parseElectronSummary(
  value: DesktopLocalAudioBindingSummary
): LocalAudioBindingSummary {
  const summary = parseElectronSummaries([value])[0];
  if (!summary) {
    throw new TypeError("Electron binding summary is missing.");
  }

  return summary;
}

function toCommonSummaryCandidate(value: DesktopLocalAudioBindingSummary) {
  return {
    bindingId: value.bindingId,
    trackId: value.trackId,
    fileName: value.fileName,
    ...(value.fileSize !== undefined ? { fileSize: value.fileSize } : {}),
    ...(value.modifiedAt !== undefined ? { modifiedAt: value.modifiedAt } : {}),
    availability: value.availability,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

async function invokeElectronBindingApi<T>(
  operation: ElectronBindingOperation,
  invoke: () => Promise<T>
): Promise<LocalAudioBindingServiceResult<T>> {
  try {
    return localAudioBindingSuccess(await invoke());
  } catch (error) {
    const code = getElectronErrorCode(error);
    const mappedCode = mapElectronErrorCode(code, operation);
    return localAudioBindingFailure(
      mappedCode,
      getElectronErrorMessage(mappedCode, operation),
      isRetryable(mappedCode)
    );
  }
}

function invalidRequest<T>(): LocalAudioBindingServiceResult<T> {
  return localAudioBindingFailure("invalid_request", "本地音频绑定请求无效。", false);
}

function getElectronErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? /^\[([a-z_]+)\]/.exec(error.message)?.[1] : undefined;
}

function mapElectronErrorCode(
  code: string | undefined,
  operation: ElectronBindingOperation
): LocalAudioBindingServiceErrorCode {
  switch (code) {
    case "binding_conflict":
      return "binding_conflict";
    case "candidate_unavailable":
      return "candidate_unavailable";
    case "directory_missing":
    case "directory_unreadable":
    case "unknown_directory":
      return "directory_unavailable";
    case "binding_store_corrupt":
    case "binding_store_read_failed":
    case "binding_store_schema_unsupported":
      return "read_failed";
    case "binding_store_write_failed":
      return "write_failed";
    case "untrusted_sender":
      return "security_rejected";
    case "binding_invalid":
    case "invalid_request":
      return "invalid_request";
    default:
      return operation === "list" || operation === "read"
        ? "read_failed"
        : operation === "bind" || operation === "unbind"
          ? "write_failed"
          : "unknown";
  }
}

function getElectronErrorMessage(
  code: LocalAudioBindingServiceErrorCode,
  operation: ElectronBindingOperation
): string {
  switch (code) {
    case "binding_conflict":
      return "绑定状态已经发生变化，请重新确认。";
    case "candidate_unavailable":
      return "这个扫描候选已经失效，请重新扫描目录后再绑定。";
    case "directory_unavailable":
      return "音乐目录已经失效，请刷新目录状态或重新选择目录。";
    case "invalid_request":
    case "security_rejected":
      return "本地音频绑定请求未能通过安全校验，请刷新页面后重试。";
    case "read_failed":
      return "无法读取本地音频绑定状态，请稍后重试。";
    case "write_failed":
      return operation === "unbind"
        ? "无法解除本地音频绑定，请稍后重试。"
        : "无法保存本地音频绑定，请稍后重试。";
    default:
      return "本地音频绑定操作失败，请稍后重试。";
  }
}

function isRetryable(code: LocalAudioBindingServiceErrorCode): boolean {
  return (
    code === "binding_conflict" ||
    code === "candidate_unavailable" ||
    code === "directory_unavailable" ||
    code === "read_failed" ||
    code === "write_failed" ||
    code === "unknown"
  );
}
