import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type Project = { id: number; name: string; tasks: number; completed: number };
type Task = {
  id: number;
  completed: boolean;
  user: string;
  text: string;
  transcript?: string;
  tags?: string[];
};
type Page =
  | { name: "dashboard" }
  | { name: "project"; id: number }
  | { name: "label"; id: number }
  | { name: "annotatedBy"; projectId: number };

const initialProjects: Project[] = [
  { id: 1, name: "Customer Support Audio", tasks: 1800, completed: 254 },
  { id: 2, name: "Speech QA – Batch 03", tasks: 1800, completed: 0 },
  { id: 3, name: "Voice Intent Tagging", tasks: 420, completed: 120 },
];

const buildInitialTasks = (): Task[] =>
  Array.from({ length: 12 }, (_, i) => ({
    id: 15904 + i,
    completed: false,
    user: "",
    text: `ตัวอย่างข้อความ ${i + 1}`,
  }));

const Index = () => {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState<Page>({ name: "dashboard" });
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [tasks, setTasks] = useState<Task[]>(buildInitialTasks());
  const [tasksLoaded, setTasksLoaded] = useState(false);

  // Auth bootstrap — listener first, then session.
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

  // Load this user's saved progress and merge into the local task list.
  useEffect(() => {
    if (!authUser) {
      setTasks(buildInitialTasks());
      setTasksLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("task_progress")
        .select("task_id, transcript, tags, completed")
        .eq("user_id", authUser.id);
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load your progress");
        setTasksLoaded(true);
        return;
      }
      const base = buildInitialTasks();
      const byId = new Map(data?.map((r) => [r.task_id, r]) ?? []);
      const merged = base.map((t) => {
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
      setTasks(merged);
      setTasksLoaded(true);
      // If everything done, jump to AnnotatedBy.
      if (merged.every((t) => t.completed)) {
        setPage({ name: "annotatedBy", projectId: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const syncedProjects = useMemo(
    () =>
      projects.map((p) =>
        p.id === 1
          ? { ...p, tasks: tasks.length, completed: tasks.filter((t) => t.completed).length }
          : p
      ),
    [projects, tasks]
  );

  const go = (p: Page) => setPage(p);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out — your progress is saved");
    setPage({ name: "dashboard" });
  };

  const handleSubmitTask = async (
    submittedId: number,
    transcript: string,
    tags: string[]
  ) => {
    if (!authUser) return;
    const { error } = await supabase.from("task_progress").upsert(
      {
        user_id: authUser.id,
        task_id: submittedId,
        transcript,
        tags,
        completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,task_id" }
    );
    if (error) {
      toast.error("Could not save progress");
      return;
    }
    const updated = tasks.map((t) =>
      t.id === submittedId
        ? { ...t, completed: true, user: authUser.email ?? "", transcript, tags }
        : t
    );
    setTasks(updated);
    const next = updated.find((t) => !t.completed);
    if (next) {
      toast.success("Submitted");
      go({ name: "label", id: next.id });
    } else {
      toast.success("All tasks completed");
      go({ name: "annotatedBy", projectId: 0 });
    }
  };

  if (!authReady) {
    return <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">Loading…</div>;
  }

  if (!authUser) {
    return <Login onLocalLogin={(u: User) => { setAuthUser(u); setAuthReady(true); }} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        user={{ email: authUser.email ?? "user" }}
        onLogout={handleLogout}
        onHome={() => go({ name: "dashboard" })}
      />
      {page.name === "dashboard" && (
        <Dashboard
          projects={syncedProjects}
          onOpen={(id) => go({ name: "project", id })}
          onCreate={(name) => {
            const np = { id: Date.now(), name, tasks: 0, completed: 0 };
            setProjects([np, ...projects]);
            toast.success("Project created");
          }}
        />
      )}
      {page.name === "project" && (
        <ProjectView
          project={syncedProjects.find((p) => p.id === page.id)!}
          tasks={tasks}
          onBack={() => go({ name: "dashboard" })}
          onLabel={(taskId) => go({ name: "label", id: taskId })}
        />
      )}
      {page.name === "label" && tasksLoaded && (
        <Labeling
          taskId={page.id}
          tasks={tasks}
          onBack={() => go({ name: "dashboard" })}
          onSubmit={handleSubmitTask}
        />
      )}
      {page.name === "annotatedBy" && (
        <AnnotatedBy tasks={tasks} onBack={() => go({ name: "dashboard" })} />
      )}
    </div>
  );
};

/* ---------------- TopBar ---------------- */
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
            <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

/* ---------------- Login ---------------- */
const Login = ({ onLocalLogin }: { onLocalLogin?: (u: User) => void }) => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pass) {
      toast.error("Please enter email/username and password");
      return;
    }
    setBusy(true);
    try {
      // Accept either full email or a simple username for testing.
      // If the input doesn't contain '@', append a test domain so Supabase can accept it.
      const credentialEmail = email.includes("@") ? email.trim() : `${email.trim()}@example.com`;

      // If this is a test username (we appended @example.com) allow a local/dev login
      const isDevLogin = credentialEmail.endsWith("@example.com");
      if (isDevLogin) {
        // Bypass Supabase for quick local testing — create a lightweight User object
        const devUser = { id: `dev:${credentialEmail}`, email: credentialEmail } as unknown as User;
        onLocalLogin?.(devUser);
        toast.success(`Signed in (dev): ${email}`);
      } else {
        if (mode === "signup") {
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
          const display = email.includes("@") ? email.split("@")[0] : email;
          toast.success(`Welcome, ${display}`);
        }
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Authentication failed");
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
            Label faster.<br />
            Ship smarter.
          </h1>
          <p className="mt-4 max-w-sm text-base text-muted-foreground">
            A modern workspace for high-quality data annotation, built for teams who care about clean datasets.
          </p>
        </div>
        <div className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -left-16 top-32 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <p className="relative z-10 text-xs text-muted-foreground">© 2026 Annota Labs</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md border-border/60 p-8 shadow-soft sm:p-10">
          <h2 className="font-display text-3xl font-bold">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to resume your labeling progress. You may enter username or email."
              : "Sign up to start labeling — you can provide a username or email for testing."}
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
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="h-11 w-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Don't have an account?" : "Already have an account?"} {" "}
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

/* ---------------- Dashboard ---------------- */
const Dashboard = ({
  projects,
  onOpen,
  onCreate,
}: {
  projects: Project[];
  onOpen: (id: number) => void;
  onCreate: (name: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const totals = useMemo(() => {
    const tasks = projects.reduce((s, p) => s + p.tasks, 0);
    const done = projects.reduce((s, p) => s + p.completed, 0);
    return { tasks, done, projects: projects.length };
  }, [projects]);
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">Dashboard</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">Welcome back 👋</h1>
          <p className="mt-2 text-muted-foreground">Here's what's happening in your workspace today.</p>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl border-border/60 p-0 shadow-soft sm:max-w-md">
          <div className="bg-gradient-hero rounded-t-2xl px-7 pb-5 pt-7">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-accent shadow-glow">
                <Plus className="h-5 w-5 text-accent-foreground" />
              </div>
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="font-display text-2xl font-bold tracking-tight">
                  Create new project
                </DialogTitle>
                <DialogDescription className="text-sm">
                  Set up a workspace for your annotation tasks.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
          <div className="space-y-5 px-7 py-6">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Project name</Label>
              <Input
                id="proj-name"
                placeholder="e.g. Customer Support Audio"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-11 rounded-xl"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-desc">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="proj-desc"
                placeholder="What's this project about?"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="min-h-24 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 rounded-b-2xl border-t border-border/60 bg-muted/30 px-7 py-4">
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button
              disabled={!newName.trim()}
              onClick={() => {
                onCreate(newName.trim());
                setNewName("");
                setNewDesc("");
                setOpen(false);
              }}
              className="rounded-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
            >
              <Plus className="mr-1 h-4 w-4" /> Create project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Active projects" value={totals.projects} hint="Across your team" />
        <Stat label="Total tasks" value={totals.tasks.toLocaleString()} hint="Queued for review" />
        <Stat label="Completed" value={totals.done.toLocaleString()} hint="Annotated this cycle" />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 p-6 shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold">Recent projects</h3>
            <span className="text-sm text-muted-foreground">{projects.length} total</span>
          </div>
          <div className="mt-5 space-y-3">
            {projects.map((p) => {
              const pct = p.tasks ? Math.round((p.completed / p.tasks) * 100) : 0;
              return (
                <div
                  key={p.id}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4 transition hover:border-accent/40 hover:shadow-soft"
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
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpen(p.id)}
                    className="rounded-full text-accent hover:bg-accent-soft hover:text-accent"
                  >
                    Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
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

const Stat = ({ label, value, hint }: { label: string; value: string | number; hint: string }) => (
  <Card className="border-border/60 p-5 shadow-soft">
    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
  </Card>
);

/* ---------------- Project View ---------------- */
const ProjectView = ({
  project,
  tasks,
  onBack,
  onLabel,
}: {
  project: Project;
  tasks: Task[];
  onBack: () => void;
  onLabel: (id: number) => void;
}) => {
  const rows = tasks;
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </button>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.completed} of {project.tasks} tasks completed
          </p>
        </div>
      </div>
      <Card className="mt-8 overflow-hidden border-border/60 p-0 shadow-soft">
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
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60 transition hover:bg-muted/40">
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground">#{r.id}</td>
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
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={r.completed}
                      onClick={() => onLabel(r.id)}
                      className="text-accent hover:bg-accent-soft hover:text-accent disabled:opacity-40"
                    >
                      {r.completed ? "Done" : <>Label <ArrowRight className="ml-1 h-3.5 w-3.5" /></>}
                    </Button>
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

/* ---------------- Labeling ---------------- */
const Labeling = ({
  taskId,
  tasks,
  onBack,
  onSubmit,
}: {
  taskId: number;
  tasks: Task[];
  onBack: () => void;
  onSubmit: (id: number, transcript: string, tags: string[]) => Promise<void> | void;
}) => {
  const current = tasks.find((t) => t.id === taskId);
  const sidebar = tasks.slice(0, 6);
  const TAG_OPTIONS = ["Multiple speakers", "Inaudible", "Background noise"];
  const [transcript, setTranscript] = useState(current?.text ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Reset all label state whenever the active task changes — no carry-over.
  useEffect(() => {
    setTranscript(current?.text ?? "");
    setSelectedTags([]);
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );

  const handleSubmit = async () => {
    setBusy(true);
    try {
      await onSubmit(taskId, transcript, selectedTags);
      setSelectedTags([]);
      setTranscript("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <p className="text-sm text-muted-foreground">
          Projects / Labeling · <span className="font-mono text-foreground">#{taskId}</span>
        </p>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr_300px]">
        <Card className="border-border/60 p-5 shadow-soft">
          <h4 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Tasks</h4>
          <div className="mt-4 space-y-2">
            {sidebar.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                  t.id === taskId
                    ? "border-accent/40 bg-accent-soft"
                    : t.completed
                    ? "border-border/60 bg-muted/40 opacity-60"
                    : "border-border/60 bg-card"
                }`}
              >
                <span className="font-mono text-xs text-muted-foreground">#{t.id}</span>
                <span className="truncate">{t.text}</span>
                {t.completed && <Badge variant="outline" className="ml-auto border-accent/30 bg-accent-soft text-accent">Done</Badge>}
              </div>
            ))}
          </div>
        </Card>
        <Card className="border-border/60 p-6 shadow-soft">
          <div className="relative h-24 overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/70">
            <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-80">
              {Array.from({ length: 60 }).map((_, i) => {
                const h = 10 + Math.abs(Math.sin(i * 0.6)) * 60;
                return <rect key={i} x={i * 7} y={(80 - h) / 2} width={3} height={h} fill="hsl(var(--accent))" rx={1.5} />;
              })}
            </svg>
          </div>
          <h3 className="mt-6 font-display text-lg font-bold">Transcription</h3>
          <p className="mt-1 text-xs text-muted-foreground">Please correct the transcript if needed.</p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="mt-3 min-h-24 w-full resize-none rounded-xl border border-border bg-background p-4 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <div className="mt-6">
            <h4 className="text-sm font-semibold">Tag any that apply</h4>
            <div className="mt-3 space-y-2">
              {TAG_OPTIONS.map((t) => (
                <label key={t} className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 text-sm hover:border-accent/40">
                  <Checkbox
                    checked={selectedTags.includes(t)}
                    onCheckedChange={() => toggleTag(t)}
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" className="rounded-full">Skip</Button>
            <Button onClick={handleSubmit} disabled={busy} className="rounded-full bg-gradient-accent text-accent-foreground shadow-glow hover:opacity-95">
              {busy ? "Saving…" : "Submit"} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </Card>
        <Card className="border-border/60 p-5 shadow-soft">
          <h4 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Region details</h4>
          <p className="mt-3 text-sm text-muted-foreground">
            Select a region on the waveform to view its properties, metadata and available actions.
          </p>
        </Card>
      </div>
    </main>
  );
};

/* ---------------- AnnotatedBy ---------------- */
const AnnotatedBy = ({ tasks, onBack }: { tasks: Task[]; onBack: () => void }) => {
  const done = tasks.filter((t) => t.completed);
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>
      <div className="mt-3">
        <h1 className="font-display text-3xl font-extrabold">Annotated By</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All tasks have been completed. {done.length} task{done.length === 1 ? "" : "s"} annotated.
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
                <td className="px-6 py-4 font-mono text-xs text-muted-foreground">#{t.id}</td>
                <td className="px-6 py-4">{t.user}</td>
                <td className="px-6 py-4">{t.text}</td>
                <td className="px-6 py-4">
                  <Badge variant="outline" className="border-accent/30 bg-accent-soft text-accent">Done</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
};

export default Index;
