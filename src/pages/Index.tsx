// src/pages/index.tsx
// หน้าหลัก — จัดการ auth, routing, project CRUD
// dispatch ไปยัง mode-a / mode-b ตาม project.mode

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileText,
  LogOut,
  Plus,
  Sparkles,
  UserPlus,
  Users,
  UploadCloud,
  X,
  ChevronDown,
  Pencil,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

import ModeAPage from "./annotation/mode-a";
import ModeBPage from "./annotation/mode-b";
import CompareMode from "./annotation/mode-c";
import {
  initialProjects,
  isDevUser,
  loadDevProgress,
  saveDevProgress,
  buildTasksForProject,
  PROJECT_MODES,
} from "@/types";
import type { Page, Project, ProjectMode, Task } from "@/types";

// ─── Supabase row shape ───────────────────────────────────────────────────────
interface TaskProgressRow {
  task_id: number;
  transcript: string | null;
  tags: string[] | null;
  completed: boolean;
}

// ─── AnnotatedBy ──────────────────────────────────────────────────────────────
const AnnotatedBy = ({
  tasks,
  onBack,
}: {
  tasks: Task[];
  onBack: () => void;
}) => {
  const done = tasks.filter((t) => t.completed);
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>
      <div className="mt-3">
        <h1 className="font-display text-3xl font-extrabold">Annotated By</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All tasks completed. {done.length} task
          {done.length === 1 ? "" : "s"} annotated.
        </p>
      </div>
      <Card className="mt-8 overflow-hidden border-border/60 p-0 shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3 text-left">ID</th>
              <th className="px-6 py-3 text-left">Annotated by</th>
              <th className="px-6 py-3 text-left">Text</th>
              <th className="px-6 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {done.map((t) => (
              <tr key={t.id} className="border-t border-border/60">
                <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                  #{t.id}
                </td>
                <td className="px-6 py-4">{t.user}</td>
                <td className="px-6 py-4">{t.text}</td>
                <td className="px-6 py-4">
                  <Badge
                    variant="outline"
                    className="border-accent/30 bg-accent-soft text-accent"
                  >
                    Done
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
};

// ─── ProjectView ──────────────────────────────────────────────────────────────
const ProjectView = ({
  project,
  tasks,
  onBack,
  onLabel,
  onBatchReview,
  onRequestDelete,
  onRequestEdit,
}: {
  project: Project;
  tasks: Task[];
  onBack: () => void;
  onLabel: (id: number, mode?: "single" | "batch") => void;
  onBatchReview: () => void;
  onRequestDelete: (p: Project) => void;
  onRequestEdit: (p: Project) => void;
}) => {
  const firstReviewTask = tasks.find((t) => !t.completed) ?? tasks[0];
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </button>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.completed} of {project.tasks} tasks completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-full px-3 py-2">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onRequestEdit(project)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onRequestDelete(project)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Review mode selector — only shown for mode-a (select) */}
      {(project.mode === "select" || !project.mode) && (
        <Card className="mt-8 border-border/60 p-4 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Review mode
              </p>
              <h2 className="text-lg font-semibold">
                Choose how you want to review this project.
              </h2>
            </div>
            <div className="inline-flex overflow-hidden rounded-full border border-border/60 bg-muted/10 p-1">
              <Button
                variant="default"
                size="sm"
                disabled={!firstReviewTask}
                onClick={() =>
                  firstReviewTask && onLabel(firstReviewTask.id, "single")
                }
                className="rounded-l-full"
              >
                Review one item
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={tasks.length === 0}
                onClick={onBatchReview}
                className="rounded-r-full"
              >
                Review 10 items
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-6 overflow-hidden border-border/60 p-0 shadow-soft">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left">ID</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Annotated by</th>
                <th className="px-6 py-3 text-left">Text</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border/60 transition hover:bg-muted/40"
                >
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                    #{r.id}
                  </td>
                  <td className="px-6 py-4">
                    <Badge
                      variant="outline"
                      className={
                        r.completed
                          ? "border-accent/30 bg-accent-soft text-accent"
                          : "border-border text-muted-foreground"
                      }
                    >
                      {r.completed ? "Done" : "Pending"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{r.user}</td>
                  <td className="px-6 py-4">{r.text}</td>
                  <td className="px-6 py-4 text-right">
                    {r.completed ? (
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-sm text-muted-foreground">Done</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLabel(r.id);
                          }}
                          className="text-accent hover:bg-accent-soft hover:text-accent"
                        >
                          Edit
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLabel(r.id);
                        }}
                        className="text-accent hover:bg-accent-soft hover:text-accent"
                      >
                        Label <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Stat = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) => (
  <Card className="border-border/60 p-5 shadow-soft">
    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
  </Card>
);

