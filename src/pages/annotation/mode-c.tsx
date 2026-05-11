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
  CircleCheck,
  Clock,
  Headphones,
  ListChecks,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { useTaskTracking } from "@/lib/tracking";

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
  tasks: Task[];
  project: Project;
  onBack: () => void;
  onSubmit: (
    id: number,
    transcript: string,
    tags: string[],
    options?: { preservePage?: boolean; silent?: boolean; completed?: boolean }
  ) => Promise<void> | void;
  onGoTo: (id: number) => void;
};

const CompareMode = ({
  taskId,
  projectId,
  userId,
  tasks,
  project,
  onBack,
  onSubmit,
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

  const rankLabel = (index: number) => ["1st Place", "2nd Place", "3rd Place"][index];

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="border-b border-border/60 bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-5">
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

export default CompareMode;
