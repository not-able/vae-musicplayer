import type { EntityId, ISODateString, LocalAudioFileRecord } from "../../types";

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "ogg",
  "opus",
  "wav"
]);

export const LOCAL_AUDIO_FILE_ACCEPT = "audio/*,.aac,.flac,.m4a,.mp3,.ogg,.opus,.wav";

export function getLocalAudioFileValidationError(file: File): string | undefined {
  if (file.type.startsWith("audio/")) {
    return undefined;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
    return undefined;
  }

  return "请选择常见格式的本地音频文件。";
}

export function createLocalAudioFileRecord(
  trackId: EntityId,
  file: File,
  updatedAt: ISODateString
): LocalAudioFileRecord {
  return {
    id: `local_audio_${trackId}`,
    trackId,
    fileName: file.name,
    fileType: file.type || undefined,
    fileSize: file.size,
    status: "available",
    updatedAt,
    file
  };
}
