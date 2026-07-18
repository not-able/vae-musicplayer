import {
  getLocalAudioFileExtension,
  type LocalAudioFileExtension
} from "./localAudioFile";

export type LocalDirectoryCandidateParseStatus = "parsed" | "needs_review";

export interface LocalDirectoryScanOptions {
  defaultArtistName?: string;
  knownArtistNames?: readonly string[];
}

export type LocalDirectoryCandidateIssueCode =
  | "missing_relative_path"
  | "invalid_relative_path"
  | "missing_album_title"
  | "missing_track_title"
  | "unrecognized_spaced_artist_prefix"
  | "ambiguous_compact_hyphen"
  | "malformed_artist_separator";

export interface LocalDirectoryAudioCandidate {
  file: File;
  relativePath?: string;
  albumTitle?: string;
  fileName: string;
  fileNameStem: string;
  fileExtension: LocalAudioFileExtension;
  artistName?: string;
  trackTitle?: string;
  parseStatus: LocalDirectoryCandidateParseStatus;
  issues: readonly LocalDirectoryCandidateIssueCode[];
}

export interface LocalDirectoryIgnoredFile {
  fileName: string;
  relativePath?: string;
  reason: "unsupported_extension";
}

export interface LocalDirectoryScanError {
  fileName: string;
  relativePath?: string;
  code: LocalDirectoryCandidateIssueCode;
  message: string;
}

export interface LocalDirectoryScanResult {
  totalFileCount: number;
  candidates: readonly LocalDirectoryAudioCandidate[];
  ignoredFiles: readonly LocalDirectoryIgnoredFile[];
  errors: readonly LocalDirectoryScanError[];
}

interface ParsedFileName {
  fileNameStem: string;
  artistName?: string;
  trackTitle?: string;
  issues: readonly LocalDirectoryCandidateIssueCode[];
}

export function scanLocalDirectory(
  files: Iterable<File>,
  options: LocalDirectoryScanOptions = {}
): LocalDirectoryScanResult {
  const candidates: LocalDirectoryAudioCandidate[] = [];
  const ignoredFiles: LocalDirectoryIgnoredFile[] = [];
  const errors: LocalDirectoryScanError[] = [];
  let totalFileCount = 0;
  const knownArtistNames = createKnownArtistNames(options);

  for (const file of files) {
    totalFileCount += 1;
    const fileExtension = getLocalAudioFileExtension(file.name);

    if (!fileExtension) {
      ignoredFiles.push({
        fileName: file.name,
        relativePath: getSafeOptionalWebkitRelativePath(file),
        reason: "unsupported_extension"
      });
      continue;
    }

    const parsedFileName = parseFileName(file.name, knownArtistNames);
    const issues = [...parsedFileName.issues];
    const candidate: LocalDirectoryAudioCandidate = {
      file,
      fileName: file.name,
      fileNameStem: parsedFileName.fileNameStem,
      fileExtension,
      artistName: parsedFileName.artistName,
      trackTitle: parsedFileName.trackTitle,
      parseStatus: "parsed",
      issues
    };
    const relativePath = getWebkitRelativePath(file, issues);

    if (relativePath) {
      candidate.relativePath = relativePath;
      const albumTitle = normalizeDirectoryCandidateText(
        relativePath.split("/").at(-2) ?? ""
      );

      if (albumTitle) {
        candidate.albumTitle = albumTitle;
      } else {
        issues.push("missing_album_title");
      }
    }

    if (issues.length > 0) {
      candidate.parseStatus = "needs_review";
      errors.push(
        ...issues.map((code) => ({
          fileName: file.name,
          relativePath: candidate.relativePath,
          code,
          message: getLocalDirectoryScanErrorMessage(code)
        }))
      );
    }

    candidates.push(candidate);
  }

  return {
    totalFileCount,
    candidates,
    ignoredFiles,
    errors
  };
}

export function normalizeDirectoryCandidateText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‐‑‒–—―−﹘﹣－]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDirectoryCandidateKey(value: string): string {
  return normalizeDirectoryCandidateText(value).toLowerCase();
}

