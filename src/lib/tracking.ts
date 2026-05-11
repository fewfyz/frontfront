import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ProjectMode } from "@/types";

export type TrackingEventType =
  | "task_open"
  | "play"
  | "pause"
  | "stop"
  | "replay"
  | "skip"
  | "select_option"
  | "change_answer"
  | "create_segment"
  | "edit_segment"
  | "delete_segment"
  | "adjust_segment_start"
  | "adjust_segment_end"
  | "rank_audio"
  | "change_ranking"
  | "submit"
  | "navigate_task";

export type TrackingContext = {
  projectId: number;
  taskId: number;
  userId: string;
  mode: ProjectMode;
};

export type TrackingEvent = TrackingContext & {
  eventId: string;
  eventType: TrackingEventType;
  timestamp: string;
  audioId?: string;
  elementId?: string;
  elementType?: string;
  playCount?: number;
  currentAudioTime?: number;
  durationPlayed?: number;
  valueBefore?: unknown;
  valueAfter?: unknown;
  metadata?: Record<string, unknown>;
};

export type TaskTimingRecord = TrackingContext & {
  startedAt: string;
  submittedAt: string;
  durationSeconds: number;
};

type DraftTimingRecord = TrackingContext & {
  startedAt: string;
};

const EVENTS_KEY = "annota_tracking_events";
const TIMINGS_KEY = "annota_task_timings";
const ACTIVE_TIMINGS_KEY = "annota_active_task_timings";

const nowIso = () => new Date().toISOString();

const storageAvailable = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readJson = <T,>(key: string, fallback: T): T => {
  if (!storageAvailable()) return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
};

