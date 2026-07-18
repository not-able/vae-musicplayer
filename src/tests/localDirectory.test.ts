import { describe, expect, it } from "vitest";

import {
  normalizeDirectoryCandidateKey,
  normalizeDirectoryCandidateText,
  scanLocalDirectory
} from "../features/local-library/localDirectoryScanner";

function createDirectoryFile(
  relativePath: string,
  options: FilePropertyBag = {}
): File {
  const file = new File(
    ["self-created test bytes"],
    relativePath.split("/").at(-1) ?? "",
    options
  );

  Object.defineProperty(file, "webkitRelativePath", {
    value: relativePath
  });

  return file;
}

describe("local directory scanner", () => {
  it("scans both a selected album directory and a music library root", () => {
    const albumFile = createDirectoryFile("呼吸之野/雅俗共赏.mp3", {
      type: "audio/mpeg"
    });
    const libraryFile = createDirectoryFile("音乐库/寻宝游戏/许嵩-如约而至.FLAC");
    const result = scanLocalDirectory([albumFile, libraryFile], {
      defaultArtistName: "许嵩"
    });

    expect(result).toEqual({
      totalFileCount: 2,
      candidates: [
        {
          file: albumFile,
          relativePath: "呼吸之野/雅俗共赏.mp3",
          albumTitle: "呼吸之野",
          fileName: "雅俗共赏.mp3",
          fileNameStem: "雅俗共赏",
          fileExtension: "mp3",
          trackTitle: "雅俗共赏",
          parseStatus: "parsed",
          issues: []
        },
        {
          file: libraryFile,
          relativePath: "音乐库/寻宝游戏/许嵩-如约而至.FLAC",
          albumTitle: "寻宝游戏",
          fileName: "许嵩-如约而至.FLAC",
          fileNameStem: "许嵩-如约而至",
          fileExtension: "flac",
          artistName: "许嵩",
          trackTitle: "如约而至",
          parseStatus: "parsed",
          issues: []
        }
      ],
      ignoredFiles: [],
      errors: []
    });
  });

  it("accepts every configured local audio extension regardless of filename case", () => {
    const extensions = ["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav"];
    const files = extensions.map((extension) =>
      createDirectoryFile(`专辑/歌曲.${extension.toUpperCase()}`)
    );
    const result = scanLocalDirectory(files);

    expect(result.candidates.map((candidate) => candidate.fileExtension)).toEqual(
      extensions
    );
    expect(result.ignoredFiles).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("does not split an unrecognized compact artist prefix", () => {
    const noArtistFile = createDirectoryFile("专辑/歌名-现场版.mp3");
    const unknownCompactArtistFile = createDirectoryFile("专辑/其他歌手-歌名.flac");
    const unknownSpacedArtistFile = createDirectoryFile("专辑/其他歌手 - 歌名.m4a");
    const unconfiguredDefaultArtistFile = createDirectoryFile("专辑/许嵩-歌名.aac");
    const knownArtistFile = createDirectoryFile("专辑/许嵩 - 歌名 - Live.ogg");
    const result = scanLocalDirectory(
      [
        noArtistFile,
        unknownCompactArtistFile,
        unknownSpacedArtistFile,
        knownArtistFile
      ],
      { defaultArtistName: "许嵩" }
    );

    expect(
      result.candidates.map((candidate) => ({
        artistName: candidate.artistName,
        trackTitle: candidate.trackTitle,
        parseStatus: candidate.parseStatus,
        issues: candidate.issues
      }))
    ).toEqual([
      {
        artistName: undefined,
        trackTitle: "歌名-现场版",
        parseStatus: "needs_review",
        issues: ["ambiguous_compact_hyphen"]
      },
      {
        artistName: undefined,
        trackTitle: "其他歌手-歌名",
        parseStatus: "needs_review",
        issues: ["ambiguous_compact_hyphen"]
      },
      {
        artistName: undefined,
        trackTitle: "其他歌手 - 歌名",
        parseStatus: "needs_review",
        issues: ["unrecognized_spaced_artist_prefix"]
      },
      {
        artistName: "许嵩",
        trackTitle: "歌名 - Live",
        parseStatus: "parsed",
        issues: []
      }
    ]);

    const unconfiguredArtist = scanLocalDirectory([unconfiguredDefaultArtistFile]);

    expect(unconfiguredArtist.candidates[0]).toMatchObject({
      trackTitle: "许嵩-歌名",
      parseStatus: "needs_review",
      issues: ["ambiguous_compact_hyphen"]
    });

    const knownArtistByOption = scanLocalDirectory([unconfiguredDefaultArtistFile], {
      knownArtistNames: ["　许嵩　"]
    });

    expect(knownArtistByOption.candidates[0]).toMatchObject({
      artistName: "许嵩",
      trackTitle: "歌名",
      parseStatus: "parsed",
      issues: []
    });
  });

  it("normalizes Unicode whitespace and common hyphen variants without changing originals", () => {
    const file = createDirectoryFile("　专辑　/　许嵩　－　歌名　.ogg");
    const result = scanLocalDirectory([file], { defaultArtistName: "许嵩" });

    expect(normalizeDirectoryCandidateText("　全　角　－　空格　")).toBe(
      "全 角 - 空格"
    );
    expect(normalizeDirectoryCandidateKey(" SONG ")).toBe("song");
    expect(result.candidates[0]).toMatchObject({
      file,
      relativePath: "　专辑　/　许嵩　－　歌名　.ogg",
      albumTitle: "专辑",
      fileName: "　许嵩　－　歌名　.ogg",
      fileNameStem: "　许嵩　－　歌名　",
      fileExtension: "ogg",
      artistName: "许嵩",
      trackTitle: "歌名",
      parseStatus: "parsed",
      issues: []
    });
  });

  it("filters only supported extensions and keeps malformed audio candidates for review", () => {
    const textFile = createDirectoryFile("专辑/说明.txt", { type: "text/plain" });
    const audioMimeWithUnknownExtension = createDirectoryFile("专辑/未知编码.bin", {
      type: "audio/wav"
    });
    const missingPathFile = new File(["self-created test bytes"], "歌名.mp3");
    const absolutePathFile = createDirectoryFile("C:/音乐/专辑/歌名.flac");
    const traversalPathFile = createDirectoryFile("../专辑/歌名.aac");
    const missingAlbumFile = createDirectoryFile("歌名.ogg");
    const missingTitleFile = createDirectoryFile("专辑/.wav");
    const result = scanLocalDirectory([
      textFile,
      audioMimeWithUnknownExtension,
      missingPathFile,
      absolutePathFile,
      traversalPathFile,
      missingAlbumFile,
      missingTitleFile
    ]);

    expect(result.totalFileCount).toBe(7);
    expect(result.ignoredFiles).toEqual([
      {
        fileName: "说明.txt",
        relativePath: "专辑/说明.txt",
        reason: "unsupported_extension"
      },
      {
        fileName: "未知编码.bin",
        relativePath: "专辑/未知编码.bin",
        reason: "unsupported_extension"
      }
    ]);
    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.map((candidate) => candidate.issues)).toEqual([
      ["missing_relative_path"],
      ["invalid_relative_path"],
      ["invalid_relative_path"],
      ["missing_album_title"],
      ["missing_track_title"]
    ]);
    expect(
      result.candidates.every((candidate) => candidate.parseStatus === "needs_review")
    ).toBe(true);
    expect(result.errors.map((error) => error.code)).toEqual([
      "missing_relative_path",
      "invalid_relative_path",
      "invalid_relative_path",
      "missing_album_title",
      "missing_track_title"
    ]);
    expect(result.candidates[1]).not.toHaveProperty("relativePath");
    expect(result.candidates[2]).not.toHaveProperty("relativePath");
    expect(result.errors.at(-1)).toMatchObject({
      relativePath: "专辑/.wav",
      code: "missing_track_title"
    });
  });

  it("does not retain unsafe paths for ignored files", () => {
    const file = createDirectoryFile("C:/音乐/说明.txt");
    const result = scanLocalDirectory([file]);

    expect(result.ignoredFiles).toEqual([
      {
        fileName: "说明.txt",
        reason: "unsupported_extension"
      }
    ]);
  });
});
