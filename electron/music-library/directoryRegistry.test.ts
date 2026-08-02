import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MusicDirectoryRegistry,
  normalizeDirectoryPathForComparison
} from "./directoryRegistry";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true }))
  );
});

async function createTemporaryRoot(): Promise<string> {
  const directoryPath = await mkdtemp(path.join(tmpdir(), "music-registry-test-"));
  temporaryRoots.push(directoryPath);
  return directoryPath;
}

describe("music directory registry", () => {
  it("persists records and reuses a directory selected more than once", async () => {
    const root = await createTemporaryRoot();
    const musicDirectory = path.join(root, "音乐库");
    const registryFile = path.join(root, "registry", "directories.json");
    await mkdir(musicDirectory);
    const firstRegistry = new MusicDirectoryRegistry({
      filePath: registryFile,
      clock: () => new Date("2026-08-02T00:00:00.000Z")
    });

    const firstSelection = await firstRegistry.registerDirectory(musicDirectory);
    const duplicateSelection = await firstRegistry.registerDirectory(
      `${musicDirectory}${path.sep}`
    );
    const restartedRegistry = new MusicDirectoryRegistry({ filePath: registryFile });
    const restoredDirectories = await restartedRegistry.listDirectories();

    expect(duplicateSelection.directoryId).toBe(firstSelection.directoryId);
    expect(restoredDirectories).toEqual([
      {
        ...firstSelection,
        availability: "available"
      }
    ]);
    expect(JSON.parse(await readFile(registryFile, "utf8"))).toMatchObject({
      schemaVersion: 1,
      directories: [{ directoryId: firstSelection.directoryId }]
    });
  });

  it("falls back safely when persisted JSON is corrupt", async () => {
    const root = await createTemporaryRoot();
    const registryFile = path.join(root, "directories.json");
    const reportIssue = vi.fn();
    await writeFile(registryFile, "{not valid JSON", "utf8");
    const registry = new MusicDirectoryRegistry({
      filePath: registryFile,
      reportIssue
    });

    await expect(registry.listDirectories()).resolves.toEqual([]);
    expect(reportIssue).toHaveBeenCalledWith({
      code: "invalid_registry",
      message: "音乐目录注册表 JSON 已损坏，已安全回退为空记录。"
    });
  });

  it("reports a selected directory as missing after it is deleted", async () => {
    const root = await createTemporaryRoot();
    const musicDirectory = path.join(root, "稍后删除");
    await mkdir(musicDirectory);
    const registry = new MusicDirectoryRegistry({
      filePath: path.join(root, "registry.json")
    });
    await registry.registerDirectory(musicDirectory);

    await rm(musicDirectory, { recursive: true });

    await expect(registry.listDirectories()).resolves.toMatchObject([
      { availability: "missing" }
    ]);
  });

  it("normalizes Windows case and trailing separators for comparisons", () => {
    expect(normalizeDirectoryPathForComparison("C:\\Music\\许嵩\\", "win32")).toBe(
      normalizeDirectoryPathForComparison("c:\\music\\许嵩", "win32")
    );
  });
});