function createKnownArtistNames(
  options: LocalDirectoryScanOptions
): ReadonlySet<string> {
  const artistNames = [options.defaultArtistName, ...(options.knownArtistNames ?? [])]
    .map((artistName) => normalizeDirectoryCandidateKey(artistName ?? ""))
    .filter(Boolean);

  return new Set(artistNames);
}

function getSafeOptionalWebkitRelativePath(file: File): string | undefined {
  const relativePath = file.webkitRelativePath;

  return relativePath?.trim() && isValidRelativePath(relativePath)
    ? relativePath
    : undefined;
}

function getWebkitRelativePath(
  file: File,
  issues: LocalDirectoryCandidateIssueCode[]
): string | undefined {
  const relativePath = file.webkitRelativePath;

  if (!relativePath?.trim()) {
    issues.push("missing_relative_path");
    return undefined;
  }

  if (!isValidRelativePath(relativePath)) {
    issues.push("invalid_relative_path");
    return undefined;
  }

  return relativePath;
}

function isValidRelativePath(relativePath: string): boolean {
  if (
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    /^[a-z]:/i.test(relativePath)
  ) {
    return false;
  }

  return relativePath
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function parseFileName(
  fileName: string,
  knownArtistNames: ReadonlySet<string>
): ParsedFileName {
  const fileNameStem = fileName.slice(0, fileName.lastIndexOf("."));
  const normalizedStem = normalizeDirectoryCandidateText(fileNameStem);

  if (!normalizedStem) {
    return {
      fileNameStem,
      issues: ["missing_track_title"]
    };
  }

  const spacedSeparatorIndex = normalizedStem.indexOf(" - ");

  if (spacedSeparatorIndex >= 0) {
    const artistName = normalizeDirectoryCandidateText(
      normalizedStem.slice(0, spacedSeparatorIndex)
    );
    const trackTitle = normalizeDirectoryCandidateText(
      normalizedStem.slice(spacedSeparatorIndex + 3)
    );

    if (!artistName || !trackTitle) {
      return {
        fileNameStem,
        trackTitle: normalizedStem,
        issues: ["malformed_artist_separator"]
      };
    }

    return {
      fileNameStem,
      ...(knownArtistNames.has(normalizeDirectoryCandidateKey(artistName))
        ? { artistName, trackTitle, issues: [] }
        : {
            trackTitle: normalizedStem,
            issues: ["unrecognized_spaced_artist_prefix"]
          })
    };
  }

  const compactSeparatorIndex = normalizedStem.indexOf("-");

  if (compactSeparatorIndex >= 0) {
    const artistName = normalizeDirectoryCandidateText(
      normalizedStem.slice(0, compactSeparatorIndex)
    );
    const trackTitle = normalizeDirectoryCandidateText(
      normalizedStem.slice(compactSeparatorIndex + 1)
    );

    if (!artistName || !trackTitle) {
      return {
        fileNameStem,
        trackTitle: normalizedStem,
        issues: ["malformed_artist_separator"]
      };
    }

    if (knownArtistNames.has(normalizeDirectoryCandidateKey(artistName))) {
      return {
        fileNameStem,
        artistName,
        trackTitle,
        issues: []
      };
    }

    return {
      fileNameStem,
      trackTitle: normalizedStem,
      issues: ["ambiguous_compact_hyphen"]
    };
  }

  return {
    fileNameStem,
    trackTitle: normalizedStem,
    issues: []
  };
}

function getLocalDirectoryScanErrorMessage(
  code: LocalDirectoryCandidateIssueCode
): string {
  switch (code) {
    case "missing_relative_path":
      return "未读取到目录相对路径，请重新选择音乐目录。";
    case "invalid_relative_path":
      return "目录路径格式无效，无法识别专辑目录。";
    case "missing_album_title":
      return "无法从所选目录识别专辑名。";
    case "missing_track_title":
      return "无法从文件名识别歌曲名。";
    case "unrecognized_spaced_artist_prefix":
      return "文件名中的歌手前缀需要确认。";
    case "ambiguous_compact_hyphen":
      return "无法确定连字符前是否为歌手名。";
    case "malformed_artist_separator":
      return "文件名中的歌手和歌曲分隔格式不完整。";
  }
}
