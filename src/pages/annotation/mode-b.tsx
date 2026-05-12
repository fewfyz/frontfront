// src/pages/annotation/mode-b.tsx
// โหมด B — Region Annotation + Batch Review

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Pause,
  Play,
  Plus,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  completeTaskTiming,
  startTaskTiming,
  trackInteraction,
  useTaskTracking,
} from "@/lib/tracking";
import { REGION_COLORS, REGION_SOLID } from "@/types";
import type { AudioRegion, Project, Task } from "@/types";

// ─────────────────────────────────────────────────────────────
// WAV encoder
// ─────────────────────────────────────────────────────────────

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const dataLen = buffer.length * numCh * 2;
  const ab = new ArrayBuffer(44 + dataLen);
  const v = new DataView(ab);
  const ws = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ws(0, "RIFF"); v.setUint32(4, 36 + dataLen, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * numCh * 2, true); v.setUint16(32, numCh * 2, true);
  v.setUint16(34, 16, true); ws(36, "data"); v.setUint32(40, dataLen, true);
  let off = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

function generateFakeAudioBlob(): Promise<Blob> {
  return new Promise((resolve) => {
    const sr = 22050;
    const dur = 30;
    const buf = new Float32Array(sr * dur);
    for (let i = 0; i < buf.length; i++) {
      const t = i / sr;
      const env = Math.abs(Math.sin(t * 0.5)) * 0.7 + 0.3;
      buf[i] =
        (Math.sin(t * 440 * Math.PI * 2) * 0.4 +
          Math.sin(t * 880 * Math.PI * 2) * 0.2 +
          (Math.random() - 0.5) * 0.08) *
        env;
    }
    const octx = new OfflineAudioContext(1, sr * dur, sr);
    const src = octx.createBufferSource();
    const abuf = octx.createBuffer(1, buf.length, sr);
    abuf.getChannelData(0).set(buf);
    src.buffer = abuf;
    src.connect(octx.destination);
    src.start();
    octx.startRendering().then((rendered) => resolve(audioBufferToWav(rendered)));
  });
}

// ─────────────────────────────────────────────────────────────
// Waveform Player
// ─────────────────────────────────────────────────────────────

interface WaveformPlayerProps {
  regions: AudioRegion[];
  activeRegionId: string | null;
  onRegionClick: (id: string) => void;
  onRegionUpdate: (id: string, start: number, end: number) => void;
  onWaveSurferReady: (ws: any) => void;
  onAudioEvent: (
    eventType: "play" | "pause" | "stop",
    data: { audioId: string; currentAudioTime?: number }
  ) => void;
}

