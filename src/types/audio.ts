import type { EntityId, ISODateString } from "./catalog";

export type PlaybackProviderType =
  "local_file" | "authorized_demo" | "third_party_platform";

export type AudioMappingStatus = "available" | "missing" | "permission_required";

export interface LocalAudioFileMapping {
  id: EntityId;
  trackId: EntityId;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  fileHandleKey?: string;
  status: AudioMappingStatus;
  updatedAt: ISODateString;
}

export interface LocalAudioFileRecord extends LocalAudioFileMapping {
  file: File;
}

export interface PlaybackProviderDescriptor {
  id: EntityId;
  type: PlaybackProviderType;
  name: string;
  enabled: boolean;
}
