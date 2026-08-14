import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

import type { LocalAudioTrackId } from "../../types/localAudioBinding";
import type { DesktopAudioCandidatePreview } from "./desktopAudioCandidatePreview";
import {
  searchDesktopCatalogTracks,
  type DesktopCatalogTrackOption
} from "./desktopAudioBindingUi";
import type { LocalAudioBindingSummary } from "./localAudioBindingService";

const MAX_VISIBLE_TRACKS = 80;

export interface DesktopBindingDialogSession {
  readonly mode: "select" | "unbind";
  readonly returnFocusTo: HTMLButtonElement;
}

interface DesktopAudioBindingDialogProps {
  readonly session: DesktopBindingDialogSession;
  readonly candidate: DesktopAudioCandidatePreview;
  readonly currentCandidateBinding?: LocalAudioBindingSummary;
  readonly tracks: readonly DesktopCatalogTrackOption[];
  readonly bindingByTrackId: ReadonlyMap<LocalAudioTrackId, LocalAudioBindingSummary>;
  readonly isSubmitting: boolean;
  readonly onBind: (
    track: DesktopCatalogTrackOption,
    expectedTargetBinding: LocalAudioBindingSummary | undefined
  ) => void;
  readonly onUnbind: (binding: LocalAudioBindingSummary) => void;
  readonly onClose: () => void;
}

