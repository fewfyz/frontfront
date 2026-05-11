import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ProjectMode } from "@/types";

export type TrackingEventType =
  | "play"
  | "pause"
  | "stop"
  | "replay"
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
    active[key] = {
      ...context,
      startedAt: nowIso(),
    };
    writeJson(ACTIVE_TIMINGS_KEY, active);
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
