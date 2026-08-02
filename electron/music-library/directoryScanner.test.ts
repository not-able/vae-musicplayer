import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { scanLocalDirectoryEntries } from "../../src/features/local-library/localDirectoryEntryScanner";
import { scanDesktopMusicDirectory, isPathInsideRoot } from "./directoryScanner";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true }))
  );
});

async function createTemporaryRoot(prefix: string): Promise<string> {
  const directoryPath = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryRoots.push(directoryPath);
  return directoryPath;
}

async function createEmptyFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "", "utf8");
}

describe("desktop music directory scanner", () => {
  it("recursively scans supported Unicode paths without reading file content", async () => {
    const root = await createTemporaryRoot("music-scanner-unicode-");
    await createEmptyFile(path.join(root, "许嵩", "自定义", "01 - 有何不可.mp3"));
    await createEmptyFile(path.join(root, "许嵩", "自定义", "02 - 清明雨上.FLAC"));
    await createEmptyFile(path.join(root, "其他", "测试 歌曲.m4a"));
    await createEmptyFile(path.join(root, "损坏.wav"));
    await createEmptyFile(path.join(root, "文档.txt"));

    const result = await scanDesktopMusicDirectory({
      directoryId: "11111111-1111-4111-8111-111111111111",
      directoryPath: root,
      clock: () => new Date("2026-08-02T01:02:03.000Z")
    });
    const relativePaths = result.candidates.map((candidate) => candidate.relativePath);

    expect(result).toMatchObject({
      scannedAt: "2026-08-02T01:02:03.000Z",
      totalFileCount: 5,
      supportedFileCount: 4,
      ignoredFileCount: 1,
      errorCount: 0
    });
    expect(
      result.candidates.map((candidate) => candidate.fileExtension).sort()
    ).toEqual(["flac", "m4a", "mp3", "wav"]);
    expect(relativePaths.every((relativePath) => !relativePath.includes("\\"))).toBe(
      true
    );
    expect(relativePaths).toEqual(
      [...relativePaths].sort((left, right) =>
        left.toLocaleLowerCase("en-US").localeCompare(right.toLocaleLowerCase("en-US"))
      )
    );
    expect(JSON.stringify(result)).not.toContain(root);
    expect(
      result.candidates.every(
        (candidate) => !Buffer.isBuffer(candidate) && !(candidate instanceof Uint8Array)
      )
    ).toBe(true);
  });

  it("uses the same filename and album parsing as the Web scanner", async () => {
    const root = await createTemporaryRoot("music-scanner-shared-rules-");
    const relativePath = "日文 アルバム/许嵩 - 测试 曲目.MP3";
    await createEmptyFile(path.join(root, ...relativePath.split("/")));
    const sharedResult = scanLocalDirectoryEntries(
      [{ fileName: "许嵩 - 测试 曲目.MP3", relativePath }],
      { knownArtistNames: ["许嵩"] }
    );
    const desktopResult = await scanDesktopMusicDirectory({
      directoryId: "22222222-2222-4222-8222-222222222222",
      directoryPath: root,
      parseOptions: { knownArtistNames: ["许嵩"] }
    });

    expect(desktopResult.candidates[0]).toMatchObject({
      albumTitle: sharedResult.candidates[0]?.albumTitle,
      artistName: sharedResult.candidates[0]?.artistName,
      trackTitle: sharedResult.candidates[0]?.trackTitle,
      parseStatus: sharedResult.candidates[0]?.parseStatus,
      issues: sharedResult.candidates[0]?.issues
    });
  });

  it("does not follow a directory symlink outside the selected root", async () => {
    const root = await createTemporaryRoot("music-scanner-symlink-root-");
    const outside = await createTemporaryRoot("music-scanner-symlink-outside-");
    await createEmptyFile(path.join(outside, "外部专辑", "不应出现.mp3"));
    await symlink(outside, path.join(root, "外部链接"), "junction");

    const result = await scanDesktopMusicDirectory({
      directoryId: "33333333-3333-4333-8333-333333333333",
      directoryPath: root
    });

    expect(result.totalFileCount).toBe(0);
    expect(result.candidates).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("不应出现.mp3");
  });

  it("rejects an authorized root that was replaced with a symlink", async () => {
    const root = await createTemporaryRoot("music-scanner-root-target-");
    const rootLinkParent = await createTemporaryRoot("music-scanner-root-link-");
    const rootLink = path.join(rootLinkParent, "音乐库链接");
    await symlink(root, rootLink, "junction");

    await expect(
      scanDesktopMusicDirectory({
        directoryId: "66666666-6666-4666-8666-666666666666",
        directoryPath: rootLink
      })
    ).rejects.toMatchObject({ code: "directory_unreadable" });
  });

  it("rejects paths that escape the authorized root", async () => {
    const root = await createTemporaryRoot("music-scanner-escape-");
    const outsidePath = path.resolve(root, "..", "outside.mp3");

    expect(isPathInsideRoot(root, outsidePath)).toBe(false);
    expect(isPathInsideRoot(root, path.join(root, "专辑", "歌曲.mp3"))).toBe(true);
  });

  it("returns a clear missing-directory error", async () => {
    const root = await createTemporaryRoot("music-scanner-missing-");
    await rm(root, { recursive: true });

    await expect(
      scanDesktopMusicDirectory({
        directoryId: "44444444-4444-4444-8444-444444444444",
        directoryPath: root
      })
    ).rejects.toMatchObject({ code: "directory_missing" });
  });
});
