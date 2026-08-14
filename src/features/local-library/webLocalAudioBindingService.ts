import type { LocalAudioFileRecord } from "../../types";
import {
  isLocalAudioTrackId,
  type LocalAudioAvailability,
  type LocalAudioTrackId
} from "../../types/localAudioBinding";
import {
  createLocalAudioFileHandleRecord,
  createLocalAudioFileRecord,
  getLocalAudioFileValidationError
} from "./localAudioFile";
import type { LocalAudioFileRepository } from "./localAudioRepository";
import {
  isLocalAudioBindingKey,
  isLocalAudioCandidateId,
  localAudioBindingFailure,
  localAudioBindingSuccess,
  parseLocalAudioBindingSummaries,
  type BindLocalAudioCandidateRequest,
  type LocalAudioBindingKey,
  type LocalAudioBindingService,
  type LocalAudioBindingServiceResult,
  type LocalAudioBindingSummary,
  type LocalAudioCandidateId,
  type UnbindLocalAudioTrackRequest
} from "./localAudioBindingService";

interface WebAudioCandidate {
  readonly file: File;
  readonly fileHandle?: FileSystemFileHandle;
}

export interface WebLocalAudioCandidatePreview {
  readonly candidateId: LocalAudioCandidateId;
  readonly fileName: string;
  readonly fileSize: number;
  readonly modifiedAt: number;
}

export interface BindBrowserAudioFileRequest {
  readonly trackId: LocalAudioTrackId;
  readonly file: File;
  readonly fileHandle?: FileSystemFileHandle;
  readonly expectedExistingBindingId?: LocalAudioBindingKey;
}

export interface BindBrowserAudioFileResult {
  readonly result: LocalAudioBindingServiceResult<LocalAudioBindingSummary>;
  /** Existing Web UI/player compatibility only; never part of the shared contract. */
  readonly legacyRecord?: LocalAudioFileRecord;
}

export interface WebLocalAudioBindingService extends LocalAudioBindingService {
  registerBrowserFileCandidate(
    file: File,
    fileHandle?: FileSystemFileHandle
  ): LocalAudioBindingServiceResult<WebLocalAudioCandidatePreview>;
  bindBrowserAudioFile(
    request: BindBrowserAudioFileRequest
  ): Promise<BindBrowserAudioFileResult>;
  listLegacyRecords(): Promise<LocalAudioFileRecord[]>;
  invalidateCandidates(): void;
}

export interface WebLocalAudioBindingServiceOptions {
  readonly createCandidateId?: () => string;
  readonly now?: () => string;
}

