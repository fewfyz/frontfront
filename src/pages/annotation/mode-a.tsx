// src/pages/annotation/mode-a.tsx
// โหมด A — Simple Transcription (select mode จากโค้ดเก่า)
// ใช้ layout 3 คอลัมน์: sidebar tasks | transcription + tags | region details

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  CircleCheck,
  FileText,
  Tags,
} from "lucide-react";
import { toast } from "sonner";
import {
  completeTaskTiming,
  startTaskTiming,
  trackInteraction,
  useTaskTracking,
} from "@/lib/tracking";
import type { Project, Task } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ModeAProps {
  taskId: number;
  projectId: number;
  userId: string;
  tasks: Task[];
  projects: Project[];
  tasksByProject: Record<number, Task[]>;
  onBack: () => void;
  onSubmit: (
    id: number,
    transcript: string,
    tags: string[],
    options?: { preservePage?: boolean; silent?: boolean; completed?: boolean }
  ) => Promise<void> | void;
  onGoTo: (id: number) => void;
}

// ─── Single Item View ─────────────────────────────────────────────────────────
const ModeASingle: React.FC<ModeAProps> = ({
  taskId,
  projectId,
  userId,
  tasks,
  projects,
  tasksByProject,
  onBack,
  onSubmit,
  onGoTo,
}) => {
  const { t } = useTranslation("common");
  const currentProject = projects.find((p) => p.id === projectId);
  const projectTasks = tasksByProject[projectId] ?? tasks;
  const current = projectTasks.find((t) => t.id === taskId);
  const currentIndex = projectTasks.findIndex((t) => t.id === taskId);
  const sidebarStart = Math.max(0, currentIndex - 2);
  const sidebar = projectTasks.slice(sidebarStart, sidebarStart + 6);
  const completedCount = projectTasks.filter((t) => t.completed).length;
  const taskPosition = currentIndex >= 0 ? currentIndex + 1 : 0;

  const TAG_OPTIONS =
    currentProject?.tags && currentProject.tags.length > 0
      ? currentProject.tags
      : useMemo(
          () => [
            t("tags.multipleSpeakers"),
            t("tags.inaudible"),
            t("tags.backgroundNoise"),
          ],
          [t]
        );

  const [transcript, setTranscript] = useState(
    current?.transcript ?? current?.text ?? ""
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(current?.tags ?? []);
  const [busy, setBusy] = useState(false);
  const hasTranscript = transcript.trim().length > 0;
  const isReady = selectedTags.length > 0;
  const tracking = useTaskTracking({
    projectId,
    taskId,
    userId,
    mode: "select",
  });
  const transcriptBeforeRef = useRef(transcript);

  useEffect(() => {
    setTranscript(current?.transcript ?? current?.text ?? "");
    setSelectedTags(current?.tags ?? []);
    transcriptBeforeRef.current = current?.transcript ?? current?.text ?? "";
  }, [taskId]);

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) => {
      const next = prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag];
      tracking.track(prev.length === 0 ? "select_option" : "change_answer", {
        elementId: `tag-${tag}`,
        elementType: "tag_option",
        valueBefore: prev,
        valueAfter: next,
        metadata: {
          selectedTag: tag,
          secondsBeforeSelection:
            (Date.now() -
              new Date(startTaskTiming({ projectId, taskId, userId, mode: "select" })).getTime()) /
            1000,
        },
      });
      return next;
    });

  const handleSubmit = async () => {
    setBusy(true);
    try {
      tracking.trackSubmit({
        selectedTags,
        transcriptLength: transcript.trim().length,
      });
      await onSubmit(taskId, transcript, selectedTags, {
        completed: selectedTags.length > 0,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> {t("annotation.backToProject")}
        </button>
        <p className="text-sm text-muted-foreground">
          {t("annotation.projectsLabeling")} ·{" "}
          <span className="font-mono text-foreground">#{taskId}</span>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr_300px]">
        {/* ── Sidebar: task list ── */}
        <Card className="border-border/60 p-5 shadow-soft">
          <h4 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            {t("annotation.tasks")}
          </h4>
          <div className="mt-4 space-y-2">
            {sidebar.map((t) => (
              <div
                key={t.id}
                onClick={() => onGoTo(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onGoTo(t.id);
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition hover:border-accent/40 ${
                  t.id === taskId
                    ? "border-accent/40 bg-accent-soft"
                    : t.completed
                    ? "border-border/60 bg-muted/40 opacity-60"
                    : "border-border/60 bg-card"
                }`}
              >
                <span className="font-mono text-xs text-muted-foreground">
                  #{t.id}
                </span>
                <span className="truncate">{t.text}</span>
                {t.completed && (
                  <Badge
                    variant="outline"
                    className="ml-auto border-accent/30 bg-accent-soft text-accent"
                  >
                    Done
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* ── Center: waveform placeholder + transcript + tags ── */}
        <Card className="border-border/60 p-6 shadow-soft">
          {/* Fake waveform */}
          <div className="relative h-24 overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/70">
            <svg
              viewBox="0 0 400 80"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full opacity-80"
            >
              {Array.from({ length: 60 }).map((_, i) => {
                const h = 10 + Math.abs(Math.sin(i * 0.6)) * 60;
                return (
                  <rect
                    key={i}
                    x={i * 7}
                    y={(80 - h) / 2}
                    width={3}
                    height={h}
                    fill="hsl(var(--accent))"
                    rx={1.5}
                  />
                );
              })}
            </svg>
          </div>

          {/* Transcription */}
          <h3 className="mt-6 font-display text-lg font-bold">{t("annotation.transcription")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("annotation.transcriptionHint")}
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onBlur={() => {
              if (transcriptBeforeRef.current === transcript) return;
              tracking.track("change_answer", {
                elementId: "transcript",
                elementType: "textarea",
                valueBefore: transcriptBeforeRef.current,
                valueAfter: transcript,
              });
              transcriptBeforeRef.current = transcript;
            }}
            className="mt-3 min-h-24 w-full resize-none rounded-xl border border-border bg-background p-4 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />

          {/* Tags */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold">{t("annotation.tagAnyThatApply")}</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("annotation.selectTagsForTask")}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TAG_OPTIONS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={isSelected}
                    className={`flex h-12 w-full items-center gap-3 rounded-xl border px-4 text-left text-sm font-medium transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-white text-foreground hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40 bg-white"
                      }`}
                    >
                      {isSelected ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-6 flex justify-between gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              disabled={busy || currentIndex === 0}
              onClick={() => {
                const prev = projectTasks[currentIndex - 1];
                if (prev) onGoTo(prev.id);
              }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> {t("buttons.previous")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={busy}
              className="rounded-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
            >
              {busy ? t("buttons.saving") : t("buttons.submit")}{" "}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* ── Right panel: task status ── */}
        <Card className="border-border/60 p-5 shadow-soft">
          <h4 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            {t("annotation.status")}
          </h4>

          <div className="mt-5 rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <span
                className={`grid h-10 w-10 place-items-center rounded-full ${
                  current?.completed
                    ? "bg-green-50 text-green-700"
                    : isReady
                    ? "bg-amber-50 text-amber-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {current?.completed || isReady ? (
                  <CircleCheck className="h-5 w-5" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {current?.completed
                    ? t("status.done")
                    : isReady
                    ? t("status.ready")
                    : t("status.pending")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("annotation.taskProgress", {
                    current: taskPosition,
                    total: projectTasks.length,
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-0">
            {[
              {
                label: t("annotation.taskId"),
                value: `#${taskId}`,
              },
              {
                label: t("annotation.projectProgress"),
                value: `${completedCount}/${projectTasks.length}`,
              },
              {
                label: t("annotation.selectedTags"),
                value: selectedTags.length.toString(),
              },
              {
                label: t("annotation.transcription"),
                value: hasTranscript ? t("annotation.transcriptFilled") : t("annotation.transcriptEmpty"),
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between border-b border-border/40 py-3 text-sm"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {hasTranscript ? t("annotation.transcriptReady") : t("annotation.transcriptMissing")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {hasTranscript
                    ? `${transcript.trim().length} characters`
                    : t("annotation.addTextBeforeReview")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3">
              <Tags className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {selectedTags.length > 0
                    ? `${selectedTags.length} ${t("annotation.selectedTags")}`
                    : t("annotation.noTagsSelected")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selectedTags.length > 0
                    ? selectedTags.join(", ")
                    : t("annotation.selectAtLeastOneTag")}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
};

// ─── Batch View (10 items) ────────────────────────────────────────────────────
interface ModeABatchProps {
  projectId: number;
  userId: string;
  tasks: Task[];
  projects: Project[];
  tasksByProject: Record<number, Task[]>;
  onBack: () => void;
  onSubmit: (
    id: number,
    transcript: string,
    tags: string[],
    options?: { preservePage?: boolean; silent?: boolean; completed?: boolean }
  ) => Promise<void> | void;
}

const ModeABatch: React.FC<ModeABatchProps> = ({
  projectId,
  userId,
  tasks,
  projects,
  tasksByProject,
  onBack,
  onSubmit,
}) => {
  const { t } = useTranslation("common");
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(0);
  const [batchDrafts, setBatchDrafts] = useState<
    Record<number, { transcript: string; selectedTags: string[] }>
  >({});
  const [busy, setBusy] = useState(false);

  const currentProject = projects.find((p) => p.id === projectId);
  const projectTasks = tasksByProject[projectId] ?? tasks;
  const allItems = useMemo(() => projectTasks, [projectTasks]);
  const totalItems = allItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const completedCount = projectTasks.filter((t) => t.completed).length;
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const pageItems = allItems.slice(
    safeCurrentPage * PAGE_SIZE,
    (safeCurrentPage + 1) * PAGE_SIZE
  );

  const TAG_OPTIONS =
    currentProject?.tags && currentProject.tags.length > 0
      ? currentProject.tags
      : ["Multiple speakers", "Inaudible", "Background noise"];

  const getItemDraft = (taskId: number) => {
    if (batchDrafts[taskId]) return batchDrafts[taskId];
    const task = projectTasks.find((t) => t.id === taskId);
    return {
      transcript: task?.transcript ?? task?.text ?? "",
      selectedTags: task?.tags ?? [],
    };
  };

  const updateItemTranscript = (taskId: number, transcript: string) => {
    const draft = getItemDraft(taskId);
    trackInteraction(
      { projectId, taskId, userId, mode: "select" },
      {
        eventType: "change_answer",
        elementId: "batch-transcript",
        elementType: "input",
        valueBefore: draft.transcript,
        valueAfter: transcript,
      }
    );
    setBatchDrafts((prev) => ({
      ...prev,
      [taskId]: { ...draft, transcript },
    }));
  };

  const updateItemTags = (taskId: number, tag: string) => {
    setBatchDrafts((prev) => {
      const draft = getItemDraft(taskId);
      const nextTags = draft.selectedTags.includes(tag)
        ? draft.selectedTags.filter((t) => t !== tag)
        : [...draft.selectedTags, tag];
      trackInteraction(
        { projectId, taskId, userId, mode: "select" },
        {
          eventType: draft.selectedTags.length === 0 ? "select_option" : "change_answer",
          elementId: `batch-tag-${tag}`,
          elementType: "tag_option",
          valueBefore: draft.selectedTags,
          valueAfter: nextTags,
          metadata: { selectedTag: tag },
        }
      );
      return {
        ...prev,
        [taskId]: {
          ...draft,
          selectedTags: nextTags,
        },
      };
    });
  };

  useEffect(() => {
    pageItems.forEach((task) =>
      startTaskTiming({ projectId, taskId: task.id, userId, mode: "select" })
    );
  }, [pageItems, projectId, userId]);

  const savePageChanges = async () => {
    await Promise.all(
      pageItems.map((task) => {
        const draft = getItemDraft(task.id);
        return onSubmit(task.id, draft.transcript, draft.selectedTags, {
          preservePage: true,
          silent: true,
        });
      })
    );
  };

  const handleBatchSubmit = async () => {
    setBusy(true);
    try {
      const results = await Promise.all(
        allItems.map((task) => {
          const draft = getItemDraft(task.id);
          const shouldMarkDone = draft.selectedTags.length > 0;
          const timing = completeTaskTiming({
            projectId,
            taskId: task.id,
            userId,
            mode: "select",
          });
          trackInteraction(
            { projectId, taskId: task.id, userId, mode: "select" },
            {
              eventType: "submit",
              elementId: "batch-submit",
              elementType: "button",
              metadata: {
                selectedTags: draft.selectedTags,
                transcriptLength: draft.transcript.trim().length,
                startedAt: timing.startedAt,
                submittedAt: timing.submittedAt,
                durationSeconds: timing.durationSeconds,
              },
            }
          );
          return Promise.resolve(
            onSubmit(task.id, draft.transcript, draft.selectedTags, {
              preservePage: true,
              silent: true,
              completed: shouldMarkDone,
            })
          ).then(() => shouldMarkDone);
        })
      );
      const missingCount = results.filter((done) => !done).length;
      if (missingCount > 0) {
        toast.warning(t("toast.batchMissingTags"));
      } else {
        toast.success(t("toast.batchSavedDone"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> {t("annotation.backToProject")}
        </button>
        <p className="text-sm text-muted-foreground">
          {t("compare.pageInfo", {
            page: safeCurrentPage + 1,
            total: totalPages,
          })} · {completedCount} {t("compare.completed")}
        </p>
      </div>

      {totalItems === 0 ? (
        <Card className="border-border/60 p-12 shadow-soft text-center">
          <h3 className="font-display text-lg font-bold">{t("annotation.noItemsYet")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("annotation.noReviewItems")}
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <h3 className="font-display text-lg font-bold">
              {t("annotation.review10ItemsTitle")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("annotation.review10ItemsDescription")}
            </p>
          </div>

          {/* Batch table */}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-white">
            {/* Header */}
            <div className="grid grid-cols-[80px_100px_minmax(200px,1fr)_minmax(300px,1.3fr)_80px] gap-3 border-b border-border/60 bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
              <div>{t("compare.table.id")}</div>
              <div>{t("compare.table.audio")}</div>
              <div>{t("compare.table.transcript")}</div>
              <div>{t("compare.table.tags")}</div>
              <div>{t("compare.table.status")}</div>
            </div>

            {/* Rows */}
            {pageItems.map((task, idx) => {
              const isDone = task.completed;
              const draft = getItemDraft(task.id);
              const itemNumber = safeCurrentPage * PAGE_SIZE + idx + 1;

              return (
                <div
                  key={task.id}
                  className="grid grid-cols-[80px_100px_minmax(200px,1fr)_minmax(300px,1.3fr)_80px] items-center gap-3 border-b border-border/60 px-4 py-3"
                >
                  {/* ID */}
                  <div>
                    <div className="font-mono text-xs">#{task.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("annotation.item", { number: itemNumber })}
                    </div>
                  </div>

                  {/* Audio (static placeholder) */}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={isDone}
                      onClick={() =>
                        trackInteraction(
                          { projectId, taskId: task.id, userId, mode: "select" },
                          {
                            eventType: "play",
                            audioId: `select-batch-audio-${task.id}`,
                            elementId: "select-batch-play",
                            elementType: "button",
                            playCount: 1,
                            currentAudioTime: 0,
                          }
                        )
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={t("annotation.playAudioLabel")}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-amber-100">
                        <div className="h-full w-7/12 rounded-full bg-amber-500" />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>0:00 / 0:45</span>
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700">
                          1x
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transcript */}
                  <div>
                    <input
                      type="text"
                      value={draft.transcript}
                      onChange={(e) =>
                        updateItemTranscript(task.id, e.target.value)
                      }
                      placeholder={t("annotation.editTranscriptPlaceholder")}
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    {TAG_OPTIONS.map((tag) => {
                      const isSelected = draft.selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => updateItemTags(task.id, tag)}
                          title={tag}
                          className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-white text-foreground hover:bg-muted"
                          }`}
                        >
                          <span
                            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] ${
                              isSelected
                                ? "border border-primary bg-primary"
                                : "border border-muted-foreground/40"
                            }`}
                          >
                            {isSelected ? (
                              <Check className="h-2 w-2 text-white" />
                            ) : null}
                          </span>
                          <span className="max-w-[100px] truncate text-xs">
                            {tag}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Status */}
                  <div className="text-center">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                        isDone
                          ? "bg-green-50 text-green-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {isDone ? t("status.done") : t("status.pending")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center">
            <Button
              variant="outline"
              className="rounded-full"
              disabled={busy || safeCurrentPage === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  await savePageChanges();
                  setCurrentPage(Math.max(0, safeCurrentPage - 1));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> {t("buttons.previousPage")}
            </Button>

            {safeCurrentPage + 1 < totalPages ? (
              <Button
                variant="outline"
                className="ml-auto rounded-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await savePageChanges();
                    setCurrentPage(safeCurrentPage + 1);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("buttons.nextPage")} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              ) : (
              <Button
                className="ml-auto rounded-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
                onClick={handleBatchSubmit}
                disabled={busy || pageItems.length === 0}
              >
                {busy ? t("buttons.saving") : t("buttons.submit")}{" "}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  );
};

// ─── Mode A Entry Point ───────────────────────────────────────────────────────
interface ModeAPageProps {
  taskId: number;
  projectId: number;
  userId: string;
  mode: "single" | "batch";
  tasks: Task[];
  projects: Project[];
  tasksByProject: Record<number, Task[]>;
  onBack: () => void;
  onSubmit: (
    id: number,
    transcript: string,
    tags: string[],
    options?: { preservePage?: boolean; silent?: boolean; completed?: boolean }
  ) => Promise<void> | void;
  onGoTo: (id: number) => void;
}

const ModeAPage: React.FC<ModeAPageProps> = (props) =>
  props.mode === "single" ? (
    <ModeASingle {...props} />
  ) : (
    <ModeABatch
      projectId={props.projectId}
      userId={props.userId}
      tasks={props.tasks}
      projects={props.projects}
      tasksByProject={props.tasksByProject}
      onBack={props.onBack}
      onSubmit={props.onSubmit}
    />
  );

export default ModeAPage;