const Dashboard = ({
  projects,
  onOpen,
  onCreate,
  onRequestDelete,
  onRequestEdit,
}: {
  projects: Project[];
  onOpen: (id: number) => void;
  onCreate: (
    name: string,
    tags: string[],
    file?: File | null,
    mode?: ProjectMode
  ) => void;
  onRequestDelete: (p: Project) => void;
  onRequestEdit: (p: Project) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const DEFAULT_TAGS = ["Multiple speakers", "Inaudible", "Background noise"];
  const [tags, setTags] = useState<string[]>([...DEFAULT_TAGS]);
  const [tagInput, setTagInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [newMode, setNewMode] = useState<ProjectMode>("select");
  const tagsFull = tags.length >= 6;

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const f = files[0];
    if (
      ![".csv", ".xlsx", ".txt", ".json"].some((e) =>
        f.name.toLowerCase().endsWith(e)
      )
    ) {
      toast.error("Unsupported file. Use CSV, XLSX, TXT, or JSON.");
      return;
    }
    setFile(f);
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (!v || tagsFull) return;
    if (tags.some((t) => t.toLowerCase() === v.toLowerCase())) {
      toast.error("Tag already exists");
      return;
    }
    setTags([...tags, v]);
    setTagInput("");
  };

  const resetModal = () => {
    setNewName("");
    setNewDesc("");
    setTags([...DEFAULT_TAGS]);
    setTagInput("");
    setFile(null);
    setDragOver(false);
    setNewMode("select");
  };

  const totals = useMemo(
    () => ({
      tasks: projects.reduce((s, p) => s + p.tasks, 0),
      done: projects.reduce((s, p) => s + p.completed, 0),
      projects: projects.length,
    }),
    [projects]
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">Dashboard</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">
            Welcome back 👋
          </h1>
          <p className="mt-2 text-muted-foreground">
            Here&apos;s what&apos;s happening in your workspace today.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => toast.info("Invite flow coming soon")}
            className="rounded-full"
          >
            <UserPlus className="mr-2 h-4 w-4" /> Invite members
          </Button>
          <Button
            onClick={() => setOpen(true)}
            className="rounded-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="mr-2 h-4 w-4" /> New project
          </Button>
        </div>
      </div>

      {/* Create project dialog */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetModal();
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-soft sm:max-w-lg">
          <DialogHeader className="shrink-0 space-y-1 px-5 pb-2 pt-5 text-left sm:px-7 sm:pt-6">
            <DialogTitle className="font-display text-xl font-semibold tracking-tight">
              Create new project
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Set up a workspace for your annotation tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:space-y-5 sm:px-7 sm:py-5">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="proj-name" className="text-sm font-medium">
                Project name
              </Label>
              <Input
                id="proj-name"
                placeholder="e.g. Customer Support Audio"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-10 rounded-lg"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="proj-desc" className="text-sm font-medium">
                Description{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="proj-desc"
                placeholder="What's this project about?"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="min-h-16 rounded-lg sm:min-h-20"
              />
            </div>

            {/* Upload */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Upload dataset</Label>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFiles(e.dataTransfer.files);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-5 text-center transition sm:py-7 ${
                  dragOver
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <input
                  type="file"
                  accept=".csv,.xlsx,.txt,.json"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                {file ? (
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-accent" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setFile(null);
                      }}
                      className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="h-7 w-7 text-muted-foreground" />
                    <div className="text-sm">
                      <span className="font-medium text-foreground">
                        Click to upload
                      </span>{" "}
                      <span className="text-muted-foreground">
                        or drag and drop
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      CSV, XLSX, TXT, or JSON
                    </p>
                  </>
                )}
              </label>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Tags</Label>
                <span className="text-xs text-muted-foreground">
                  {tagsFull ? "Maximum tags reached" : "You can add up to 6 tags"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const isDefault = DEFAULT_TAGS.includes(t);
                  return (
                    <span
                      key={t}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        isDefault
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-accent-soft text-accent"
                      }`}
                    >
                      {t}
                      {!isDefault && (
                        <button
                          type="button"
                          onClick={() => setTags(tags.filter((x) => x !== t))}
                          className="rounded-full p-0.5 hover:bg-background/60"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="Add custom tag"
                  value={tagInput}
                  disabled={tagsFull}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="h-9 rounded-lg text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addTag}
                  disabled={tagsFull || !tagInput.trim()}
                  className="h-9 shrink-0 rounded-lg"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Project mode */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Project mode</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {PROJECT_MODES.map((mode) => {
                  const active = newMode === mode.value;
                  return (
                    <Button
                      key={mode.value}
                      type="button"
                      variant="outline"
                      aria-pressed={active}
                      onClick={() => setNewMode(mode.value)}
                      className={`h-10 rounded-lg border text-sm font-medium transition ${
                        active
                          ? "border-accent bg-accent-soft text-accent shadow-glow"
                          : "border-border/70 bg-background hover:border-accent/50 hover:bg-muted/50"
                      }`}
                    >
                      {mode.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 rounded-b-2xl border-t border-border/60 bg-muted/30 px-5 py-3 sm:px-7 sm:py-4">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              disabled={!newName.trim()}
              onClick={() => {
                onCreate(newName.trim(), tags, file, newMode);
                resetModal();
                setOpen(false);
              }}
              className="rounded-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
            >
              <Plus className="mr-1 h-4 w-4" /> Create project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Active projects" value={totals.projects} hint="Across your team" />
        <Stat
          label="Total tasks"
          value={totals.tasks.toLocaleString()}
          hint="Queued for review"
        />
        <Stat
          label="Completed"
          value={totals.done.toLocaleString()}
          hint="Annotated this cycle"
        />
      </div>

      {/* Project list */}
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 p-6 shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold">Recent projects</h3>
            <span className="text-sm text-muted-foreground">
              {projects.length} total
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {projects.map((p) => {
              const pct = p.tasks
                ? Math.round((p.completed / p.tasks) * 100)
                : 0;
              return (
                <div
                  key={p.id}
                  onClick={() => onOpen(p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onOpen(p.id);
                  }}
                  className="group flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4 transition hover:border-accent/40 hover:shadow-soft"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.completed} of {p.tasks} tasks · {pct}%
                      </p>
                    </div>
                  </div>
                  <div className="hidden w-40 sm:block">
                    <Progress value={pct} className="h-2" />
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          aria-label="Project actions"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem
                          className="cursor-pointer gap-2"
                          onClick={() => onRequestEdit(p)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                          onClick={() => onRequestDelete(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="border-border/60 p-6 shadow-soft">
          <h3 className="font-display text-xl font-bold">Resources</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {[
              { icon: BookOpen, label: "Documentation" },
              { icon: FileText, label: "API Reference" },
              { icon: Users, label: "Team guidelines" },
            ].map((r) => (
              <li key={r.label}>
                <a className="flex items-center gap-3 rounded-lg p-3 text-foreground transition hover:bg-muted">
                  <r.icon className="h-4 w-4 text-accent" />
                  <span>{r.label}</span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
};

// ─── TopBar ───────────────────────────────────────────────────────────────────
const TopBar = ({
  user,
  onLogout,
  onHome,
}: {
  user: { email: string };
  onLogout: () => void;
  onHome: () => void;
}) => {
  const initials = user.email.slice(0, 2).toUpperCase();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <button onClick={onHome} className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-accent shadow-glow">
            <Sparkles className="h-4 w-4 text-accent-foreground" />
          </div>
          <span className="font-display text-lg font-bold">Annota</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 rounded-full border border-border bg-card px-2 py-1.5 pr-4 transition hover:shadow-soft">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-gradient-accent text-xs text-accent-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{user.email}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

// ─── Login ────────────────────────────────────────────────────────────────────
const Login = ({ onLocalLogin }: { onLocalLogin?: (u: User) => void }) => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || !pass) {
      toast.error("Please enter email/username and password");
      return;
    }
    setBusy(true);
    try {
      const credentialEmail = email.includes("@")
        ? email.trim()
        : `${email.trim()}@example.com`;
      const isDevLogin = credentialEmail.endsWith("@example.com");
      if (isDevLogin) {
        onLocalLogin?.({
          id: `dev:${credentialEmail}`,
          email: credentialEmail,
        } as unknown as User);
        toast.success(`Signed in (dev): ${email}`);
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: credentialEmail,
          password: pass,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created — you're signed in");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: credentialEmail,
          password: pass,
        });
        if (error) throw error;
        toast.success(`Welcome, ${email.split("@")[0]}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-hero p-12 lg:flex">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-accent shadow-glow">
            <Sparkles className="h-5 w-5 text-accent-foreground" />
          </div>
          <span className="font-display text-xl font-bold">Annota</span>
        </div>
        <div className="relative z-10 max-w-md">
          <Badge className="mb-6 border-0 bg-accent-soft text-accent hover:bg-accent-soft">
            Annotation Platform
          </Badge>
          <h1 className="font-display text-5xl font-extrabold leading-tight tracking-tight">
            Label faster.
            <br />
            Ship smarter.
          </h1>
          <p className="mt-4 max-w-sm text-base text-muted-foreground">
            A modern workspace for high-quality data annotation, built for teams
            who care about clean datasets.
          </p>
        </div>
        <div className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -left-16 top-32 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <p className="relative z-10 text-xs text-muted-foreground">
          © 2026 Annota Labs
        </p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md border-border/60 p-8 shadow-soft sm:p-10">
          <h2 className="font-display text-3xl font-bold">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to resume your labeling progress."
              : "Sign up to start labeling."}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email or username</Label>
              <Input
                id="email"
                type="text"
                placeholder="you@example.com or username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass">Password</Label>
              <Input
                id="pass"
                type="password"
                placeholder="••••••••"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="h-11 w-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
            >
              {busy
                ? "Please wait…"
                : mode === "signin"
                ? "Sign in"
                : "Sign up"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin"
              ? "Don't have an account?"
              : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-medium text-accent hover:underline"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </Card>
      </section>
    </main>
  );
};

// ─── Root Index ───────────────────────────────────────────────────────────────
const Index = () => {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState<Page>({ name: "dashboard" });
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const nextTaskId = useRef(15904);

  const [tasksByProject, setTasksByProject] = useState<
    Record<number, Task[]>
  >(() =>
    Object.fromEntries(
      initialProjects.map((p) => [p.id, buildTasksForProject(p.id, p.name)])
    )
  );
  const [tasksLoaded, setTasksLoaded] = useState(false);

  // ── Delete dialog ──
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const promptDeleteProject = (p: Project) => {
    setProjectToDelete(p);
    setConfirmDeleteOpen(true);
  };
  const confirmDeleteProject = (id?: number) => {
    const pid = id ?? projectToDelete?.id;
    if (!pid) return;
    setProjects((prev) => prev.filter((p) => p.id !== pid));
    setTasksByProject((prev) => {
      const copy = { ...prev };
      delete copy[pid];
      return copy;
    });
    toast.success("Project deleted");
    setConfirmDeleteOpen(false);
    setProjectToDelete(null);
    setPage({ name: "dashboard" });
  };

  // ── Edit dialog ──
  const [editOpen, setEditOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editDragOver, setEditDragOver] = useState(false);

  const promptEditProject = (p: Project) => {
    setProjectToEdit(p);
    setEditName(p.name);
    setEditTags(p.tags ?? []);
    setEditTagInput("");
    setEditFile(null);
    setEditDragOver(false);
    setEditOpen(true);
  };
  const saveEditProject = () => {
    if (!projectToEdit) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectToEdit.id
          ? { ...p, name: editName, tags: editTags }
          : p
      )
    );
    if (editFile) toast.success(`Dataset "${editFile.name}" uploaded`);
    setEditOpen(false);
    setProjectToEdit(null);
    toast.success("Project updated");
  };
  const handleEditFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const f = files[0];
    if (
      ![".csv", ".xlsx", ".txt", ".json"].some((e) =>
        f.name.toLowerCase().endsWith(e)
      )
    ) {
      toast.error("Unsupported file");
      return;
    }
    setEditFile(f);
  };

  // ── Auth ──
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setAuthReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setAuthUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) {
      setTasksByProject(
        Object.fromEntries(
          initialProjects.map((p) => [p.id, buildTasksForProject(p.id, p.name)])
        )
      );
      setTasksLoaded(false);
      return;
    }
    if (isDevUser(authUser)) {
      const saved = loadDevProgress();
      const mergedMap: Record<number, Task[]> = {};
      for (const [pid, base] of Object.entries(tasksByProject)) {
        mergedMap[Number(pid)] = base.map((t) => {
          const r = saved[t.id];
          return r
            ? {
                ...t,
                completed: r.completed,
                user: authUser.email ?? "",
                transcript: r.transcript,
                tags: r.tags,
              }
            : t;
        });
      }
      setTasksByProject(mergedMap);
      setTasksLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("task_progress")
        .select("task_id,transcript,tags,completed")
        .eq("user_id", authUser.id);
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load your progress");
        setTasksLoaded(true);
        return;
      }
      const rows = (data ?? []) as TaskProgressRow[];
      const byId = new Map(rows.map((r) => [r.task_id, r]));
      const mergedMap: Record<number, Task[]> = {};
      for (const [pid, base] of Object.entries(tasksByProject)) {
        mergedMap[Number(pid)] = base.map((t) => {
          const r = byId.get(t.id);
          return r
            ? {
                ...t,
                completed: r.completed,
                user: r.completed ? authUser.email ?? "" : "",
                transcript: r.transcript ?? undefined,
                tags: r.tags ?? [],
              }
            : t;
        });
      }
      setTasksByProject(mergedMap);
      setTasksLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const syncedProjects = useMemo(
    () =>
      projects.map((p) => {
        const pTasks = tasksByProject[p.id] ?? [];
        return {
          ...p,
          mode: p.mode ?? "select",
          tasks: pTasks.length,
          completed: pTasks.filter((t) => t.completed).length,
        };
      }),
    [projects, tasksByProject]
  );

  const go = (p: Page) => setPage(p);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out — your progress is saved");
    setPage({ name: "dashboard" });
  };

  // ── Submit handler ──
  const handleSubmitTask = async (
    submittedId: number,
    transcript: string,
    tags: string[],
    options?: {
      preservePage?: boolean;
      silent?: boolean;
      completed?: boolean;
    }
  ) => {
    if (!authUser) return;
    const { preservePage = false, silent = false, completed } = options ?? {};

    const projectEntry = Object.entries(tasksByProject).find(([, list]) =>
      (list as Task[]).some((t) => t.id === submittedId)
    );
    if (!projectEntry) {
      toast.error("Task not found");
      return;
    }
    const projectId = Number(projectEntry[0]);
    const projectTaskList = projectEntry[1] as Task[];
    const isDemoProject = projects.find((p) => p.id === projectId)?.demo === true;
    const projectTask = projectTaskList.find((t) => t.id === submittedId);
    const shouldComplete =
      completed ?? (tags.length > 0 ? true : projectTask?.completed ?? false);

    const applySavedState = () => {
      setTasksByProject((prev) => {
        const updated = { ...prev };
        updated[projectId] = (updated[projectId] as Task[]).map((t) =>
          t.id === submittedId
            ? {
                ...t,
                completed: shouldComplete,
                user: authUser.email ?? "",
                transcript,
                tags,
              }
            : t
        );
        if (!silent) {
          const next = (updated[projectId] as Task[]).find((t) => !t.completed);
          if (shouldComplete) {
            toast.success(next ? "Submitted" : "All tasks completed 🎉");
          } else {
            toast.warning("Saved as pending. Add tags to complete this item.");
          }
          if (!preservePage && shouldComplete && next) {
            setPage({
              name: "label",
              id: next.id,
              projectId,
              mode: "single",
            });
          } else if (!preservePage && shouldComplete && !next) {
            setPage({ name: "annotatedBy", projectId });
          }
        }
        return updated;
      });
    };

    if (isDevUser(authUser) || isDemoProject) {
      saveDevProgress(submittedId, transcript, tags, shouldComplete);
      applySavedState();
      return;
    }
    const { error } = await supabase.from("task_progress").upsert(
      {
        user_id: authUser.id,
        task_id: submittedId,
        transcript,
        tags,
        completed: shouldComplete,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,task_id" }
    );
    if (error) {
      toast.error("Could not save progress");
      return;
    }
    applySavedState();
  };

  // ── Render guards ──
  if (!authReady)
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  if (!authUser)
    return (
      <Login
        onLocalLogin={(u: User) => {
          setAuthUser(u);
          setAuthReady(true);
        }}
      />
    );

  // ── Determine mode for labeling page ──
  const labelingProjectMode =
    page.name === "label"
      ? syncedProjects.find((p) => p.id === page.projectId)?.mode ?? "select"
      : null;

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        user={{ email: authUser.email ?? "user" }}
        onLogout={handleLogout}
        onHome={() => go({ name: "dashboard" })}
      />

      {/* ── Delete confirm dialog ── */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="rounded-2xl border-border/60 p-0 shadow-soft sm:max-w-md">
          <div className="bg-gradient-hero rounded-t-2xl px-7 pb-5 pt-7">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-destructive/10">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="font-display text-2xl font-bold tracking-tight">
                  Delete project
                </DialogTitle>
                <DialogDescription className="text-sm">
                  This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
          <div className="px-7 py-5">
            <p className="text-sm">
              Are you sure you want to delete &quot;
              <span className="font-semibold">{projectToDelete?.name}</span>
              &quot;?
            </p>
          </div>
          <DialogFooter className="gap-2 rounded-b-2xl border-t border-border/60 bg-muted/30 px-7 py-4">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              onClick={() => confirmDeleteProject()}
              className="rounded-full bg-destructive text-destructive-foreground hover:opacity-95"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit project dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-2xl border-border/60 p-0 shadow-soft sm:max-w-lg">
          <DialogHeader className="space-y-1 px-7 pb-2 pt-6 text-left">
            <DialogTitle className="font-display text-xl font-semibold tracking-tight">
              Edit project
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Update project name, dataset, or tags.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 px-7 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-sm font-medium">
                Project name
              </Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-10 rounded-lg"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Upload dataset{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setEditDragOver(true);
                }}
                onDragLeave={() => setEditDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setEditDragOver(false);
                  handleEditFiles(e.dataTransfer.files);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-7 text-center transition ${
                  editDragOver
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <input
                  type="file"
                  accept=".csv,.xlsx,.txt,.json"
                  className="hidden"
                  onChange={(e) => handleEditFiles(e.target.files)}
                />
                {editFile ? (
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-accent" />
                    <span className="text-sm font-medium">{editFile.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setEditFile(null);
                      }}
                      className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="h-7 w-7 text-muted-foreground" />
                    <p className="text-sm">
                      <span className="font-medium text-foreground">
                        Click to upload
                      </span>{" "}
                      <span className="text-muted-foreground">
                        or drag and drop
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      CSV, XLSX, TXT, or JSON
                    </p>
                  </>
                )}
              </label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Tags</Label>
                <span className="text-xs text-muted-foreground">
                  {editTags.length >= 6 ? "Max reached" : "Up to 6"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {editTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() =>
                        setEditTags((s) => s.filter((x) => x !== t))
                      }
                      className="rounded-full p-0.5 hover:bg-background/60"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="Add custom tag"
                  value={editTagInput}
                  disabled={editTags.length >= 6}
                  onChange={(e) => setEditTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = editTagInput.trim();
                      if (!v || editTags.length >= 6) return;
                      if (
                        editTags.some(
                          (t) => t.toLowerCase() === v.toLowerCase()
                        )
                      ) {
                        toast.error("Tag already exists");
                        return;
                      }
                      setEditTags((s) => [...s, v]);
                      setEditTagInput("");
                    }
                  }}
                  className="h-9 rounded-lg text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const v = editTagInput.trim();
                    if (!v || editTags.length >= 6) return;
                    setEditTags((s) => [...s, v]);
                    setEditTagInput("");
                  }}
                  disabled={editTags.length >= 6 || !editTagInput.trim()}
                  className="h-9 rounded-lg"
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 rounded-b-2xl border-t border-border/60 bg-muted/30 px-7 py-4">
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              disabled={!editName.trim()}
              onClick={saveEditProject}
              className="rounded-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Page routing ── */}
      {page.name === "dashboard" && (
        <Dashboard
          projects={syncedProjects}
          onOpen={(id) => go({ name: "project", id })}
          onCreate={(name, tags, file, mode) => {
            const newId = Math.floor(Date.now() / 1000);
            const np: Project = {
              id: newId,
              name,
              tasks: 0,
              completed: 0,
              tags,
              demo: !!file,
              mode: mode ?? "select",
            };
            setProjects([np, ...projects]);
            setTasksByProject((prev) => ({
              [np.id]: buildTasksForProject(np.id, np.name),
              ...prev,
            }));
            toast.success(
              file
                ? `Project created — file ${file.name} uploaded`
                : "Project created"
            );
          }}
          onRequestDelete={promptDeleteProject}
          onRequestEdit={promptEditProject}
        />
      )}

      {page.name === "project" && (
        <ProjectView
          project={syncedProjects.find((p) => p.id === page.id)!}
          tasks={tasksByProject[page.id] ?? []}
          onBack={() => go({ name: "dashboard" })}
          onLabel={(taskId, mode = "single") =>
            go({ name: "label", id: taskId, projectId: page.id, mode })
          }
          onBatchReview={() => {
            const firstTask = (tasksByProject[page.id] ?? [])[0] as Task | undefined;
            if (firstTask)
              go({ name: "label", id: firstTask.id, projectId: page.id, mode: "batch" });
            else toast.info("This project has no review items yet");
          }}
          onRequestDelete={promptDeleteProject}
          onRequestEdit={promptEditProject}
        />
      )}

      {/* ── Mode dispatcher ── */}
      {page.name === "label" && tasksLoaded && (
        <>
          {labelingProjectMode === "select" && (
            <ModeAPage
              taskId={page.id}
              projectId={page.projectId}
              mode={page.mode}
              tasks={tasksByProject[page.projectId] ?? []}
              projects={projects}
              tasksByProject={tasksByProject}
              onBack={() => go({ name: "project", id: page.projectId })}
              onSubmit={handleSubmitTask}
              onGoTo={(id) =>
                go({ name: "label", id, projectId: page.projectId, mode: page.mode })
              }
            />
          )}

          {labelingProjectMode === "segment" && (
            <ModeBPage
              taskId={page.id}
              projectId={page.projectId}
              mode={page.mode}
              tasks={tasksByProject[page.projectId] ?? []}
              projects={projects}
              tasksByProject={tasksByProject}
              onBack={() => go({ name: "project", id: page.projectId })}
              onSubmit={handleSubmitTask}
              onGoTo={(id) =>
                go({ name: "label", id, projectId: page.projectId, mode: page.mode })
              }
            />
          )}

          {labelingProjectMode === "compare" && (
            <CompareMode
              taskId={page.id}
              projectId={page.projectId}
              tasks={tasksByProject[page.projectId] ?? []}
              project={syncedProjects.find((p) => p.id === page.projectId)!}
              onBack={() => go({ name: "project", id: page.projectId })}
              onSubmit={handleSubmitTask}
              onGoTo={(id) =>
                go({ name: "label", id, projectId: page.projectId, mode: page.mode })
              }
            />
          )}
        </>
      )}

      {page.name === "annotatedBy" && (
        <AnnotatedBy
          tasks={tasksByProject[page.projectId] ?? []}
          onBack={() => go({ name: "dashboard" })}
        />
      )}
    </div>
  );
};

export default Index;