const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  regions,
  activeRegionId,
  onRegionClick,
  onRegionUpdate,
  onWaveSurferReady,
  onAudioEvent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const regionsPluginRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [wsReady, setWsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    (async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      const RegionsPlugin = (
        await import("wavesurfer.js/dist/plugins/regions.esm.js")
      ).default;
      if (destroyed || !containerRef.current) return;
      const regionsPlugin = RegionsPlugin.create();
      regionsPluginRef.current = regionsPlugin;
      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: "rgba(180,110,40,0.5)",
        progressColor: "rgba(160,75,15,0.85)",
        cursorColor: "hsl(var(--accent))",
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 96,
        normalize: true,
        plugins: [regionsPlugin],
      });
      wsRef.current = ws;
      ws.on("ready", () => {
        setDuration(ws.getDuration());
        setWsReady(true);
        onWaveSurferReady(ws);
      });
      ws.on("timeupdate", (t: number) => setCurrentTime(t));
      ws.on("play", () => setIsPlaying(true));
      ws.on("pause", () => setIsPlaying(false));
      ws.on("finish", () => setIsPlaying(false));
      regionsPlugin.on("region-clicked", (region: any, e: Event) => {
        e.stopPropagation();
        onRegionClick(region.id);
      });
      regionsPlugin.on("region-updated", (region: any) => {
        onRegionUpdate(region.id, region.start, region.end);
      });
      const blob = await generateFakeAudioBlob();
      await ws.loadBlob(blob);
    })();
    return () => {
      destroyed = true;
      wsRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!wsReady || !regionsPluginRef.current) return;
    const plugin = regionsPluginRef.current;
    plugin.clearRegions();
    regions.forEach((r) => {
      plugin.addRegion({
        id: r.id,
        start: r.start,
        end: r.end,
        color: r.color,
        drag: true,
        resize: true,
      });
    });
  }, [regions, wsReady]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  const handlePlayRegion = () => {
    const ws = wsRef.current;
    if (!ws || !wsReady) return;
    const plugin = regionsPluginRef.current;
    if (!plugin || !activeRegionId) {
      ws.playPause();
      return;
    }
    const allRegions: any[] = plugin.getRegions?.() ?? [];
    const region = allRegions.find((r: any) => r.id === activeRegionId);
    if (region) {
      ws.setTime(region.start);
      onAudioEvent("play", {
        audioId: `segment-audio-${region.id}`,
        currentAudioTime: region.start,
      });
      ws.play();
    } else {
      onAudioEvent(isPlaying ? "pause" : "play", {
        audioId: "segment-audio",
        currentAudioTime: ws.getCurrentTime?.(),
      });
      ws.playPause();
    }
  };

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-[#180e00] to-[#2a1500]"
        style={{ minHeight: 96 }}
      />
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onAudioEvent("stop", {
                audioId: "segment-audio",
                currentAudioTime: wsRef.current?.getCurrentTime?.(),
              });
              wsRef.current?.stop();
            }}
            className="h-8 w-8 rounded-full p-0"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onAudioEvent(isPlaying ? "pause" : "play", {
                audioId: "segment-audio",
                currentAudioTime: wsRef.current?.getCurrentTime?.(),
              });
              wsRef.current?.playPause();
            }}
            className="h-8 w-8 rounded-full bg-gradient-accent p-0"
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePlayRegion}
            className="h-8 rounded-full px-3 text-xs"
          >
            Play region
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface ModeBPageProps {
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
    options?: {
      preservePage?: boolean;
      silent?: boolean;
      completed?: boolean;
    }
  ) => Promise<void> | void;
  onReviewModeChange: (mode: "single" | "batch") => void;
  onGoTo: (id: number) => void;
}

// ─────────────────────────────────────────────────────────────
// SINGLE MODE — 3-column layout
// ─────────────────────────────────────────────────────────────

