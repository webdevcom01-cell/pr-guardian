"use client";
import { useState, useEffect } from "react";
import { GitBranch, Plus, Trash2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Repo {
  id: string;
  fullName: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { pullRequests: number };
}

interface GitHubRepo {
  id: number;
  full_name: string;
  description: string | null;
  private: boolean;
}

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState<number | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => { fetchRepos(); }, []);

  async function fetchRepos() {
    setLoading(true);
    const res = await fetch("/api/repos");
    const data = await res.json() as { data: Repo[] };
    setRepos(data.data ?? []);
    setLoading(false);
  }

  async function openAdd() {
    setShowAdd(true);
    const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: { Authorization: `token ${document.cookie}` },
    });
    if (!res.ok) return;
    const data = await res.json() as GitHubRepo[];
    setGhRepos(data);
  }

  async function connectRepo(ghRepo: GitHubRepo) {
    setConnecting(ghRepo.id);
    await fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: ghRepo.full_name, githubId: ghRepo.id, description: ghRepo.description }),
    });
    await fetchRepos();
    setShowAdd(false);
    setConnecting(null);
  }

  async function removeRepo(id: string) {
    if (!confirm("Disconnect this repository? Webhook will be removed.")) return;
    setRemoving(id);
    await fetch(`/api/repos/${id}`, { method: "DELETE" });
    await fetchRepos();
    setRemoving(null);
  }

  const filtered = ghRepos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Repositories</h1>
          <p className="mt-1 text-sm text-zinc-400">Connect GitHub repos to enable AI code review on every PR.</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500">
          <Plus className="h-4 w-4" /> Connect Repo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : repos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-16 text-center">
          <GitBranch className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
          <p className="font-medium text-zinc-300">No repositories connected</p>
          <p className="mt-1 text-sm text-zinc-500">Click "Connect Repo" to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {repos.map((repo) => (
            <div key={repo.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4">
              <div className="flex items-center gap-3">
                <GitBranch className="h-4 w-4 text-zinc-500" />
                <div>
                  <p className="font-medium text-zinc-100">{repo.fullName}</p>
                  {repo.description && <p className="text-xs text-zinc-500">{repo.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-zinc-500">{repo._count.pullRequests} PRs reviewed</span>
                {repo.isActive
                  ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle className="h-3 w-3" /> Active</span>
                  : <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="h-3 w-3" /> Inactive</span>
                }
                <button onClick={() => removeRepo(repo.id)} disabled={removing === repo.id}
                  className="rounded p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400">
                  {removing === repo.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add repo modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="mb-4 font-semibold text-zinc-100">Connect a Repository</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories..." autoFocus
              className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-violet-500" />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filtered.map((r) => (
                <button key={r.id} onClick={() => connectRepo(r)} disabled={connecting === r.id}
                  className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-zinc-800",
                    repos.some((cr) => cr.fullName === r.full_name) && "opacity-40 pointer-events-none")}>
                  <span className="text-zinc-100">{r.full_name}</span>
                  {connecting === r.id
                    ? <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                    : repos.some((cr) => cr.fullName === r.full_name)
                      ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                      : <Plus className="h-4 w-4 text-zinc-400" />}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAdd(false)}
              className="mt-4 w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
