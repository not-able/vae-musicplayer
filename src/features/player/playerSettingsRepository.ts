export const PLAYER_SETTINGS_SCHEMA_VERSION = 1;

export interface PlayerSettings {
  volume: number;
  muted: boolean;
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  volume: 1,
  muted: false
};

export interface PlayerSettingsRepository {
  load(): Promise<PlayerSettings>;
  save(settings: PlayerSettings): Promise<void>;
}

export type PlayerSettingsRepositoryErrorCode =
  "storage_unavailable" | "read_failed" | "write_failed" | "invalid_data";

export class PlayerSettingsRepositoryError extends Error {
  readonly code: PlayerSettingsRepositoryErrorCode;

  constructor(
    code: PlayerSettingsRepositoryErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PlayerSettingsRepositoryError";
    this.code = code;
  }
}

const repositoryWriteTails = new WeakMap<PlayerSettingsRepository, Promise<void>>();

export function normalizePlayerSettings(value: unknown): PlayerSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlayerSettingsRepositoryError("invalid_data", "播放器设置必须是对象。");
  }

  const record = value as Record<string, unknown>;
  const { volume, muted } = record;

  if (
    typeof volume !== "number" ||
    !Number.isFinite(volume) ||
    volume < 0 ||
    volume > 1
  ) {
    throw new PlayerSettingsRepositoryError(
      "invalid_data",
      "播放器音量必须是 0 到 1 之间的有限数字。"
    );
  }
  if (typeof muted !== "boolean") {
    throw new PlayerSettingsRepositoryError(
      "invalid_data",
      "播放器静音设置必须是布尔值。"
    );
  }

  return { volume, muted };
}

export function savePlayerSettingsInRepositoryOrder(
  repository: PlayerSettingsRepository,
  settings: PlayerSettings
): Promise<void> {
  const previousWrite = repositoryWriteTails.get(repository) ?? Promise.resolve();
  const currentWrite = previousWrite.then(() => repository.save(settings));

  repositoryWriteTails.set(
    repository,
    currentWrite.catch(() => undefined)
  );

  return currentWrite;
}
