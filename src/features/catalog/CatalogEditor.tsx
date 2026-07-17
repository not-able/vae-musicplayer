import { useRef, useState, type FormEvent } from "react";

import type { Album, AlbumType, EntityId, Track } from "../../types";
import type {
  CatalogAlbumCreationResult,
  CatalogAlbumDraft,
  CatalogAlbumUpdateDraft,
  CatalogMutationResult,
  CatalogTrackCreationResult,
  CatalogTrackDraft,
  CatalogTrackUpdateDraft
} from "./useCatalogLibrary";
import { parsePositiveInteger } from "./catalogValidation";

interface CatalogEditorCommonProps {
  artistName: string;
  isSaving: boolean;
  onCancel: () => void;
}

type CatalogEditorProps =
  | (CatalogEditorCommonProps & {
      mode: "create";
      onSubmit: (draft: CatalogAlbumDraft) => Promise<CatalogAlbumCreationResult>;
      onCreated: (albumId: EntityId) => void;
    })
  | (CatalogEditorCommonProps & {
      mode: "edit";
      album: Album;
      onSubmit: (draft: CatalogAlbumUpdateDraft) => Promise<CatalogMutationResult>;
      onSaved: () => void;
      onReset?: () => Promise<CatalogMutationResult>;
    });

interface CatalogEditorErrors {
  title?: string;
}

const albumTypeOptions: ReadonlyArray<{
  value: AlbumType;
  label: string;
}> = [
  { value: "album", label: "专辑" },
  { value: "ep", label: "EP" },
  { value: "single_collection", label: "单曲合集" },
  { value: "other", label: "其他发行" }
];

