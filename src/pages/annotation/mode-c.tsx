import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Clock,
  Headphones,
  ListChecks,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import {
  completeTaskTiming,
  startTaskTiming,
  trackInteraction,
  useTaskTracking,
} from "@/lib/tracking";

type Project = {
  id: number;
  name: string;
  tasks: number;
  completed: number;
  tags?: string[];
  demo?: boolean;
  mode?: "select" | "segment" | "compare";
};

type Task = {
  id: number;
  completed: boolean;
  user: string;
  text: string;
  transcript?: string;
  tags?: string[];
};

type CompareChoice = "A" | "B" | "C";
type CompareRank = CompareChoice | "";

const COMPARE_AUDIO: { label: CompareChoice; title: string; duration: string; tone: number }[] = [
  { label: "A", title: "Audio A", duration: "00:42", tone: 220 },
  { label: "B", title: "Audio B", duration: "00:48", tone: 277 },
  { label: "C", title: "Audio C", duration: "00:54", tone: 330 },
];

const isCompareChoice = (value: string): value is CompareChoice =>
  value === "A" || value === "B" || value === "C";

const getSavedCompareRank = (task?: Task): CompareRank[] => {
  const saved = task?.tags?.filter(isCompareChoice) ?? [];
  return [saved[0] ?? "", saved[1] ?? "", saved[2] ?? ""];
};

type CompareModeProps = {
  taskId: number;
  projectId: number;
  userId: string;
  mode: "single" | "batch";
  tasks: Task[];
  project: Project;
  onBack: () => void;
  onSubmit: (
    id: number,
    transcript: string,
    tags: string[],
    options?: { preservePage?: boolean; silent?: boolean; completed?: boolean }
  ) => Promise<void> | void;
  onReviewModeChange: (mode: "single" | "batch") => void;
  onGoTo: (id: number) => void;
};

const rankLabel = (index: number) => ["1st Place", "2nd Place", "3rd Place"][index];

