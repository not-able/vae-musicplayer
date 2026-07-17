import { useRef, useState, type FormEvent } from "react";

import type { AlbumType, EntityId, ISODateString } from "../../types";
import type {
  CatalogAlbumCreationResult,
  CatalogAlbumDraft,
  CatalogTrackCreationResult,
  CatalogTrackDraft
} from "./useCatalogLibrary";

interface CatalogEditorProps {
  artistName: string;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (draft: CatalogAlbumDraft) => Promise<CatalogAlbumCreationResult>;
  onCreated: (albumId: EntityId) => void;
}

interface CatalogEditorErrors {
  title?: string;
  releaseDate?: string;
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

export function CatalogEditor({
  artistName,
  isSaving,
  onCancel,
  onSubmit,
  onCreated
}: CatalogEditorProps) {
  const [title, setTitle] = useState("");
  const [albumType, setAlbumType] = useState<AlbumType>("album");
  const [releaseDate, setReleaseDate] = useState("");
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
    const trimmedReleaseDate = releaseDate.trim();
    const nextErrors: CatalogEditorErrors = {};

    if (trimmedTitle.length === 0) {
      nextErrors.title = "请输入专辑名。";
    }

    if (trimmedReleaseDate.length > 0 && !isValidCalendarDate(trimmedReleaseDate)) {
      nextErrors.releaseDate = "请输入有效日期，格式为 YYYY-MM-DD。";
    }

    setErrors(nextErrors);
    setSaveError(undefined);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    submitInProgress.current = true;
    setIsSubmitting(true);

    try {
      const result = await onSubmit({
        title: trimmedTitle,
        type: albumType,
        ...(trimmedReleaseDate
          ? { releaseDate: trimmedReleaseDate as ISODateString }
          : {})
      });

      if (result.ok) {
        onCreated(result.albumId);
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
        <p className="eyebrow">New album</p>
        <h3 id="catalog-editor-heading">新增专辑</h3>
        <p className="helper-text">先创建一张空专辑，歌曲可在后续步骤中维护。</p>
      </div>

      <form className="catalog-editor-form" noValidate onSubmit={handleSubmit}>
        <label className="catalog-editor-field">
          <span>艺人</span>
          <input type="text" value={artistName} readOnly />
        </label>

        <label className="catalog-editor-field">
          <span>专辑名</span>
          <input
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

        <label className="catalog-editor-field">
          <span>发行日期（可选）</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            value={releaseDate}
            disabled={isPending}
            aria-invalid={errors.releaseDate ? "true" : undefined}
            aria-describedby={
              errors.releaseDate ? "catalog-release-date-error" : undefined
            }
            onChange={(event) => setReleaseDate(event.currentTarget.value)}
          />
          {errors.releaseDate && (
            <span
              className="catalog-editor-field-error"
              id="catalog-release-date-error"
            >
              {errors.releaseDate}
            </span>
          )}
        </label>

        {saveError && (
          <p className="catalog-editor-save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="catalog-editor-actions">
          <button
            className="text-button"
            type="button"
            disabled={isPending}
            onClick={onCancel}
          >
            取消
          </button>
          <button className="secondary-button" type="submit" disabled={isPending}>
            {isPending ? "正在保存…" : "保存专辑"}
          </button>
        </div>
      </form>
    </section>
  );
}

interface CatalogTrackEditorProps {
  albumTitle: string;
  artistName: string;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (draft: CatalogTrackDraft) => Promise<CatalogTrackCreationResult>;
  onCreated: (trackId: EntityId) => void;
}

interface CatalogTrackEditorErrors {
  title?: string;
  discNumber?: string;
  trackNumber?: string;
  releaseDate?: string;
}

export function CatalogTrackEditor({
  albumTitle,
  artistName,
  isSaving,
  onCancel,
  onSubmit,
  onCreated
}: CatalogTrackEditorProps) {
  const [title, setTitle] = useState("");
  const [discNumber, setDiscNumber] = useState("1");
  const [trackNumber, setTrackNumber] = useState("");
  const [version, setVersion] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
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
    const trimmedVersion = version.trim();
    const trimmedReleaseDate = releaseDate.trim();
    const parsedDiscNumber = parsePositiveInteger(discNumber);
    const parsedTrackNumber = parsePositiveInteger(trackNumber);
    const nextErrors: CatalogTrackEditorErrors = {};

    if (trimmedTitle.length === 0) {
      nextErrors.title = "请输入歌曲名。";
    }
    if (parsedDiscNumber === undefined) {
      nextErrors.discNumber = "碟号必须是正整数。";
    }
    if (parsedTrackNumber === undefined) {
      nextErrors.trackNumber = "曲序必须是正整数。";
    }
    if (trimmedReleaseDate && !isValidCalendarDate(trimmedReleaseDate)) {
      nextErrors.releaseDate = "请输入有效日期，格式为 YYYY-MM-DD。";
    }

    setErrors(nextErrors);
    setSaveError(undefined);

    if (
      Object.keys(nextErrors).length > 0 ||
      parsedDiscNumber === undefined ||
      parsedTrackNumber === undefined
    ) {
      return;
    }

    submitInProgress.current = true;
    setIsSubmitting(true);

    try {
      const result = await onSubmit({
        title: trimmedTitle,
        discNumber: parsedDiscNumber,
        trackNumber: parsedTrackNumber,
        ...(trimmedVersion ? { version: trimmedVersion } : {}),
        ...(trimmedReleaseDate
          ? { releaseDate: trimmedReleaseDate as ISODateString }
          : {})
      });

      if (result.ok) {
        onCreated(result.trackId);
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
        <p className="eyebrow">New track</p>
        <h3 id="catalog-track-editor-heading">新增歌曲</h3>
        <p className="helper-text">歌曲会保存到当前专辑，并按碟号和曲序展示。</p>
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
          <span>碟号</span>
          <input
            name="track-disc-number"
            type="text"
            inputMode="numeric"
            value={discNumber}
            disabled={isPending}
            aria-invalid={errors.discNumber ? "true" : undefined}
            aria-describedby={
              errors.discNumber ? "catalog-track-disc-number-error" : undefined
            }
            onChange={(event) => setDiscNumber(event.currentTarget.value)}
          />
          {errors.discNumber && (
            <span
              className="catalog-editor-field-error"
              id="catalog-track-disc-number-error"
            >
              {errors.discNumber}
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

        <label className="catalog-editor-field">
          <span>版本（可选）</span>
          <input
            name="track-version"
            type="text"
            value={version}
            disabled={isPending}
            onChange={(event) => setVersion(event.currentTarget.value)}
          />
        </label>

        <label className="catalog-editor-field">
          <span>发行日期（可选）</span>
          <input
            name="track-release-date"
            type="text"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            value={releaseDate}
            disabled={isPending}
            aria-invalid={errors.releaseDate ? "true" : undefined}
            aria-describedby={
              errors.releaseDate ? "catalog-track-release-date-error" : undefined
            }
            onChange={(event) => setReleaseDate(event.currentTarget.value)}
          />
          {errors.releaseDate && (
            <span
              className="catalog-editor-field-error"
              id="catalog-track-release-date-error"
            >
              {errors.releaseDate}
            </span>
          )}
        </label>

        {saveError && (
          <p className="catalog-editor-save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="catalog-editor-actions">
          <button
            className="text-button"
            type="button"
            disabled={isPending}
            onClick={onCancel}
          >
            取消
          </button>
          <button className="secondary-button" type="submit" disabled={isPending}>
            {isPending ? "正在保存…" : "保存歌曲"}
          </button>
        </div>
      </form>
    </section>
  );
}

function parsePositiveInteger(value: string): number | undefined {
  const trimmedValue = value.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    return undefined;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  return day <= daysInMonth[month - 1];
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