const ModeBSingle: React.FC<ModeBPageProps> = ({
  taskId,
  projectId,
  userId,
  tasks,
  projects,
  tasksByProject,
  onBack,
  onSubmit,
  onReviewModeChange,
  onGoTo,
}) => {
  const projectTasks = tasksByProject[projectId] ?? tasks;
  const currentProject = projects.find((p) => p.id === projectId);
  const current = projectTasks.find((t) => t.id === taskId);
  const currentIndex = projectTasks.findIndex((t) => t.id === taskId);
  const sidebarStart = Math.max(0, currentIndex - 2);
  const sidebar = projectTasks.slice(sidebarStart, sidebarStart + 6);

  const TAG_OPTIONS =
    currentProject?.tags?.length
      ? currentProject.tags
      : ["Multiple speakers", "Inaudible", "Background noise"];

  const [transcript, setTranscript] = useState(
    current?.transcript ?? current?.text ?? ""
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(
    current?.tags ?? []
  );
  const [busy, setBusy] = useState(false);

  const regionCounter = useRef(2);
  const [audioRegions, setAudioRegions] = useState<AudioRegion[]>([
    { id: "r1", start: 1.5, end: 7, label: "Speech 1", color: REGION_COLORS[0] },
  ]);
  const [activeRegionId, setActiveRegionId] = useState<string | null>("r1");
  const wsRef = useRef<any>(null);
  const tracking = useTaskTracking({
    projectId,
    taskId,
    userId,
    mode: "segment",
  });
  const transcriptBeforeRef = useRef(transcript);

  useEffect(() => {
    setTranscript(current?.transcript ?? current?.text ?? "");
    setSelectedTags(current?.tags ?? []);
    transcriptBeforeRef.current = current?.transcript ?? current?.text ?? "";
  }, [taskId]);

  const activeRegion =
    audioRegions.find((r) => r.id === activeRegionId) ?? audioRegions[0] ?? null;

  const addRegion = () => {
    const idx = audioRegions.length;
    const newRegion: AudioRegion = {
      id: `r${regionCounter.current++}`,
      start: 10 + idx * 6,
      end: 15 + idx * 6,
      label: `Region ${idx + 1}`,
      color: REGION_COLORS[idx % REGION_COLORS.length],
    };
    setAudioRegions((prev) => [...prev, newRegion]);
    setActiveRegionId(newRegion.id);
    tracking.track("create_segment", {
      elementId: "add-region",
      elementType: "button",
      valueAfter: newRegion,
    });
  };

  const removeRegion = (id: string) => {
    const removed = audioRegions.find((r) => r.id === id);
    setAudioRegions((prev) => prev.filter((r) => r.id !== id));
    if (activeRegionId === id) {
      const remaining = audioRegions.filter((r) => r.id !== id);
      setActiveRegionId(remaining[0]?.id ?? null);
    }
    tracking.track("delete_segment", {
      elementId: `region-${id}-delete`,
      elementType: "button",
      valueBefore: removed,
    });
  };

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) => {
      const next = prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag];
      tracking.track(prev.length === 0 ? "select_option" : "change_answer", {
        elementId: `segment-tag-${tag}`,
        elementType: "tag_option",
        valueBefore: prev,
        valueAfter: next,
        metadata: { selectedTag: tag },
      });
      return next;
    });

  const handleSubmit = async () => {
    setBusy(true);
    try {
      tracking.trackSubmit({
        selectedTags,
        transcriptLength: transcript.trim().length,
        segmentCount: audioRegions.length,
        segments: audioRegions,
      });
      await onSubmit(taskId, transcript, selectedTags, {
        completed: selectedTags.length > 0,
      });
      toast.success("Saved");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Back to project
        </button>

        <p className="text-sm text-muted-foreground">
          Projects / Labeling ·{" "}
          <span className="font-mono text-foreground">#{taskId}</span>
        </p>

        {/* Review mode toggle */}
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted p-1">
          <button className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm">
            Review one item
          </button>
          <button
            onClick={() => onReviewModeChange("batch")}
            className="rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Review 10 items
          </button>
        </div>
      </div>

      {/* 3-column grid */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr_280px]">

        {/* ── Left: Task sidebar ── */}
        <Card className="border-border/60 p-5 shadow-soft">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tasks
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

        {/* ── Center: Waveform + Regions + Transcript + Tags ── */}
        <Card className="border-border/60 p-6 shadow-soft">
          <WaveformPlayer
            regions={audioRegions}
            activeRegionId={activeRegionId}
            onRegionClick={setActiveRegionId}
            onRegionUpdate={(id, start, end) => {
              setAudioRegions((prev) => {
                const before = prev.find((r) => r.id === id);
                if (before) {
                  if (before.start !== start) {
                    tracking.track("adjust_segment_start", {
                      elementId: `region-${id}`,
                      elementType: "audio_region",
                      valueBefore: before.start,
                      valueAfter: start,
                    });
                  }
                  if (before.end !== end) {
                    tracking.track("adjust_segment_end", {
                      elementId: `region-${id}`,
                      elementType: "audio_region",
                      valueBefore: before.end,
                      valueAfter: end,
                    });
                  }
                  tracking.track("edit_segment", {
                    elementId: `region-${id}`,
                    elementType: "audio_region",
                    valueBefore: before,
                    valueAfter: { ...before, start, end },
                  });
                }
                return prev.map((r) => (r.id === id ? { ...r, start, end } : r));
              });
            }}
            onWaveSurferReady={(ws) => {
              wsRef.current = ws;
            }}
            onAudioEvent={(eventType, data) => tracking.trackAudio(eventType, data)}
          />

          {/* Region tabs */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {audioRegions.map((r, idx) => (
              <button
                key={r.id}
                onClick={() => setActiveRegionId(r.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-all ${
                  r.id === activeRegionId
                    ? "border-amber-400/60 bg-amber-50 text-amber-800"
                    : "border-border bg-muted/50 text-muted-foreground hover:border-accent/40"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: REGION_SOLID[idx % REGION_SOLID.length],
                  }}
                />
                {r.label}
                {audioRegions.length > 1 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRegion(r.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        removeRegion(r.id);
                      }
                    }}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={addRegion}
              className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground transition hover:border-accent/40 hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          {/* Active region info row */}
          {activeRegion && (
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/40 px-4 py-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background:
                    REGION_SOLID[
                      audioRegions.findIndex((r) => r.id === activeRegion.id) %
                        REGION_SOLID.length
                    ],
                }}
              />
              <span className="font-medium">{activeRegion.label}</span>
              <span className="text-muted-foreground">
                {activeRegion.start.toFixed(2)}s – {activeRegion.end.toFixed(2)}s
              </span>
              <span className="ml-auto text-muted-foreground">
                ({(activeRegion.end - activeRegion.start).toFixed(2)}s)
              </span>
            </div>
          )}

          {/* Transcription */}
          <h3 className="mt-6 text-lg font-bold">Transcription</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Please correct the transcript if needed.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onBlur={() => {
              if (transcriptBeforeRef.current === transcript) return;
              tracking.track("change_answer", {
                elementId: "segment-transcript",
                elementType: "textarea",
                valueBefore: transcriptBeforeRef.current,
                valueAfter: transcript,
              });
              transcriptBeforeRef.current = transcript;
            }}
            className="mt-3 min-h-24 w-full resize-none rounded-xl border border-border bg-background p-4 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />

          {/* Tags */}
          <h4 className="mt-6 text-sm font-semibold">Tag any that apply</h4>
          <div className="mt-3 space-y-2">
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
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40 bg-white"
                    }`}
                  >
                    {isSelected ? <Check className="h-3 w-3" /> : null}
                  </span>
                  {tag}
                </button>
              );
            })}
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
              <ArrowLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={busy}
              className="rounded-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
            >
              {busy ? "Saving…" : "Submit"}{" "}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* ── Right: Region Details ── */}
        <Card className="border-border/60 p-5 shadow-soft">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Region Details
          </h4>

          {activeRegion ? (
            <>
              <div className="mt-4 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background:
                      REGION_SOLID[
                        audioRegions.findIndex(
                          (r) => r.id === activeRegion.id
                        ) % REGION_SOLID.length
                      ],
                  }}
                />
                <span className="font-semibold">{activeRegion.label}</span>
              </div>

              <div className="mt-4 space-y-0">
                {[
                  { label: "Start", value: `${activeRegion.start.toFixed(3)}s` },
                  { label: "End", value: `${activeRegion.end.toFixed(3)}s` },
                  {
                    label: "Duration",
                    value: `${(activeRegion.end - activeRegion.start).toFixed(3)}s`,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between border-b border-border/40 py-3"
                  >
                    <span className="text-sm text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="font-mono text-sm font-medium">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <h5 className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                All Regions
              </h5>
              <div className="mt-3 space-y-1">
                {audioRegions.map((r, idx) => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRegionId(r.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                      r.id === activeRegionId
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: REGION_SOLID[idx % REGION_SOLID.length],
                        }}
                      />
                      <span>{r.label}</span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.start.toFixed(1)}–{r.end.toFixed(1)}s
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Select a region on the waveform to view its properties.
            </p>
          )}
        </Card>
      </div>
    </main>
  );
};

// ─────────────────────────────────────────────────────────────
// BATCH MODE
// ─────────────────────────────────────────────────────────────

type SegmentBatchDraft = {
  transcript: string;
  selectedTags: string[];
  audioRegions: AudioRegion[];
  activeRegionId: string | null;
};

const ModeBBatch: React.FC<ModeBPageProps> = ({
  projectId,
  userId,
  tasks,
  projects,
  tasksByProject,
  onBack,
  onSubmit,
  onReviewModeChange,
}) => {
  const projectTasks = tasksByProject[projectId] ?? tasks;
  const currentProject = projects.find((p) => p.id === projectId);

  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(0);
  const [batchDrafts, setBatchDrafts] = useState<Record<number, SegmentBatchDraft>>({});
  const batchRegionCounters = useRef<Record<number, number>>({});
  const [busy, setBusy] = useState(false);

  const TAG_OPTIONS =
    currentProject?.tags?.length
      ? currentProject.tags
      : ["Multiple speakers", "Inaudible", "Background noise"];

  const totalItems = projectTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const pageItems = projectTasks.slice(
    safeCurrentPage * PAGE_SIZE,
    (safeCurrentPage + 1) * PAGE_SIZE
  );
  const completedCount = projectTasks.filter((t) => t.completed).length;

  const getItemDraft = (taskId: number): SegmentBatchDraft => {
    if (batchDrafts[taskId]) return batchDrafts[taskId];
    const task = projectTasks.find((t) => t.id === taskId);
    const regionId = `${taskId}-r1`;
    return {
      transcript: task?.transcript ?? task?.text ?? "",
      selectedTags: task?.tags ?? [],
      audioRegions: [
        {
          id: regionId,
          start: 1.5,
          end: 7,
          label: "Speech 1",
          color: REGION_COLORS[0],
        },
      ],
      activeRegionId: regionId,
    };
  };

  const updateItemRegions = (
    taskId: number,
    updater: (draft: SegmentBatchDraft) => SegmentBatchDraft
  ) => {
    setBatchDrafts((prev) => {
      const draft = prev[taskId] ?? getItemDraft(taskId);
      return {
        ...prev,
        [taskId]: updater(draft),
      };
    });
  };

  const addItemRegion = (taskId: number) => {
    updateItemRegions(taskId, (draft) => {
      const nextCount =
        batchRegionCounters.current[taskId] ?? draft.audioRegions.length + 1;
      batchRegionCounters.current[taskId] = nextCount + 1;
      const idx = draft.audioRegions.length;
      const newRegion: AudioRegion = {
        id: `${taskId}-r${nextCount}`,
        start: 10 + idx * 6,
        end: 15 + idx * 6,
        label: `Region ${idx + 1}`,
        color: REGION_COLORS[idx % REGION_COLORS.length],
      };
      trackInteraction(
        { projectId, taskId, userId, mode: "segment" },
        {
          eventType: "create_segment",
          elementId: "segment-batch-add-region",
          elementType: "button",
          valueAfter: newRegion,
        }
      );
      return {
        ...draft,
        audioRegions: [...draft.audioRegions, newRegion],
        activeRegionId: newRegion.id,
      };
    });
  };

  const removeItemRegion = (taskId: number, regionId: string) => {
    updateItemRegions(taskId, (draft) => {
      const removed = draft.audioRegions.find((r) => r.id === regionId);
      const remaining = draft.audioRegions.filter((r) => r.id !== regionId);
      trackInteraction(
        { projectId, taskId, userId, mode: "segment" },
        {
          eventType: "delete_segment",
          elementId: `segment-batch-region-${regionId}-delete`,
          elementType: "button",
          valueBefore: removed,
        }
      );
      return {
        ...draft,
        audioRegions: remaining,
        activeRegionId:
          draft.activeRegionId === regionId
            ? remaining[0]?.id ?? null
            : draft.activeRegionId,
      };
    });
  };

  const setItemActiveRegion = (taskId: number, regionId: string | null) => {
    updateItemRegions(taskId, (draft) => ({
      ...draft,
      activeRegionId: regionId,
    }));
  };

  const updateItemRegionTiming = (
    taskId: number,
    regionId: string,
    start: number,
    end: number
  ) => {
    updateItemRegions(taskId, (draft) => {
      const before = draft.audioRegions.find((r) => r.id === regionId);
      if (before) {
        if (before.start !== start) {
          trackInteraction(
            { projectId, taskId, userId, mode: "segment" },
            {
              eventType: "adjust_segment_start",
              elementId: `segment-batch-region-${regionId}`,
              elementType: "audio_region",
              valueBefore: before.start,
              valueAfter: start,
            }
          );
        }
        if (before.end !== end) {
          trackInteraction(
            { projectId, taskId, userId, mode: "segment" },
            {
              eventType: "adjust_segment_end",
              elementId: `segment-batch-region-${regionId}`,
              elementType: "audio_region",
              valueBefore: before.end,
              valueAfter: end,
            }
          );
        }
        trackInteraction(
          { projectId, taskId, userId, mode: "segment" },
          {
            eventType: "edit_segment",
            elementId: `segment-batch-region-${regionId}`,
            elementType: "audio_region",
            valueBefore: before,
            valueAfter: { ...before, start, end },
          }
        );
      }
      return {
        ...draft,
        audioRegions: draft.audioRegions.map((r) =>
          r.id === regionId ? { ...r, start, end } : r
        ),
      };
    });
  };

  const updateItemTranscript = (taskId: number, transcript: string) => {
    const draft = getItemDraft(taskId);
    trackInteraction(
      { projectId, taskId, userId, mode: "segment" },
      {
        eventType: "change_answer",
        elementId: "segment-batch-transcript",
        elementType: "input",
        valueBefore: draft.transcript,
        valueAfter: transcript,
      }
    );
    setBatchDrafts((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] ?? draft), transcript },
    }));
  };

  const updateItemTags = (taskId: number, tag: string) => {
    setBatchDrafts((prev) => {
      const draft = prev[taskId] ?? getItemDraft(taskId);
      const nextTags = draft.selectedTags.includes(tag)
        ? draft.selectedTags.filter((t) => t !== tag)
        : [...draft.selectedTags, tag];
      trackInteraction(
        { projectId, taskId, userId, mode: "segment" },
        {
          eventType: draft.selectedTags.length === 0 ? "select_option" : "change_answer",
          elementId: `segment-batch-tag-${tag}`,
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
      startTaskTiming({ projectId, taskId: task.id, userId, mode: "segment" })
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
        projectTasks.map((task) => {
          const draft = getItemDraft(task.id);
          const shouldMarkDone = draft.selectedTags.length > 0;
          const timing = completeTaskTiming({
            projectId,
            taskId: task.id,
            userId,
            mode: "segment",
          });
          trackInteraction(
            { projectId, taskId: task.id, userId, mode: "segment" },
            {
              eventType: "submit",
              elementId: "segment-batch-submit",
              elementType: "button",
              metadata: {
                selectedTags: draft.selectedTags,
                transcriptLength: draft.transcript.trim().length,
                segmentCount: draft.audioRegions.length,
                segments: draft.audioRegions,
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
        toast.warning("Some items are missing tags — saved as pending.");
      } else {
        toast.success("All items saved and marked as Done.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Back to project
        </button>

        <p className="text-sm text-muted-foreground">
          Page {safeCurrentPage + 1} of {totalPages} · {completedCount} completed
        </p>

        {/* Review mode toggle */}
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted p-1">
          <button
            onClick={() => {
              const firstTask = projectTasks[0];
              if (firstTask) onReviewModeChange("single");
            }}
            className="rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
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
          <h3 className="text-lg font-bold">No items yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This project has no review items.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <h3 className="text-lg font-bold">Review 10 items</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Check items on this page, then submit them together.
            </p>
          </div>

          {/* Batch table */}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-white">
            <div className="grid grid-cols-[110px_minmax(0,1fr)_90px] gap-4 border-b border-border/60 bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
              <div>ID</div>
              <div>Audio / Transcript / Tags</div>
              <div>Status</div>
            </div>

            {pageItems.map((task, idx) => {
              const isDone = task.completed;
              const draft = getItemDraft(task.id);
              const itemNumber = safeCurrentPage * PAGE_SIZE + idx + 1;
              return (
                <div
                  key={task.id}
                  className="grid grid-cols-[110px_minmax(0,1fr)_90px] gap-4 border-b border-border/60 px-4 py-4"
                >
                  <div>
                    <div className="font-mono text-xs">#{task.id}</div>
                    <div className="text-xs text-muted-foreground">
                      Item {itemNumber}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                      <WaveformPlayer
                        regions={draft.audioRegions}
                        activeRegionId={draft.activeRegionId}
                        onRegionClick={(regionId) =>
                          setItemActiveRegion(task.id, regionId)
                        }
                        onRegionUpdate={(regionId, start, end) =>
                          updateItemRegionTiming(task.id, regionId, start, end)
                        }
                        onWaveSurferReady={() => undefined}
                        onAudioEvent={(eventType, data) =>
                          trackInteraction(
                            { projectId, taskId: task.id, userId, mode: "segment" },
                            {
                              eventType,
                              audioId: data.audioId ?? `segment-batch-audio-${task.id}`,
                              elementId: "segment-batch-audio",
                              elementType: "audio",
                              currentAudioTime: data.currentAudioTime,
                              playCount: eventType === "play" ? 1 : undefined,
                            }
                          )
                        }
                      />

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {draft.audioRegions.map((region, regionIndex) => (
                          <button
                            key={region.id}
                            type="button"
                            onClick={() => setItemActiveRegion(task.id, region.id)}
                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-all ${
                              region.id === draft.activeRegionId
                                ? "border-amber-400/60 bg-white text-amber-800"
                                : "border-border bg-white/70 text-muted-foreground hover:border-accent/40"
                            }`}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                background:
                                  REGION_SOLID[regionIndex % REGION_SOLID.length],
                              }}
                            />
                            {region.label}
                            {draft.audioRegions.length > 1 && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeItemRegion(task.id, region.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.stopPropagation();
                                    removeItemRegion(task.id, region.id);
                                  }
                                }}
                                className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                              >
                                <X className="h-3 w-3" />
                              </span>
                            )}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => addItemRegion(task.id)}
                          className="flex items-center gap-1 rounded-full border border-dashed border-border bg-white/70 px-3 py-1 text-sm text-muted-foreground transition hover:border-accent/40 hover:text-accent"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                      </div>

                      {draft.activeRegionId && (
                        <div className="mt-3 flex items-center gap-3 rounded-lg bg-white/70 px-4 py-2 text-sm">
                          {(() => {
                            const activeRegion = draft.audioRegions.find(
                              (region) => region.id === draft.activeRegionId
                            );
                            if (!activeRegion) return null;
                            const activeIndex = draft.audioRegions.findIndex(
                              (region) => region.id === activeRegion.id
                            );
                            return (
                              <>
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{
                                    background:
                                      REGION_SOLID[
                                        activeIndex % REGION_SOLID.length
                                      ],
                                  }}
                                />
                                <span className="font-medium">
                                  {activeRegion.label}
                                </span>
                                <span className="text-muted-foreground">
                                  {activeRegion.start.toFixed(2)}s -{" "}
                                  {activeRegion.end.toFixed(2)}s
                                </span>
                                <span className="ml-auto text-muted-foreground">
                                  ({(activeRegion.end - activeRegion.start).toFixed(2)}s)
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(260px,0.8fr)_minmax(360px,1.2fr)]">
                      <input
                        type="text"
                        value={draft.transcript}
                        onChange={(e) =>
                          updateItemTranscript(task.id, e.target.value)
                        }
                        placeholder="Edit transcript..."
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                      />

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
                              <span className="max-w-[130px] truncate">{tag}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 text-center">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                        isDone
                          ? "bg-green-50 text-green-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {isDone ? "Done" : "Pending"}
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
                {busy ? "Saving…" : "Submit"}{" "}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  );
};

// ─────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────

const ModeBPage: React.FC<ModeBPageProps> = (props) =>
  props.mode === "single" ? (
    <ModeBSingle {...props} />
  ) : (
    <ModeBBatch {...props} />
  );

export default ModeBPage;
