import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PLAYER_SETTINGS,
  PlayerSettingsRepositoryError
} from "../features/player/playerSettingsRepository";
import {
  LOCAL_PLAYER_SETTINGS_STORAGE_KEY,
  createLocalStoragePlayerSettingsRepository
} from "../infra/storage/localStoragePlayerSettingsRepository";

afterEach(() => {
  localStorage.removeItem(LOCAL_PLAYER_SETTINGS_STORAGE_KEY);
});

describe("local player settings repository", () => {
  it("uses safe defaults and persists only versioned volume and mute settings", async () => {
    const repository = createLocalStoragePlayerSettingsRepository(localStorage);

    await expect(repository.load()).resolves.toEqual(DEFAULT_PLAYER_SETTINGS);

    await repository.save({ volume: 0.37, muted: true });

    expect(
      JSON.parse(localStorage.getItem(LOCAL_PLAYER_SETTINGS_STORAGE_KEY) ?? "")
    ).toEqual({
      schemaVersion: 1,
      volume: 0.37,
      muted: true
    });
    await expect(repository.load()).resolves.toEqual({ volume: 0.37, muted: true });
  });

  it.each([
    "not json",
    JSON.stringify({ schemaVersion: 2, volume: 0.2, muted: false }),
    JSON.stringify({ schemaVersion: 1, volume: -0.1, muted: false }),
    JSON.stringify({ schemaVersion: 1, volume: 1.1, muted: false }),
    JSON.stringify({ schemaVersion: 1, volume: 0.2, muted: "false" })
  ])("falls back safely when stored settings are invalid: %s", async (serialized) => {
    const repository = createLocalStoragePlayerSettingsRepository(localStorage);
    localStorage.setItem(LOCAL_PLAYER_SETTINGS_STORAGE_KEY, serialized);

    await expect(repository.load()).resolves.toEqual(DEFAULT_PLAYER_SETTINGS);
  });

  it("rejects invalid writes and reports unavailable storage", async () => {
    const repository = createLocalStoragePlayerSettingsRepository(localStorage);
    const unavailableRepository = createLocalStoragePlayerSettingsRepository(
      () => undefined
    );

    await expect(
      repository.save({ volume: Number.NaN, muted: false })
    ).rejects.toBeInstanceOf(PlayerSettingsRepositoryError);
    await expect(unavailableRepository.load()).rejects.toMatchObject({
      code: "storage_unavailable"
    });
  });
});