export function CatalogEditor(props: CatalogEditorProps) {
  const { artistName, isSaving, onCancel } = props;
  const isEditing = props.mode === "edit";
  const [title, setTitle] = useState(() =>
    props.mode === "edit" ? props.album.title : ""
  );
  const [albumType, setAlbumType] = useState<AlbumType>(() =>
    props.mode === "edit" ? props.album.type : "album"
  );
  const [errors, setErrors] = useState<CatalogEditorErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInProgress = useRef(false);
  const isPending = isSaving || isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submitInProgress.current || isSaving) {
      return;
    }

    const trimmedTitle = title.trim();
    const nextErrors: CatalogEditorErrors = {};

    if (trimmedTitle.length === 0) {
      nextErrors.title = "请输入专辑名。";
    }

    setErrors(nextErrors);
    setSaveError(undefined);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    submitInProgress.current = true;
    setIsSubmitting(true);

    try {
      if (props.mode === "edit") {
        const result = await props.onSubmit({
          title: trimmedTitle,
          type: albumType
        });

        if (result.ok) {
          props.onSaved();
        } else {
          setSaveError(result.errorMessage);
        }
      } else {
        const result = await props.onSubmit({
          title: trimmedTitle,
          type: albumType
        });

        if (result.ok) {
          props.onCreated(result.albumId);
        } else {
          setSaveError(result.errorMessage);
        }
      }
    } finally {
      submitInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleReset(): Promise<void> {
    if (
      props.mode !== "edit" ||
      !props.onReset ||
      submitInProgress.current ||
      isSaving
    ) {
      return;
    }

    setErrors({});
    setSaveError(undefined);
    submitInProgress.current = true;
    setIsSubmitting(true);

    try {
      const result = await props.onReset();

      if (result.ok) {
        props.onSaved();
      } else {
        setSaveError(result.errorMessage);
      }
    } finally {
      submitInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <section className="catalog-editor" aria-labelledby="catalog-editor-heading">
      <div>
        <p className="eyebrow">{isEditing ? "Edit album" : "New album"}</p>
        <h3 id="catalog-editor-heading">{isEditing ? "编辑专辑" : "新增专辑"}</h3>
        <p className="helper-text">
          {isEditing
            ? "只修改本地元数据，专辑 ID 和歌曲关系保持不变。"
            : "先创建一张空专辑，歌曲可在后续步骤中维护。"}
        </p>
      </div>

      <form className="catalog-editor-form" noValidate onSubmit={handleSubmit}>
        <label className="catalog-editor-field">
          <span>艺人</span>
          <input name="album-artist" type="text" value={artistName} readOnly />
        </label>

        <label className="catalog-editor-field">
          <span>专辑名</span>
          <input
            name="album-title"
            type="text"
            value={title}
            autoFocus
            disabled={isPending}
            aria-invalid={errors.title ? "true" : undefined}
            aria-describedby={errors.title ? "catalog-title-error" : undefined}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          {errors.title && (
            <span className="catalog-editor-field-error" id="catalog-title-error">
              {errors.title}
            </span>
          )}
        </label>

        <label className="catalog-editor-field">
          <span>类型</span>
          <select
            name="album-type"
            value={albumType}
            disabled={isPending}
            onChange={(event) => setAlbumType(event.currentTarget.value as AlbumType)}
          >
            {albumTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {saveError && (
          <p className="catalog-editor-save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="catalog-editor-actions">
          {props.mode === "edit" && props.onReset && (
            <button
              className="text-button catalog-editor-reset-button"
              type="button"
              disabled={isPending}
              onClick={() => void handleReset()}
            >
              恢复默认
            </button>
          )}
          <button
            className="text-button"
            type="button"
            disabled={isPending}
            onClick={onCancel}
          >
            取消
          </button>
          <button className="secondary-button" type="submit" disabled={isPending}>
            {isPending ? "正在保存…" : isEditing ? "保存修改" : "保存专辑"}
          </button>
        </div>
      </form>
    </section>
  );
}

interface CatalogTrackEditorCommonProps {
  albumTitle: string;
  artistName: string;
  isSaving: boolean;
  onCancel: () => void;
}

type CatalogTrackEditorProps =
  | (CatalogTrackEditorCommonProps & {
      mode: "create";
      onSubmit: (draft: CatalogTrackDraft) => Promise<CatalogTrackCreationResult>;
      onCreated: (trackId: EntityId) => void;
    })
  | (CatalogTrackEditorCommonProps & {
      mode: "edit";
      track: Track;
      onSubmit: (draft: CatalogTrackUpdateDraft) => Promise<CatalogMutationResult>;
      onSaved: () => void;
      onReset?: () => Promise<CatalogMutationResult>;
    });

interface CatalogTrackEditorErrors {
  title?: string;
  trackNumber?: string;
}

export function CatalogTrackEditor(props: CatalogTrackEditorProps) {
  const { albumTitle, artistName, isSaving, onCancel } = props;
  const isEditing = props.mode === "edit";
  const [title, setTitle] = useState(() =>
    props.mode === "edit" ? props.track.title : ""
  );
  const [trackNumber, setTrackNumber] = useState(() =>
    props.mode === "edit" ? String(props.track.trackNumber ?? "") : ""
  );
  const [errors, setErrors] = useState<CatalogTrackEditorErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInProgress = useRef(false);
  const isPending = isSaving || isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submitInProgress.current || isSaving) {
      return;
    }

    const trimmedTitle = title.trim();
    const parsedTrackNumber = parsePositiveInteger(trackNumber);
    const trackNumberIsCleared = isEditing && trackNumber.trim().length === 0;
    const nextErrors: CatalogTrackEditorErrors = {};

    if (trimmedTitle.length === 0) {
      nextErrors.title = "请输入歌曲名。";
    }
    if (!trackNumberIsCleared && parsedTrackNumber === undefined) {
      nextErrors.trackNumber = "曲序必须是正整数。";
    }

    setErrors(nextErrors);
    setSaveError(undefined);

    if (
      Object.keys(nextErrors).length > 0 ||
      (!trackNumberIsCleared && parsedTrackNumber === undefined)
    ) {
      return;
    }

    submitInProgress.current = true;
    setIsSubmitting(true);

    try {
      if (props.mode === "edit") {
        const result = await props.onSubmit({
          title: trimmedTitle,
          trackNumber: trackNumberIsCleared ? null : (parsedTrackNumber as number)
        });

        if (result.ok) {
          props.onSaved();
        } else {
          setSaveError(result.errorMessage);
        }
      } else {
        const result = await props.onSubmit({
          title: trimmedTitle,
          trackNumber: parsedTrackNumber as number
        });

        if (result.ok) {
          props.onCreated(result.trackId);
        } else {
          setSaveError(result.errorMessage);
        }
      }
    } finally {
      submitInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleReset(): Promise<void> {
    if (
      props.mode !== "edit" ||
      !props.onReset ||
      submitInProgress.current ||
      isSaving
    ) {
      return;
    }

    setErrors({});
    setSaveError(undefined);
    submitInProgress.current = true;
    setIsSubmitting(true);

    try {
      const result = await props.onReset();

      if (result.ok) {
        props.onSaved();
      } else {
        setSaveError(result.errorMessage);
      }
    } finally {
      submitInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className="catalog-editor catalog-track-editor"
      aria-labelledby="catalog-track-editor-heading"
    >
      <div>
        <p className="eyebrow">{isEditing ? "Edit track" : "New track"}</p>
        <h3 id="catalog-track-editor-heading">{isEditing ? "编辑歌曲" : "新增歌曲"}</h3>
        <p className="helper-text">
          {isEditing
            ? "只修改本地元数据，歌曲 ID、队列和音频绑定保持不变。"
            : "歌曲会保存到当前专辑，并按曲序展示。"}
        </p>
      </div>

      <form className="catalog-editor-form" noValidate onSubmit={handleSubmit}>
        <label className="catalog-editor-field">
          <span>艺人</span>
          <input name="track-artist" type="text" value={artistName} readOnly />
        </label>

        <label className="catalog-editor-field">
          <span>专辑</span>
          <input name="track-album" type="text" value={albumTitle} readOnly />
        </label>

        <label className="catalog-editor-field">
          <span>歌曲名</span>
          <input
            name="track-title"
            type="text"
            value={title}
            autoFocus
            disabled={isPending}
            aria-invalid={errors.title ? "true" : undefined}
            aria-describedby={errors.title ? "catalog-track-title-error" : undefined}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          {errors.title && (
            <span className="catalog-editor-field-error" id="catalog-track-title-error">
              {errors.title}
            </span>
          )}
        </label>

        <label className="catalog-editor-field">
          <span>曲序</span>
          <input
            name="track-number"
            type="text"
            inputMode="numeric"
            value={trackNumber}
            disabled={isPending}
            aria-invalid={errors.trackNumber ? "true" : undefined}
            aria-describedby={
              errors.trackNumber ? "catalog-track-number-error" : undefined
            }
            onChange={(event) => setTrackNumber(event.currentTarget.value)}
          />
          {errors.trackNumber && (
            <span
              className="catalog-editor-field-error"
              id="catalog-track-number-error"
            >
              {errors.trackNumber}
            </span>
          )}
        </label>

        {saveError && (
          <p className="catalog-editor-save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="catalog-editor-actions">
          {props.mode === "edit" && props.onReset && (
            <button
              className="text-button catalog-editor-reset-button"
              type="button"
              disabled={isPending}
              onClick={() => void handleReset()}
            >
              恢复默认
            </button>
          )}
          <button
            className="text-button"
            type="button"
            disabled={isPending}
            onClick={onCancel}
          >
            取消
          </button>
          <button className="secondary-button" type="submit" disabled={isPending}>
            {isPending ? "正在保存…" : isEditing ? "保存修改" : "保存歌曲"}
          </button>
        </div>
      </form>
    </section>
  );
}
