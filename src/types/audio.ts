import type { EntityId, ISODateString } from "./catalog";

export type PlaybackProviderType =
  "local_file" | "authorized_demo" | "third_party_platform";

export type AudioMappingStatus = "available" | "missing" | "permission_required";

export type LocalAudioStorageMethod = "file-copy" | "file-handle";

export interface LocalAudioFileMapping {
  id: EntityId;
  trackId: EntityId;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  status: AudioMappingStatus;
  updatedAt: ISODateString;
}

export interface LocalAudioFileCopyRecord extends LocalAudioFileMapping {
  storageMethod: "file-copy";
  file: File;
}

export interface LocalAudioFileHandleRecord extends LocalAudioFileMapping {
  storageMethod: "file-handle";
  fileHandle: FileSystemFileHandle;
}

export type LocalAudioFileRecord =
  LocalAudioFileCopyRecord | LocalAudioFileHandleRecord;

export interface PlaybackProviderDescriptor {
  id: EntityId;
  type: PlaybackProviderType;
  name: string;
  enabled: boolean;
}