export function DesktopAudioBindingDialog({
  session,
  candidate,
  currentCandidateBinding,
  tracks,
  bindingByTrackId,
  isSubmitting,
  onBind,
  onUnbind,
  onClose
}: DesktopAudioBindingDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState<LocalAudioTrackId>();
  const [phase, setPhase] = useState<"select" | "replace" | "unbind">(
    session.mode === "unbind" ? "unbind" : "select"
  );
  const dialogRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const confirmationButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const radioName = useId();

  const matchingTracks = useMemo(
    () => searchDesktopCatalogTracks(tracks, query),
    [query, tracks]
  );
  const visibleTracks = matchingTracks.slice(0, MAX_VISIBLE_TRACKS);
  const selectedTrack = tracks.find((track) => track.trackId === selectedTrackId);
  const selectedTrackBinding = selectedTrack
    ? bindingByTrackId.get(selectedTrack.trackId)
    : undefined;

  useEffect(() => {
    const returnFocusTo = session.returnFocusTo;

    return () => returnFocusTo.focus();
  }, [session.returnFocusTo]);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      if (phase === "select") {
        searchInputRef.current?.focus();
      } else {
        confirmationButtonRef.current?.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [phase]);

  function closeDialog() {
    if (!isSubmitting) {
      onClose();
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();

      if (isSubmitting) {
        return;
      }
      if (phase === "replace") {
        setPhase("select");
      } else {
        onClose();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);

    if (!firstElement || !lastElement) {
      event.preventDefault();
      return;
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  function submitSelectedTrack() {
    if (!selectedTrack || isSubmitting) {
      return;
    }

    if (selectedTrackBinding) {
      setPhase("replace");
      return;
    }

    onBind(selectedTrack, undefined);
  }

  const title =
    phase === "select"
      ? currentCandidateBinding
        ? "更换绑定曲目"
        : "选择绑定曲目"
      : phase === "replace"
        ? "确认替换绑定"
        : "确认解除绑定";

  return (
    <div
      className="desktop-binding-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeDialog();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="desktop-binding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="desktop-binding-dialog-heading">
          <div>
            <p className="eyebrow">本地音频绑定</p>
            <h3 id={titleId}>{title}</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={`关闭${title}`}
            title="关闭"
            disabled={isSubmitting}
            onClick={closeDialog}
          >
            ×
          </button>
        </div>

        {phase === "select" ? (
          <div className="desktop-binding-dialog-body">
            <p className="desktop-binding-candidate-name">
              为 <strong>{candidate.fileName}</strong> 选择现有曲目
            </p>
            <label className="desktop-track-search-field">
              搜索曲名、歌手或专辑
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                disabled={isSubmitting}
                autoComplete="off"
                placeholder="输入曲名、歌手或专辑"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedTrackId(undefined);
                }}
              />
            </label>

            {matchingTracks.length === 0 ? (
              <p className="desktop-track-search-empty" role="status">
                没有找到匹配的现有曲目。可以调整搜索词，但不能在这里新建曲目。
              </p>
            ) : (
              <>
                <div
                  className="desktop-track-search-results"
                  role="radiogroup"
                  aria-label="现有曲目搜索结果"
                >
                  {visibleTracks.map((track) => {
                    const trackBinding = bindingByTrackId.get(track.trackId);
                    const isCurrentTrack =
                      currentCandidateBinding?.trackId === track.trackId;

                    return (
                      <label
                        className={`desktop-track-search-option${
                          isCurrentTrack ? " is-current" : ""
                        }`}
                        key={track.trackId}
                      >
                        <input
                          type="radio"
                          name={radioName}
                          checked={selectedTrackId === track.trackId}
                          disabled={isSubmitting || isCurrentTrack}
                          onChange={() => setSelectedTrackId(track.trackId)}
                        />
                        <span>
                          <strong>{track.title}</strong>
                          <small>
                            {track.artistName} · {track.albumTitle}
                          </small>
                          <small>
                            {isCurrentTrack
                              ? "当前绑定曲目"
                              : trackBinding
                                ? "已有本地音频绑定，选择后需要确认替换"
                                : "尚未绑定本地音频"}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="desktop-track-search-count" aria-live="polite">
                  {matchingTracks.length > MAX_VISIBLE_TRACKS
                    ? `找到 ${matchingTracks.length} 首曲目，当前显示前 ${MAX_VISIBLE_TRACKS} 首，请继续输入以缩小范围。`
                    : `找到 ${matchingTracks.length} 首曲目。`}
                </p>
              </>
            )}

            <div className="desktop-binding-dialog-actions">
              <button
                type="button"
                className="text-button"
                disabled={isSubmitting}
                onClick={closeDialog}
              >
                取消
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!selectedTrack || isSubmitting}
                onClick={submitSelectedTrack}
              >
                {selectedTrackBinding ? "替换绑定…" : "确认绑定"}
              </button>
            </div>
          </div>
        ) : null}

        {phase === "replace" && selectedTrack && selectedTrackBinding ? (
          <div className="desktop-binding-dialog-body">
            <p>
              <strong>{selectedTrack.title}</strong> 已有本地音频绑定。继续后，
              该曲目的现有绑定会替换为 <strong>{candidate.fileName}</strong>。
            </p>
            <p className="helper-text">
              此操作只修改应用内的绑定关系，不会删除磁盘上的任何文件。
              {currentCandidateBinding ? " 当前曲目的旧绑定将在新绑定成功后解除。" : ""}
            </p>
            <div className="desktop-binding-dialog-actions">
              <button
                type="button"
                className="text-button"
                disabled={isSubmitting}
                onClick={() => setPhase("select")}
              >
                取消替换
              </button>
              <button
                ref={confirmationButtonRef}
                type="button"
                className="secondary-button danger-button"
                disabled={isSubmitting}
                onClick={() => onBind(selectedTrack, selectedTrackBinding)}
              >
                {isSubmitting ? "正在替换…" : "确认替换绑定"}
              </button>
            </div>
          </div>
        ) : null}

        {phase === "unbind" && currentCandidateBinding ? (
          <div className="desktop-binding-dialog-body">
            <p>
              确定解除 <strong>{candidate.fileName}</strong> 与当前曲目的绑定吗？
            </p>
            <p className="helper-text">
              解除绑定只会移除应用内的关联，不会删除磁盘文件、歌曲、专辑或歌单。
            </p>
            <div className="desktop-binding-dialog-actions">
              <button
                type="button"
                className="text-button"
                disabled={isSubmitting}
                onClick={closeDialog}
              >
                取消解绑
              </button>
              <button
                ref={confirmationButtonRef}
                type="button"
                className="secondary-button danger-button"
                disabled={isSubmitting}
                onClick={() => onUnbind(currentCandidateBinding)}
              >
                {isSubmitting ? "正在解绑…" : "确认解除绑定"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), [href], select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"
    )
  ).filter((element) => !element.hasAttribute("hidden"));
}
