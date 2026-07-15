import type { EntityId, LocalAudioFileRecord } from "../../types";

export interface LocalAudioFileRepository {
  list(): Promise<LocalAudioFileRecord[]>;
  save(record: LocalAudioFileRecord): Promise<void>;
  remove(trackId: EntityId): Promise<void>;
}
