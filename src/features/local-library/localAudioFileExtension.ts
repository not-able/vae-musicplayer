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

export function getLocalAudioFileExtension(
  fileName: string
): LocalAudioFileExtension | undefined {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension && SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
    return extension as LocalAudioFileExtension;
  }

  return undefined;
}
