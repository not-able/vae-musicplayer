import { useRef, useState, type FormEvent } from "react";

import type { AlbumType, ISODateString } from "../../types";
import type {
  CatalogAlbumCreationResult,
  CatalogAlbumDraft
} from "./useCatalogLibrary";

interface CatalogEditorProps {
  artistName: string;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (draft: CatalogAlbumDraft) => Promise<CatalogAlbumCreationResult>;
  onCreated: (albumId: string) => void;
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