export function createWebLocalAudioBindingService(
  repository: LocalAudioFileRepository,
  options: WebLocalAudioBindingServiceOptions = {}
): WebLocalAudioBindingService {
  const candidates = new Map<LocalAudioCandidateId, WebAudioCandidate>();
  const createCandidateId = options.createCandidateId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  let bindingMutationTail: Promise<void> = Promise.resolve();

  async function listRecords() {
    return repository.list();
  }

  async function runBindingMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = bindingMutationTail.then(operation, operation);
    bindingMutationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async function bindRegisteredCandidateUnsafe(
    request: BindLocalAudioCandidateRequest
  ): Promise<BindBrowserAudioFileResult> {
    if (
      !isLocalAudioCandidateId(request.candidateId) ||
      !isLocalAudioTrackId(request.trackId) ||
      (request.expectedExistingBindingId !== undefined &&
        !isLocalAudioBindingKey(request.expectedExistingBindingId))
    ) {
      return {
        result: localAudioBindingFailure(
          "invalid_request",
          "本地音频绑定请求无效。",
          false
        )
      };
    }

    const candidate = candidates.get(request.candidateId);
    if (!candidate) {
      return {
        result: localAudioBindingFailure(
          "candidate_unavailable",
          "本地音频候选已经失效，请重新选择文件。",
          true
        )
      };
    }

    let records: LocalAudioFileRecord[];
    try {
      records = await listRecords();
    } catch {
      return {
        result: localAudioBindingFailure(
          "read_failed",
          "无法读取本地音频绑定状态，请稍后重试。",
          true
        )
      };
    }

    const existingRecord = records.find((record) => record.trackId === request.trackId);
    const existingBindingId = existingRecord
      ? getWebLocalAudioBindingKey(existingRecord)
      : undefined;

    if (existingRecord && !existingBindingId) {
      return {
        result: localAudioBindingFailure(
          "read_failed",
          "无法读取本地音频绑定状态，请稍后重试。",
          true
        )
      };
    }

    const hasExpectedBinding = request.expectedExistingBindingId !== undefined;
    if (
      (existingBindingId &&
        (!hasExpectedBinding ||
          existingBindingId !== request.expectedExistingBindingId)) ||
      (!existingBindingId && hasExpectedBinding)
    ) {
      return {
        result: localAudioBindingFailure(
          "binding_conflict",
          "绑定状态已经发生变化，请重新确认。",
          true
        )
      };
    }

    const updatedAt = getNextUpdatedAt(now(), existingRecord?.updatedAt);
    if (!updatedAt) {
      return {
        result: localAudioBindingFailure(
          "unknown",
          "无法生成本地音频绑定版本，请稍后重试。",
          true
        )
      };
    }
    const record = candidate.fileHandle
      ? createLocalAudioFileHandleRecord(
          request.trackId,
          candidate.file,
          candidate.fileHandle,
          updatedAt
        )
      : createLocalAudioFileRecord(request.trackId, candidate.file, updatedAt);

    try {
      await repository.save(record);
    } catch (error) {
      return {
        result: localAudioBindingFailure(
          "write_failed",
          getWebWriteErrorMessage(error),
          true
        )
      };
    }

    candidates.delete(request.candidateId);
    const summaryResult = toSummaryResult(record);

    return summaryResult.ok
      ? { result: summaryResult, legacyRecord: record }
      : { result: summaryResult };
  }

  async function unbindTrackUnsafe(
    request: UnbindLocalAudioTrackRequest
  ): Promise<LocalAudioBindingServiceResult<LocalAudioBindingSummary>> {
    if (
      !isLocalAudioTrackId(request.trackId) ||
      !isLocalAudioBindingKey(request.expectedBindingId)
    ) {
      return localAudioBindingFailure(
        "invalid_request",
        "本地音频解绑请求无效。",
        false
      );
    }

    let records: LocalAudioFileRecord[];
    try {
      records = await listRecords();
    } catch {
      return localAudioBindingFailure(
        "read_failed",
        "无法读取本地音频绑定状态，请稍后重试。",
        true
      );
    }

    const existingRecord = records.find((record) => record.trackId === request.trackId);
    if (!existingRecord) {
      return localAudioBindingFailure(
        "binding_not_found",
        "未找到要解除的本地音频绑定。",
        false
      );
    }

    const existingBindingId = getWebLocalAudioBindingKey(existingRecord);
    if (!existingBindingId) {
      return localAudioBindingFailure(
        "read_failed",
        "无法读取本地音频绑定状态，请稍后重试。",
        true
      );
    }
    if (existingBindingId !== request.expectedBindingId) {
      return localAudioBindingFailure(
        "binding_conflict",
        "绑定状态已经发生变化，请重新确认。",
        true
      );
    }

    try {
      await repository.remove(request.trackId);
    } catch (error) {
      return localAudioBindingFailure(
        "write_failed",
        getWebWriteErrorMessage(error),
        true
      );
    }

    return toSummaryResult(existingRecord);
  }

  const service: WebLocalAudioBindingService = {
    async listBindings() {
      try {
        return toSummaryListResult(await listRecords());
      } catch {
        return localAudioBindingFailure(
          "read_failed",
          "无法读取本地音频绑定状态，请稍后重试。",
          true
        );
      }
    },
    async findBindingById({ bindingId }) {
      if (!isLocalAudioBindingKey(bindingId)) {
        return localAudioBindingFailure(
          "invalid_request",
          "本地音频绑定请求无效。",
          false
        );
      }

      const result = await service.listBindings();
      return result.ok
        ? localAudioBindingSuccess(
            result.value.find((summary) => summary.bindingId === bindingId)
          )
        : result;
    },
    async findBindingByTrack({ trackId }) {
      if (!isLocalAudioTrackId(trackId)) {
        return localAudioBindingFailure(
          "invalid_request",
          "本地音频绑定请求无效。",
          false
        );
      }

      const result = await service.listBindings();
      return result.ok
        ? localAudioBindingSuccess(
            result.value.find((summary) => summary.trackId === trackId)
          )
        : result;
    },
    async bindCandidate(request) {
      return (await runBindingMutation(() => bindRegisteredCandidateUnsafe(request)))
        .result;
    },
    unbindTrack(request) {
      return runBindingMutation(() => unbindTrackUnsafe(request));
    },
    registerBrowserFileCandidate(file, fileHandle) {
      const validationError = getLocalAudioFileValidationError(file);
      if (validationError || !isSafeBrowserFileName(file.name)) {
        return localAudioBindingFailure(
          "invalid_request",
          validationError ?? "本地音频文件名无效。",
          false
        );
      }

      const candidateIdValue = createCandidateId();
      if (!isLocalAudioCandidateId(candidateIdValue)) {
        return localAudioBindingFailure(
          "unknown",
          "无法准备本地音频候选，请重新选择文件。",
          true
        );
      }

      candidates.set(candidateIdValue, { file, ...(fileHandle ? { fileHandle } : {}) });
      return localAudioBindingSuccess({
        candidateId: candidateIdValue,
        fileName: file.name,
        fileSize: file.size,
        modifiedAt: file.lastModified
      });
    },
    async bindBrowserAudioFile(request) {
      const registration = service.registerBrowserFileCandidate(
        request.file,
        request.fileHandle
      );
      if (!registration.ok) {
        return { result: registration };
      }

      const mutation = await runBindingMutation(() =>
        bindRegisteredCandidateUnsafe({
          candidateId: registration.value.candidateId,
          trackId: request.trackId,
          ...(request.expectedExistingBindingId !== undefined
            ? { expectedExistingBindingId: request.expectedExistingBindingId }
            : {})
        })
      );
      if (!mutation.result.ok) {
        candidates.delete(registration.value.candidateId);
      }

      return mutation;
    },
    listLegacyRecords: listRecords,
    invalidateCandidates() {
      candidates.clear();
    }
  };

  return service;
}