const writeJson = <T,>(key: string, value: T) => {
  if (!storageAvailable()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const makeEventId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const timingKey = ({ projectId, taskId, userId, mode }: TrackingContext) =>
  `${userId}:${projectId}:${mode}:${taskId}`;

export const trackInteraction = (
  context: TrackingContext,
  event: Omit<TrackingEvent, keyof TrackingContext | "eventId" | "timestamp">
) => {
  const events = readJson<TrackingEvent[]>(EVENTS_KEY, []);
  events.push({
    ...context,
    ...event,
    eventId: makeEventId(),
    timestamp: nowIso(),
  });
  writeJson(EVENTS_KEY, events);
};

export const startTaskTiming = (context: TrackingContext) => {
  const active = readJson<Record<string, DraftTimingRecord>>(ACTIVE_TIMINGS_KEY, {});
  const key = timingKey(context);
  if (!active[key]) {
    const startedAt = nowIso();
    active[key] = {
      ...context,
      startedAt,
    };
    writeJson(ACTIVE_TIMINGS_KEY, active);
    const events = readJson<TrackingEvent[]>(EVENTS_KEY, []);
    events.push({
      ...context,
      eventId: makeEventId(),
      eventType: "task_open",
      timestamp: startedAt,
      elementId: "task-page",
      elementType: "page",
    });
    writeJson(EVENTS_KEY, events);
  }
  return active[key].startedAt;
};

export const completeTaskTiming = (context: TrackingContext) => {
  const active = readJson<Record<string, DraftTimingRecord>>(ACTIVE_TIMINGS_KEY, {});
  const key = timingKey(context);
  const startedAt = active[key]?.startedAt ?? startTaskTiming(context);
  const submittedAt = nowIso();
  const durationSeconds = Math.max(
    0,
    Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  );
  const record: TaskTimingRecord = {
    ...context,
    startedAt,
    submittedAt,
    durationSeconds,
  };
  const timings = readJson<TaskTimingRecord[]>(TIMINGS_KEY, []);
  timings.push(record);
  writeJson(TIMINGS_KEY, timings);
  delete active[key];
  writeJson(ACTIVE_TIMINGS_KEY, active);
  return record;
};

export const getTrackingSnapshot = () => ({
  events: readJson<TrackingEvent[]>(EVENTS_KEY, []),
  taskTimings: readJson<TaskTimingRecord[]>(TIMINGS_KEY, []),
});

const formatThaiTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(",", "");
};

const readableValue = (value: unknown) => {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(" > ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const csvEscape = (value: unknown) => {
  const text = readableValue(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

type ExportMode = ProjectMode | "timings";

type ExportColumns = Partial<Record<ExportMode, string[]>>;

type ExportOptions = {
  columns?: ExportColumns;
};

const DEFAULT_EXPORT_COLUMNS: Record<ExportMode, string[]> = {
  select: [
    "thai_time",
    "project_id",
    "task_id",
    "user_id",
    "mode",
    "event_type",
    "selected_option",
    "answer_before",
    "answer_after",
    "duration_seconds",
  ],
  segment: [
    "thai_time",
    "project_id",
    "task_id",
    "user_id",
    "mode",
    "event_type",
    "audio_id",
    "segment_before",
    "segment_after",
    "duration_played_seconds",
    "duration_seconds",
  ],
  compare: [
    "thai_time",
    "project_id",
    "task_id",
    "user_id",
    "mode",
    "event_type",
    "audio_id",
    "rank_position",
    "ranking_before",
    "ranking_after",
    "play_count",
    "duration_played_seconds",
    "duration_seconds",
  ],
  timings: [
    "project_id",
    "task_id",
    "user_id",
    "mode",
    "started_at_thai",
    "submitted_at_thai",
    "duration_seconds",
  ],
};

const AUDIO_LENGTH_SECONDS: Record<ProjectMode, number> = {
  select: 45,
  segment: 30,
  compare: 54,
};

const selectColumns = (rows: Record<string, unknown>[], columns: string[]) =>
  rows.map((row) =>
    columns.reduce<Record<string, unknown>>((selected, column) => {
      selected[column] = row[column] ?? "";
      return selected;
    }, {})
  );

const downloadCsv = (
  filename: string,
  rows: Record<string, unknown>[],
  columns?: string[]
) => {
  if (!rows.length) return;
  const outputRows = columns ? selectColumns(rows, columns) : rows;
  const headers = Object.keys(outputRows[0]);
  const csv = [
    headers.map(csvEscape).join(","),
    ...outputRows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const baseEventRow = (event: TrackingEvent) => ({
  event_id: event.eventId,
  thai_time: formatThaiTime(event.timestamp),
  project_id: event.projectId,
  task_id: event.taskId,
  user_id: event.userId,
  mode: event.mode,
  event_type: event.eventType,
  element: event.elementId ?? "",
  element_type: event.elementType ?? "",
});

const selectEventRow = (event: TrackingEvent) => ({
  ...baseEventRow(event),
  selected_option: event.metadata?.selectedTag ?? "",
  answer_before: readableValue(event.valueBefore),
  answer_after: readableValue(event.valueAfter),
  seconds_before_selection: event.metadata?.secondsBeforeSelection ?? "",
  transcript_length: event.metadata?.transcriptLength ?? "",
  duration_seconds: event.metadata?.durationSeconds ?? "",
  audio_id: event.audioId ?? "",
  play_count: event.playCount ?? "",
});

const segmentEventRow = (event: TrackingEvent) => ({
  ...baseEventRow(event),
  audio_id: event.audioId ?? "",
  play_count: event.playCount ?? "",
  current_audio_time: event.currentAudioTime ?? "",
  duration_played_seconds: event.durationPlayed ?? "",
  segment_before: readableValue(event.valueBefore),
  segment_after: readableValue(event.valueAfter),
  selected_option: event.metadata?.selectedTag ?? "",
  segment_count: event.metadata?.segmentCount ?? "",
  duration_seconds: event.metadata?.durationSeconds ?? "",
});

const compareEventRow = (event: TrackingEvent) => ({
  ...baseEventRow(event),
  audio_id: event.audioId ?? event.metadata?.selectedAudio ?? "",
  rank_position: event.metadata?.rankPosition ?? "",
  ranking_before: readableValue(event.valueBefore),
  ranking_after: readableValue(event.valueAfter ?? event.metadata?.rankings),
  play_count: event.playCount ?? "",
  current_audio_time: event.currentAudioTime ?? "",
  duration_played_seconds: event.durationPlayed ?? "",
  duration_seconds: event.metadata?.durationSeconds ?? "",
});

const timingRow = (row: TaskTimingRecord) => ({
  project_id: row.projectId,
  task_id: row.taskId,
  user_id: row.userId,
  mode: row.mode,
  started_at_thai: formatThaiTime(row.startedAt),
  submitted_at_thai: formatThaiTime(row.submittedAt),
  duration_seconds: row.durationSeconds,
});

export const exportTrackingCsvByMode = (options: ExportOptions = {}) => {
  const { events, taskTimings } = getTrackingSnapshot();
  const selectEvents = events.filter((event) => event.mode === "select");
  const segmentEvents = events.filter((event) => event.mode === "segment");
  const compareEvents = events.filter((event) => event.mode === "compare");
  const hasCustomColumns = !!options.columns;
  const shouldExport = (mode: ExportMode) =>
    !hasCustomColumns || Object.prototype.hasOwnProperty.call(options.columns, mode);
  const columns = hasCustomColumns ? options.columns ?? {} : DEFAULT_EXPORT_COLUMNS;

  if (shouldExport("select")) {
    downloadCsv(
      "tracking-select-mode-thai-time.csv",
      selectEvents.map(selectEventRow),
      columns.select
    );
  }
  if (shouldExport("segment")) {
    downloadCsv(
      "tracking-segment-mode-thai-time.csv",
      segmentEvents.map(segmentEventRow),
      columns.segment
    );
  }
  if (shouldExport("compare")) {
    downloadCsv(
      "tracking-compare-mode-thai-time.csv",
      compareEvents.map(compareEventRow),
      columns.compare
    );
  }
  if (shouldExport("timings")) {
    downloadCsv(
      "tracking-task-timings-thai-time.csv",
      taskTimings.map(timingRow),
      columns.timings
    );
  }
};

type FraudFeatureRow = {
  user_id: string;
  project_id: number;
  mode: ProjectMode;
  task_count: number;
  duration_mean_seconds: number;
  duration_min_seconds: number;
  duration_total_seconds: number;
  speed_ratio_mean: number;
  response_before_audio_end_rate: number;
  time_of_day_latest: string;
  day_of_week_latest: string;
  gap_mean_seconds: number;
  gap_min_seconds: number;
  z_score_duration: string;
  play_clicks_total: number;
  play_clicks_mean_per_task: number;
  listen_rate: number;
  replay_ratio: number;
  skip_rate: number;
  avg_completion_pct: number;
  answer_entropy: number;
  answer_variance_count: number;
  accuracy_zscore: string;
  burst_count: number;
  shared_ip_flag: string;
  user_consistency_score: string;
  session_drift_score: string;
};

const ASR_FRAUD_FEATURE_COLUMNS: Array<keyof FraudFeatureRow> = [
  "user_id",
  "project_id",
  "mode",
  "task_count",
  "duration_mean_seconds",
  "duration_min_seconds",
  "duration_total_seconds",
  "speed_ratio_mean",
  "response_before_audio_end_rate",
  "time_of_day_latest",
  "day_of_week_latest",
  "gap_mean_seconds",
  "gap_min_seconds",
  "z_score_duration",
  "play_clicks_total",
  "play_clicks_mean_per_task",
  "listen_rate",
  "replay_ratio",
  "skip_rate",
  "avg_completion_pct",
  "answer_entropy",
  "answer_variance_count",
  "accuracy_zscore",
  "burst_count",
  "shared_ip_flag",
  "user_consistency_score",
  "session_drift_score",
];

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const minOrZero = (values: number[]) => (values.length ? Math.min(...values) : 0);

const round = (value: number, digits = 3) => Number(value.toFixed(digits));

const getThaiDateParts = (iso?: string) => {
  if (!iso) return { time: "", weekday: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { time: "", weekday: "" };
  return {
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date),
    weekday: new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      weekday: "long",
    }).format(date),
  };
};

const entropy = (answers: string[]) => {
  if (!answers.length) return 0;
  const counts = answers.reduce<Record<string, number>>((acc, answer) => {
    acc[answer] = (acc[answer] ?? 0) + 1;
    return acc;
  }, {});
  return Object.values(counts).reduce((sum, count) => {
    const p = count / answers.length;
    return sum - p * Math.log2(p);
  }, 0);
};

const answerValue = (event: TrackingEvent) => {
  if (event.mode === "compare") return readableValue(event.metadata?.rankings ?? event.valueAfter);
  return readableValue(event.metadata?.selectedTags ?? event.valueAfter);
};

export const buildAsrFraudFeatureRows = (): FraudFeatureRow[] => {
  const { events, taskTimings } = getTrackingSnapshot();
  const grouped = taskTimings.reduce<Record<string, TaskTimingRecord[]>>((acc, timing) => {
    const key = `${timing.userId}:${timing.projectId}:${timing.mode}`;
    acc[key] = [...(acc[key] ?? []), timing];
    return acc;
  }, {});

  return Object.values(grouped).map((timings) => {
    const first = timings[0];
    const sortedTimings = [...timings].sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
    );
    const timingTaskIds = new Set(timings.map((timing) => timing.taskId));
    const modeEvents = events.filter(
      (event) =>
        event.userId === first.userId &&
        event.projectId === first.projectId &&
        event.mode === first.mode &&
        timingTaskIds.has(event.taskId)
    );
    const durationValues = timings.map((timing) => timing.durationSeconds);
    const audioLength = AUDIO_LENGTH_SECONDS[first.mode];
    const submitEvents = modeEvents.filter((event) => event.eventType === "submit");
    const answerEvents = modeEvents.filter((event) =>
      ["select_option", "change_answer", "rank_audio", "change_ranking", "submit"].includes(
        event.eventType
      )
    );
    const answers = submitEvents.map(answerValue).filter(Boolean);
    const playEvents = modeEvents.filter((event) =>
      ["play", "replay"].includes(event.eventType)
    );
    const replayEvents = modeEvents.filter((event) => event.eventType === "replay");
    const skipEvents = modeEvents.filter((event) => event.eventType === "skip");
    const listenedTaskCount = new Set(playEvents.map((event) => event.taskId)).size;
    const durationPlayedByTask = modeEvents.reduce<Record<number, number>>((acc, event) => {
      if (typeof event.durationPlayed === "number") {
        acc[event.taskId] = (acc[event.taskId] ?? 0) + event.durationPlayed;
      }
      return acc;
    }, {});
    const completionValues = timings.map((timing) =>
      Math.min(1, (durationPlayedByTask[timing.taskId] ?? 0) / audioLength)
    );
    const gaps = sortedTimings.slice(1).map((timing, index) =>
      Math.max(
        0,
        (new Date(timing.submittedAt).getTime() -
          new Date(sortedTimings[index].submittedAt).getTime()) /
          1000
      )
    );
    const latest = sortedTimings[sortedTimings.length - 1];
    const thaiLatest = getThaiDateParts(latest?.submittedAt);

    return {
      user_id: first.userId,
      project_id: first.projectId,
      mode: first.mode,
      task_count: timings.length,
      duration_mean_seconds: round(average(durationValues)),
      duration_min_seconds: round(minOrZero(durationValues)),
      duration_total_seconds: round(durationValues.reduce((sum, value) => sum + value, 0)),
      speed_ratio_mean: round(average(durationValues.map((duration) => duration / audioLength))),
      response_before_audio_end_rate: round(
        durationValues.filter((duration) => duration < audioLength).length / timings.length
      ),
      time_of_day_latest: thaiLatest.time,
      day_of_week_latest: thaiLatest.weekday,
      gap_mean_seconds: round(average(gaps)),
      gap_min_seconds: round(minOrZero(gaps)),
      z_score_duration: "",
      play_clicks_total: playEvents.length,
      play_clicks_mean_per_task: round(playEvents.length / timings.length),
      listen_rate: round(listenedTaskCount / timings.length),
      replay_ratio: round(replayEvents.length / Math.max(1, playEvents.length)),
      skip_rate: round(skipEvents.length / timings.length),
      avg_completion_pct: round(average(completionValues) * 100, 2),
      answer_entropy: round(entropy(answers)),
      answer_variance_count: new Set(answerEvents.map(answerValue).filter(Boolean)).size,
      accuracy_zscore: "",
      burst_count: gaps.filter((gap) => gap < 1).length,
      shared_ip_flag: "",
      user_consistency_score: "",
      session_drift_score: "",
    };
  });
};

export const exportAsrFraudFeaturesCsv = (
  columns: Array<keyof FraudFeatureRow> = ASR_FRAUD_FEATURE_COLUMNS
) => {
  downloadCsv("asr-fraud-features-thai-time.csv", buildAsrFraudFeatureRows(), [
    ...columns,
  ]);
};

if (typeof window !== "undefined") {
  type TrackingWindow = Window & {
    exportTrackingCsvByMode?: typeof exportTrackingCsvByMode;
    exportAsrFraudFeaturesCsv?: typeof exportAsrFraudFeaturesCsv;
    buildAsrFraudFeatureRows?: typeof buildAsrFraudFeatureRows;
    trackingExportColumns?: typeof DEFAULT_EXPORT_COLUMNS;
    asrFraudFeatureColumns?: typeof ASR_FRAUD_FEATURE_COLUMNS;
    getTrackingSnapshot?: typeof getTrackingSnapshot;
  };
  const trackingWindow = window as TrackingWindow;
  trackingWindow.exportTrackingCsvByMode = exportTrackingCsvByMode;
  trackingWindow.exportAsrFraudFeaturesCsv = exportAsrFraudFeaturesCsv;
  trackingWindow.buildAsrFraudFeatureRows = buildAsrFraudFeatureRows;
  trackingWindow.trackingExportColumns = DEFAULT_EXPORT_COLUMNS;
  trackingWindow.asrFraudFeatureColumns = ASR_FRAUD_FEATURE_COLUMNS;
  trackingWindow.getTrackingSnapshot = getTrackingSnapshot;
}

type AudioSession = {
  playCount: number;
  lastStartedAt?: number;
};

export const useTaskTracking = (context: TrackingContext) => {
  const contextRef = useRef(context);
  const audioRef = useRef<Record<string, AudioSession>>({});

  useEffect(() => {
    contextRef.current = context;
    audioRef.current = {};
    startTaskTiming(context);
  }, [context.projectId, context.taskId, context.userId, context.mode]);

  const track = useCallback(
    (
      eventType: TrackingEventType,
      data: Omit<TrackingEvent, keyof TrackingContext | "eventId" | "timestamp" | "eventType"> = {}
    ) => {
      trackInteraction(contextRef.current, { ...data, eventType });
    },
    []
  );

  const trackAudio = useCallback(
    (
      eventType: "play" | "pause" | "stop",
      data: Omit<TrackingEvent, keyof TrackingContext | "eventId" | "timestamp" | "eventType"> & {
        audioId: string;
      }
    ) => {
      const session = audioRef.current[data.audioId] ?? { playCount: 0 };
      let durationPlayed = data.durationPlayed;
      let trackedEventType: TrackingEventType = eventType;

      if (eventType === "play") {
        session.playCount += 1;
        session.lastStartedAt = Date.now();
        trackedEventType = session.playCount > 1 ? "replay" : "play";
      }

      if ((eventType === "pause" || eventType === "stop") && session.lastStartedAt) {
        durationPlayed = Math.max(0, (Date.now() - session.lastStartedAt) / 1000);
        session.lastStartedAt = undefined;
      }

      audioRef.current[data.audioId] = session;
      trackInteraction(contextRef.current, {
        ...data,
        eventType: trackedEventType,
        playCount: session.playCount,
        durationPlayed,
      });
    },
    []
  );

  const trackSubmit = useCallback(
    (metadata?: Record<string, unknown>) => {
      const timing = completeTaskTiming(contextRef.current);
      trackInteraction(contextRef.current, {
        eventType: "submit",
        elementId: "submit",
        elementType: "button",
        metadata: {
          ...metadata,
          startedAt: timing.startedAt,
          submittedAt: timing.submittedAt,
          durationSeconds: timing.durationSeconds,
        },
      });
      return timing;
    },
    []
  );

  return useMemo(
    () => ({
      track,
      trackAudio,
      trackSubmit,
    }),
    [track, trackAudio, trackSubmit]
  );
};
