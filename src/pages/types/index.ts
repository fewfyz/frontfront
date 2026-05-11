// ─── Project Modes ────────────────────────────────────────────────────────────
export type ProjectMode = "select" | "segment" | "compare";

export const PROJECT_MODES: { value: ProjectMode; label: string }[] = [
  { value: "select", label: "Select Mode" },
  { value: "segment", label: "Segment Mode" },
  { value: "compare", label: "Compare Mode" },
];

// ─── Core Types ───────────────────────────────────────────────────────────────
export type Project = {
  id: number;
  name: string;
  tasks: number;
  completed: number;
  tags?: string[];
  demo?: boolean;
  mode?: ProjectMode;
};

export type Task = {
  id: number;
  completed: boolean;
  user: string;
  text: string;
  transcript?: string;
  tags?: string[];
};

export type AudioRegion = {
  id: string;
  start: number;
  end: number;
  label: string;
  color: string;
};

// ─── Page Navigation ──────────────────────────────────────────────────────────
export type Page =
  | { name: "dashboard" }
  | { name: "project"; id: number }
  | { name: "label"; id: number; projectId: number; mode: "single" | "batch" }
  | { name: "annotatedBy"; projectId: number };

// ─── Constants ────────────────────────────────────────────────────────────────
export const initialProjects: Project[] = [
  {
    id: 1,
    name: "Customer Support Audio",
    tasks: 1800,
    completed: 254,
    tags: ["Multiple speakers", "Inaudible", "Background noise"],
  },
  {
    id: 2,
    name: "Speech QA – Batch 03",
    tasks: 1800,
    completed: 0,
    tags: ["Multiple speakers", "Inaudible", "Background noise"],
  },
  {
    id: 3,
    name: "Voice Intent Tagging",
    tasks: 420,
    completed: 120,
    tags: ["Multiple speakers", "Inaudible", "Background noise"],
  },
];

export const REGION_COLORS = [
  "rgba(234,179,8,0.35)",
  "rgba(59,130,246,0.35)",
  "rgba(16,185,129,0.35)",
  "rgba(239,68,68,0.35)",
  "rgba(168,85,247,0.35)",
  "rgba(249,115,22,0.35)",
  "rgba(20,184,166,0.35)",
  "rgba(236,72,153,0.35)",
];

export const REGION_SOLID = [
  "rgba(234,179,8,0.9)",
  "rgba(59,130,246,0.9)",
  "rgba(16,185,129,0.9)",
  "rgba(239,68,68,0.9)",
  "rgba(168,85,247,0.9)",
  "rgba(249,115,22,0.9)",
  "rgba(20,184,166,0.9)",
  "rgba(236,72,153,0.9)",
];

// ─── Dev User type (inline — avoids @supabase/supabase-js import in types) ──
// We use a minimal interface here so @/types doesn't depend on supabase-js.
// Index.tsx can still import { User } from "@supabase/supabase-js" directly.
export interface DevUser {
  id: string;
  email?: string;
}

export const isDevUser = (user: DevUser | null): boolean =>
  (user?.id?.startsWith("dev:") ?? false);

// ─── Dev helpers ──────────────────────────────────────────────────────────────
export const DEV_STORAGE_KEY = "annota_dev_progress";

export const loadDevProgress = (): Record<
  number,
  { transcript: string; tags: string[]; completed: boolean }
> => {
  try {
    return JSON.parse(localStorage.getItem(DEV_STORAGE_KEY) ?? "{}") as Record<
      number,
      { transcript: string; tags: string[]; completed: boolean }
    >;
  } catch {
    return {};
  }
};

export const saveDevProgress = (
  taskId: number,
  transcript: string,
  tags: string[],
  completed: boolean
): void => {
  const existing = loadDevProgress();
  existing[taskId] = { transcript, tags, completed };
  localStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(existing));
};

export const buildTasksForProject = (projectId: number, name?: string): Task[] =>
  Array.from({ length: 12 }, (_, i) => ({
    id: projectId * 100000 + 15904 + i,
    completed: false,
    user: "",
    text: `${name ?? "ตัวอย่างข้อความ"} ${i + 1}`,
  }));