function toSummaryListResult(
  records: readonly LocalAudioFileRecord[]
): LocalAudioBindingServiceResult<readonly LocalAudioBindingSummary[]> {
  try {
    return localAudioBindingSuccess(
      parseLocalAudioBindingSummaries(records.map(toSummaryCandidate))
    );
  } catch {
    return localAudioBindingFailure(
      "read_failed",
      "无法读取本地音频绑定状态，请稍后重试。",
      true
    );
  }
}

function toSummaryResult(
  record: LocalAudioFileRecord
): LocalAudioBindingServiceResult<LocalAudioBindingSummary> {
  const result = toSummaryListResult([record]);
  const summary = result.ok ? result.value[0] : undefined;

  return summary
    ? localAudioBindingSuccess(summary)
    : result.ok
      ? localAudioBindingFailure(
          "read_failed",
          "无法读取本地音频绑定状态，请稍后重试。",
          true
        )
      : result;
}

function toSummaryCandidate(record: LocalAudioFileRecord) {
  return {
    bindingId: getWebLocalAudioBindingKey(record),
    trackId: record.trackId,
    fileName: record.fileName,
    ...(record.fileSize !== undefined ? { fileSize: record.fileSize } : {}),
    ...(record.storageMethod === "file-copy"
      ? { modifiedAt: record.file.lastModified }
      : {}),
    availability: toAvailability(record.status),
    updatedAt: record.updatedAt
  };
}

function toAvailability(
  status: LocalAudioFileRecord["status"]
): LocalAudioAvailability {
  return status === "permission_required" ? "permission-required" : status;
}

export function getWebLocalAudioBindingKey(
  record: LocalAudioFileRecord
): LocalAudioBindingKey | undefined {
  const key = `${record.id}:${record.updatedAt}`;
  return isLocalAudioBindingKey(key) ? key : undefined;
}

function getWebWriteErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "本地存储空间不足，无法保存这个音频文件。";
  }

  return "无法保存本地音频绑定，请检查浏览器存储权限和剩余空间。";
}

function getNextUpdatedAt(
  proposedValue: string,
  existingValue: string | undefined
): string | undefined {
  const proposedTimestamp = Date.parse(proposedValue);
  if (!Number.isFinite(proposedTimestamp)) {
    return undefined;
  }

  const existingTimestamp = existingValue ? Date.parse(existingValue) : Number.NaN;
  const nextTimestamp = Number.isFinite(existingTimestamp)
    ? Math.max(proposedTimestamp, existingTimestamp + 1)
    : proposedTimestamp;

  return new Date(nextTimestamp).toISOString();
}

function isSafeBrowserFileName(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !value.includes("\0") &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}
