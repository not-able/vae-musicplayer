import type {
  EntityId,
  ISODateString,
  LocalAudioFileCopyRecord,
  LocalAudioFileHandleRecord,
  LocalAudioFileRecord
} from "../../types";

export const LOCAL_AUDIO_FILE_EXTENSIONS = [
  "aac",
  "flac",
  "m4a",
  "mp3",
  "ogg",
  "opus",
  "wav"
] as const;

export type LocalAudioFileExtension = (typeof LOCAL_AUDIO_FILE_EXTENSIONS)[number];

const SUPPORTED_AUDIO_EXTENSIONS = new Set<string>(LOCAL_AUDIO_FILE_EXTENSIONS);

export const LOCAL_AUDIO_FILE_ACCEPT = [
  "audio/*",
  ...LOCAL_AUDIO_FILE_EXTENSIONS.map((extension) => `.${extension}`)
].join(",");

export function getLocalAudioFileExtension(
  fileName: string
): LocalAudioFileExtension | undefined {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension && SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
    return extension as LocalAudioFileExtension;
  }

  return undefined;
}

export function getLocalAudioFileValidationError(file: File): string | undefined {
  if (file.type.startsWith("audio/")) {
    return undefined;
  }

  if (getLocalAudioFileExtension(file.name)) {
    return undefined;
  }

  return "请选择常见格式的本地音频文件。";
}

export function createLocalAudioFileRecord(
  trackId: EntityId,
  file: File,
  updatedAt: ISODateString
): LocalAudioFileCopyRecord {
  return {
    id: `local_audio_${trackId}`,
    trackId,
    fileName: file.name,
    fileType: file.type || undefined,
    fileSize: file.size,
    status: "available",
    updatedAt,
    storageMethod: "file-copy",
    file
  };
}

export function createLocalAudioFileHandleRecord(
  trackId: EntityId,
  file: File,
  fileHandle: FileSystemFileHandle,
  updatedAt: ISODateString
): LocalAudioFileHandleRecord {
  return {
    id: `local_audio_${trackId}`,
    trackId,
    fileName: file.name,
    fileType: file.type || undefined,
    fileSize: file.size,
    status: "available",
    updatedAt,
    storageMethod: "file-handle",
    fileHandle
  };
}

export async function getLocalAudioFile(record: LocalAudioFileRecord): Promise<File> {
  return record.storageMethod === "file-copy"
    ? record.file
    : record.fileHandle.getFile();
}