const CompareSingle = ({
  taskId,
  projectId,
  userId,
  tasks,
  project,
  onBack,
  onSubmit,
  onReviewModeChange,
  onGoTo,
}: CompareModeProps) => {
  const current = tasks.find((t) => t.id === taskId) ?? tasks[0];
  const currentIndex = Math.max(0, tasks.findIndex((t) => t.id === current?.id));
  const [rankings, setRankings] = useState<CompareRank[]>(getSavedCompareRank(current));
  const [playing, setPlaying] = useState<CompareChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const tracking = useTaskTracking({
    projectId,
    taskId,
    userId,
    mode: "compare",
  });
  const audioTimersRef = useRef<Record<CompareChoice, number | undefined>>({
    A: undefined,
    B: undefined,
    C: undefined,
  });

  useEffect(() => {
    setRankings(getSavedCompareRank(current));
    setPlaying(null);
    Object.values(audioTimersRef.current).forEach((timer) => {
      if (timer) window.clearTimeout(timer);
    });
    audioTimersRef.current = { A: undefined, B: undefined, C: undefined };
  }, [current?.id]);

  if (!current) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Back to project
        </button>
        <Card className="mt-8 border-border/60 p-12 text-center shadow-soft">
          <h1 className="font-display text-2xl font-bold">No compare items</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This project has no data to compare yet.
          </p>
        </Card>
      </main>
    );
  }

  const completedCount = tasks.filter((t) => t.completed).length;
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const remaining = Math.max(0, tasks.length - completedCount);
  const isComplete = rankings.every(Boolean) && new Set(rankings).size === 3;
  const sidebarStart = Math.min(
    Math.max(0, currentIndex - 2),
    Math.max(0, tasks.length - 6)
  );
  const sidebarTasks = tasks.slice(sidebarStart, sidebarStart + 6);

  const updateRanking = (place: number, value: CompareChoice) => {
    setRankings((prev) => {
      const next = prev.map((rank, idx) => (idx === place ? value : rank));
      tracking.track(prev[place] ? "change_ranking" : "rank_audio", {
        audioId: value,
        elementId: `ranking-${place + 1}`,
        elementType: "select",
        valueBefore: prev,
        valueAfter: next,
        metadata: {
          rankPosition: place + 1,
          selectedAudio: value,
        },
      });
      return next;
    });
  };

  const playPreview = (label: CompareChoice, tone: number) => {
    if (playing && playing !== label) {
      tracking.trackAudio("stop", {
        audioId: `audio-${playing}`,
        elementId: `play-audio-${playing}`,
        elementType: "button",
      });
      window.clearTimeout(audioTimersRef.current[playing]);
      audioTimersRef.current[playing] = undefined;
    }
    tracking.trackAudio("play", {
      audioId: `audio-${label}`,
      elementId: `play-audio-${label}`,
      elementType: "button",
      currentAudioTime: 0,
    });
    setPlaying(label);
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      audioTimersRef.current[label] = window.setTimeout(() => {
        tracking.trackAudio("stop", {
          audioId: `audio-${label}`,
          elementId: `play-audio-${label}`,
          elementType: "button",
          currentAudioTime: 0.7,
        });
        setPlaying(null);
      }, 700);
      return;
    }

    const audioCtx = new AudioContextCtor();
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = tone;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.65);
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.68);
    audioTimersRef.current[label] = window.setTimeout(() => {
      tracking.trackAudio("stop", {
        audioId: `audio-${label}`,
        elementId: `play-audio-${label}`,
        elementType: "button",
        currentAudioTime: 0.68,
      });
      setPlaying(null);
      audioCtx.close();
    }, 760);
  };

  const handleSubmit = async () => {
    if (!isComplete) {
      toast.error("Please rank Audio A, B, and C before submitting.");
      return;
    }

    setBusy(true);
    try {
      tracking.trackSubmit({
        rankings,
        transcript: current.text,
      });
      await onSubmit(taskId, current.text, rankings.filter(isCompareChoice), {
        completed: true,
      });
      toast.success(`Task ${currentIndex + 1} submitted`);
      const nextTask = tasks[currentIndex + 1];
      if (nextTask) {
        onGoTo(nextTask.id);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="border-b border-border/60 bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-5">
          <button
            onClick={onBack}
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Back to project"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-display text-3xl font-extrabold">Compare Mode</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Listen and rank audio files for each task in {project.name}.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-full border border-border bg-muted p-1 max-sm:ml-0">
            <button className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm">
              Review one item
            </button>
            <button
              type="button"
              onClick={() => onReviewModeChange("batch")}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Review 10 items
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="space-y-5">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tasks</h2>
            <p className="mt-1 text-xs text-muted-foreground">{tasks.length} total data items</p>
          </div>
          <div className="space-y-2">
            {sidebarTasks.map((task, index) => {
              const active = task.id === current.id;
              const taskNumber = sidebarStart + index + 1;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onGoTo(task.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-accent/40 bg-card shadow-soft"
                      : "border-transparent bg-transparent hover:border-border/70 hover:bg-card/70"
                  }`}
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-bold ${
                      active ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
                    }`}
                  >
                    {taskNumber}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">Task {taskNumber}</span>
                    <span className="block truncate text-xs text-muted-foreground">#{task.id}</span>
                  </span>
                  {task.completed && <CircleCheck className="h-4 w-4 text-green-600" />}
                </button>
              );
            })}
          </div>
          <div className="border-t border-border/60 pt-5 text-sm font-medium text-muted-foreground">
            {remaining} tasks remaining
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div>
            <h2 className="font-display text-2xl font-bold">Task {currentIndex + 1}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Listen to all audio files and rank them.
            </p>
          </div>

          {COMPARE_AUDIO.map((audio, audioIndex) => (
            <Card key={audio.label} className="border-border/60 p-5 shadow-soft">
              <div className="grid gap-4 sm:grid-cols-[72px_1fr] sm:items-center">
                <div className="grid h-14 w-14 place-items-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
                  {audio.label}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold">{audio.title}</h3>
                  <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => playPreview(audio.label, audio.tone)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card text-accent transition hover:bg-accent hover:text-accent-foreground"
                      aria-label={`Play ${audio.title}`}
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <span className="font-mono text-xs">00:00</span>
                    <div className="h-2 min-w-20 flex-1 overflow-hidden rounded-full bg-background">
                      <div
                        className={`h-full rounded-full bg-accent transition-all ${
                          playing === audio.label ? "w-9/12" : ["w-5/12", "w-7/12", "w-4/12"][audioIndex]
                        }`}
                      />
                    </div>
                    <span className="font-mono text-xs">{audio.duration}</span>
                    <Headphones className="hidden h-4 w-4 sm:block" />
                  </div>
                </div>
              </div>
            </Card>
          ))}

          <Card className="border-border/60 p-5 shadow-soft">
            <h2 className="font-display text-xl font-bold">Rank Your Preferences</h2>
            <div className="mt-5 space-y-3">
              {[0, 1, 2].map((place) => (
                <div key={place} className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
                  <Label className="font-semibold">{rankLabel(place)}:</Label>
                  <Select
                    value={rankings[place]}
                    onValueChange={(value) => updateRanking(place, value as CompareChoice)}
                  >
                    <SelectTrigger className="h-11 rounded-lg bg-muted/60">
                      <SelectValue placeholder="Select audio" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPARE_AUDIO.map((audio) => (
                        <SelectItem key={audio.label} value={audio.label}>
                          {audio.label} - {audio.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={busy || currentIndex === 0}
                onClick={() => {
                  const previousTask = tasks[currentIndex - 1];
                  if (previousTask) onGoTo(previousTask.id);
                }}
                className="h-11 rounded-lg sm:w-44"
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={busy || !isComplete}
                className="h-11 flex-1 rounded-lg bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
              >
                {busy ? "Submitting..." : `Submit Task ${currentIndex + 1}`}
              </Button>
            </div>
          </Card>
        </section>

        <aside className="space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Status</h2>
          <Card className="border-border/60 p-5 shadow-soft">
            <p className="text-sm font-medium text-muted-foreground">Current Task</p>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                {currentIndex + 1}
              </span>
              <span className="font-semibold">Task {currentIndex + 1}</span>
            </div>
          </Card>
          <Card className="border-border/60 p-5 shadow-soft">
            <p className="text-sm font-medium text-muted-foreground">Current Rankings</p>
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((place) => (
                <div key={place} className="flex items-center justify-between gap-3 text-sm">
                  <span>{rankLabel(place)}</span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      rankings[place] ? "text-green-600" : "text-muted-foreground"
                    }`}
                  >
                    {rankings[place] ? <CircleCheck className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    {rankings[place] || "-"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="border-border/60 p-5 shadow-soft">
            <p className="text-sm font-medium text-muted-foreground">Overall Progress</p>
            <div className="mt-4 flex items-center gap-3">
              <Progress value={progress} className="h-2 flex-1" />
              <span className="text-sm font-semibold">
                {completedCount}/{tasks.length}
              </span>
            </div>
          </Card>
          <div className="rounded-xl border border-accent/25 bg-accent-soft p-5 text-sm font-medium text-accent">
            <ListChecks className="mb-3 h-5 w-5" />
            Listen to all audio files carefully before making your ranking decision.
          </div>
        </aside>
      </div>
    </main>
  );
};

const CompareBatch = ({
  projectId,
  userId,
  tasks,
  project,
  onBack,
  onSubmit,
  onReviewModeChange,
}: CompareModeProps) => {
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(0);
  const [batchRankings, setBatchRankings] = useState<Record<number, CompareRank[]>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const totalItems = tasks.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const pageItems = tasks.slice(
    safeCurrentPage * PAGE_SIZE,
    (safeCurrentPage + 1) * PAGE_SIZE
  );
  const completedCount = tasks.filter((t) => t.completed).length;

  const getTaskRankings = (task: Task) => batchRankings[task.id] ?? getSavedCompareRank(task);
  const isTaskComplete = (ranking: CompareRank[]) =>
    ranking.every(Boolean) && new Set(ranking).size === 3;

  useEffect(() => {
    pageItems.forEach((task) =>
      startTaskTiming({ projectId, taskId: task.id, userId, mode: "compare" })
    );
  }, [pageItems, projectId, userId]);

  const updateRanking = (task: Task, place: number, value: CompareChoice) => {
    setBatchRankings((prev) => {
      const currentRankings = prev[task.id] ?? getSavedCompareRank(task);
      const next = currentRankings.map((rank, idx) => (idx === place ? value : rank));
      trackInteraction(
        { projectId, taskId: task.id, userId, mode: "compare" },
        {
          eventType: currentRankings[place] ? "change_ranking" : "rank_audio",
          audioId: value,
          elementId: `compare-batch-ranking-${place + 1}`,
          elementType: "select",
          valueBefore: currentRankings,
          valueAfter: next,
          metadata: {
            rankPosition: place + 1,
            selectedAudio: value,
          },
        }
      );
      return { ...prev, [task.id]: next };
    });
  };

  const playPreview = (task: Task, audio: (typeof COMPARE_AUDIO)[number]) => {
    const audioId = `compare-batch-audio-${task.id}-${audio.label}`;
    trackInteraction(
      { projectId, taskId: task.id, userId, mode: "compare" },
      {
        eventType: "play",
        audioId,
        elementId: "compare-batch-play",
        elementType: "button",
        currentAudioTime: 0,
        playCount: 1,
      }
    );
    setPlaying(audioId);
    window.setTimeout(() => setPlaying((current) => (current === audioId ? null : current)), 700);
  };

  const savePageChanges = async () => {
    await Promise.all(
      pageItems.map((task) => {
        const rankings = getTaskRankings(task);
        return onSubmit(task.id, task.text, rankings.filter(isCompareChoice), {
          preservePage: true,
          silent: true,
          completed: isTaskComplete(rankings),
        });
      })
    );
  };

  const handleBatchSubmit = async () => {
    setBusy(true);
    try {
      const results = await Promise.all(
        tasks.map((task) => {
          const rankings = getTaskRankings(task);
          const shouldMarkDone = isTaskComplete(rankings);
          const timing = completeTaskTiming({
            projectId,
            taskId: task.id,
            userId,
            mode: "compare",
          });
          trackInteraction(
            { projectId, taskId: task.id, userId, mode: "compare" },
            {
              eventType: "submit",
              elementId: "compare-batch-submit",
              elementType: "button",
              metadata: {
                rankings,
                transcript: task.text,
                startedAt: timing.startedAt,
                submittedAt: timing.submittedAt,
                durationSeconds: timing.durationSeconds,
              },
            }
          );
          return Promise.resolve(
            onSubmit(task.id, task.text, rankings.filter(isCompareChoice), {
              preservePage: true,
              silent: true,
              completed: shouldMarkDone,
            })
          ).then(() => shouldMarkDone);
        })
      );
      const missingCount = results.filter((done) => !done).length;
      if (missingCount > 0) {
        toast.warning("Some compare items are missing complete rankings.");
      } else {
        toast.success("All compare items saved and marked as Done.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Back to project
        </button>
        <p className="text-sm text-muted-foreground">
          Page {safeCurrentPage + 1} of {totalPages} · {completedCount} completed
        </p>
        <div className="flex w-fit items-center gap-1 rounded-full border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => onReviewModeChange("single")}
            className="rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Review one item
          </button>
          <button className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm">
            Review 10 items
          </button>
        </div>
      </div>

      {totalItems === 0 ? (
        <Card className="border-border/60 p-12 text-center shadow-soft">
          <h3 className="font-display text-lg font-bold">No compare items</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This project has no data to compare yet.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <h3 className="font-display text-lg font-bold">Review 10 compare items</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Rank Audio A, B, and C for each task in {project.name}.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
            <div className="min-w-[1100px]">
              <div className="grid grid-cols-[110px_minmax(420px,1.25fr)_minmax(360px,0.85fr)_90px] gap-4 border-b border-border/60 bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
                <div>ID</div>
                <div>Audio</div>
                <div>Rankings</div>
                <div>Status</div>
              </div>

              {pageItems.map((task, idx) => {
                const rankings = getTaskRankings(task);
                const complete = isTaskComplete(rankings);
                const itemNumber = safeCurrentPage * PAGE_SIZE + idx + 1;

                return (
                  <div
                    key={task.id}
                    className="grid grid-cols-[110px_minmax(420px,1.25fr)_minmax(360px,0.85fr)_90px] items-center gap-4 border-b border-border/60 px-4 py-3"
                  >
                    <div>
                      <div className="font-mono text-xs">#{task.id}</div>
                      <div className="text-xs text-muted-foreground">
                        Item {itemNumber}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {COMPARE_AUDIO.map((audio) => {
                        const audioId = `compare-batch-audio-${task.id}-${audio.label}`;
                        return (
                          <button
                            key={audio.label}
                            type="button"
                            onClick={() => playPreview(task, audio)}
                            className={`flex h-24 flex-col items-stretch justify-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
                              playing === audioId
                                ? "border-accent bg-accent-soft text-accent"
                                : "border-border bg-muted/30 hover:bg-muted"
                            }`}
                            aria-label={`Play ${audio.title}`}
                          >
                            <span className="flex items-center gap-2 text-base font-semibold">
                              <span className="grid h-8 w-8 place-items-center rounded-full border border-border bg-white">
                                <Play className="h-4 w-4" />
                              </span>
                              Audio {audio.label}
                            </span>
                            <span className="flex h-8 items-center gap-1 overflow-hidden rounded-lg bg-white/70 px-2">
                              {Array.from({ length: 28 }).map((_, barIndex) => (
                                <span
                                  key={barIndex}
                                  className="w-1 rounded-full bg-amber-400"
                                  style={{
                                    height: `${10 + ((barIndex * (audio.label.charCodeAt(0) + 3)) % 18)}px`,
                                    opacity: barIndex < 17 ? 1 : 0.35,
                                  }}
                                />
                              ))}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              0:00 / {audio.duration}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid gap-2 md:grid-cols-3">
                      {[0, 1, 2].map((place) => (
                        <Select
                          key={place}
                          value={rankings[place]}
                          onValueChange={(value) =>
                            updateRanking(task, place, value as CompareChoice)
                          }
                        >
                          <SelectTrigger className="h-9 rounded-lg bg-muted/60 px-2 text-sm">
                            <SelectValue placeholder={rankLabel(place)} />
                          </SelectTrigger>
                          <SelectContent>
                            {COMPARE_AUDIO.map((audio) => (
                              <SelectItem key={audio.label} value={audio.label}>
                                {audio.label} - {rankLabel(place)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ))}
                    </div>

                    <div className="text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                          complete
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {complete ? <Check className="h-3 w-3" /> : null}
                        {complete ? "Done" : "Pending"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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
              <ArrowLeft className="mr-1 h-4 w-4" /> Previous page
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
                Next page <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                className="ml-auto rounded-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
                onClick={handleBatchSubmit}
                disabled={busy || pageItems.length === 0}
              >
                {busy ? "Saving..." : "Submit"} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  );
};

const CompareMode = (props: CompareModeProps) =>
  props.mode === "single" ? <CompareSingle {...props} /> : <CompareBatch {...props} />;

export default CompareMode;
