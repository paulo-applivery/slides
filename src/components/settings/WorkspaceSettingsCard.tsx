"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Icons } from "@/components/ui/Icon";
import { toast } from "@/lib/toast";
import {
  createWorkspace,
  deleteWorkspace,
  updateWorkspace,
  type JoinPolicy,
} from "@/lib/workspace-actions";

export type WorkspaceSettings = {
  id: string;
  name: string;
  domain: string | null;
  joinPolicy: JoinPolicy;
  createdAt: string; // pre-formatted on the server
};

const inputStyle: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 10,
  background: "var(--bg-elev-2)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontSize: 13,
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  marginBottom: 6,
  display: "block",
};

/**
 * Settings → Workspace card. Full CRUD for admins:
 *  - Read   : current name / domain / join policy / created date
 *  - Update : inline editable form, saved via `updateWorkspace`
 *  - Create : spin up a new workspace and switch into it
 *  - Delete : danger zone with type-to-confirm, then hop to a fallback
 *             workspace (or sign out if it was the last one)
 *
 * Non-admins see a read-only summary.
 */
export function WorkspaceSettingsCard({
  workspace,
  isAdmin,
}: {
  workspace: WorkspaceSettings;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(workspace.name);
  const [domain, setDomain] = useState(workspace.domain ?? "");
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(workspace.joinPolicy);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const dirty =
    name.trim() !== workspace.name ||
    (domain.trim() || "") !== (workspace.domain ?? "") ||
    joinPolicy !== workspace.joinPolicy;

  function resetForm() {
    setName(workspace.name);
    setDomain(workspace.domain ?? "");
    setJoinPolicy(workspace.joinPolicy);
  }

  function save() {
    if (!dirty || pending) return;
    startTransition(async () => {
      try {
        await updateWorkspace({
          id: workspace.id,
          name: name.trim(),
          domain: domain.trim() || null,
          joinPolicy,
        });
        toast.success({ title: "Workspace updated" });
        router.refresh();
      } catch (err) {
        toast.error({
          title: "Couldn't update workspace",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  function create() {
    const n = newName.trim();
    if (!n || pending) return;
    startTransition(async () => {
      try {
        const { id } = await createWorkspace(n);
        await update({ workspaceId: id });
        toast.success({ title: "Workspace created" });
        setCreating(false);
        setNewName("");
        router.refresh();
      } catch (err) {
        toast.error({
          title: "Couldn't create workspace",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  function remove() {
    if (confirmText !== workspace.name || pending) return;
    startTransition(async () => {
      try {
        const { nextWorkspaceId } = await deleteWorkspace(workspace.id);
        toast.success({ title: "Workspace deleted" });
        if (nextWorkspaceId) {
          await update({ workspaceId: nextWorkspaceId });
          router.refresh();
        } else {
          // No workspaces left — nothing to show; bounce to sign-in.
          await signOut({ callbackUrl: "/login" });
        }
      } catch (err) {
        toast.error({
          title: "Couldn't delete workspace",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <section className="card" style={{ maxWidth: 680 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            borderRadius: 9,
            background: "var(--primary-soft)",
            color: "var(--primary)",
          }}
        >
          <Icons.Globe size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 className="t-h4" style={{ margin: 0 }}>
            Workspace
          </h2>
          <p className="t-small" style={{ margin: 0, color: "var(--text-tertiary)" }}>
            Created {workspace.createdAt}
          </p>
        </div>
      </header>

      {/* ---- Read-only summary for non-admins ---- */}
      {!isAdmin ? (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            gap: "10px 16px",
            margin: "18px 0 0",
            fontSize: 13,
          }}
        >
          <dt style={{ color: "var(--text-tertiary)" }}>Name</dt>
          <dd style={{ margin: 0, color: "var(--text-primary)" }}>{workspace.name}</dd>
          <dt style={{ color: "var(--text-tertiary)" }}>Domain</dt>
          <dd style={{ margin: 0, color: "var(--text-primary)" }}>
            {workspace.domain ?? "—"}
          </dd>
          <dt style={{ color: "var(--text-tertiary)" }}>Join policy</dt>
          <dd style={{ margin: 0, color: "var(--text-primary)" }}>
            {workspace.joinPolicy}
          </dd>
        </dl>
      ) : (
        <>
          {/* ---- Editable form (Update) ---- */}
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="t-micro" style={labelStyle} htmlFor="ws-name">
                Name
              </label>
              <input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="t-micro" style={labelStyle} htmlFor="ws-domain">
                Domain <span style={{ color: "var(--text-muted)" }}>(optional)</span>
              </label>
              <input
                id="ws-domain"
                value={domain}
                placeholder="acme.com"
                onChange={(e) => setDomain(e.target.value)}
                disabled={pending}
                style={inputStyle}
              />
              <p className="t-small" style={{ color: "var(--text-muted)", margin: "6px 0 0" }}>
                New users with this email domain auto-join when the policy is
                domain-auto.
              </p>
            </div>
            <div>
              <label className="t-micro" style={labelStyle} htmlFor="ws-policy">
                Join policy
              </label>
              <select
                id="ws-policy"
                value={joinPolicy}
                onChange={(e) => setJoinPolicy(e.target.value as JoinPolicy)}
                disabled={pending}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="domain-auto">domain-auto — anyone on the domain joins</option>
                <option value="invite-only">invite-only — admins add members</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={save}
                disabled={!dirty || pending}
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
              {dirty ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={resetForm}
                  disabled={pending}
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>

          {/* ---- Create ---- */}
          <div
            style={{
              marginTop: 20,
              paddingTop: 18,
              borderTop: "1px solid var(--border)",
            }}
          >
            {creating ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label className="t-micro" style={labelStyle} htmlFor="ws-new">
                  New workspace name
                </label>
                <input
                  id="ws-new"
                  autoFocus
                  value={newName}
                  placeholder="e.g. Acme Inc"
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                    if (e.key === "Escape") {
                      setCreating(false);
                      setNewName("");
                    }
                  }}
                  disabled={pending}
                  style={inputStyle}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={create}
                    disabled={pending || !newName.trim()}
                  >
                    {pending ? "Creating…" : "Create & switch"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                    }}
                    disabled={pending}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCreating(true)}
                disabled={pending}
                style={{ paddingLeft: 0 }}
              >
                <Icons.Plus size={14} /> Create another workspace
              </button>
            )}
          </div>

          {/* ---- Delete (danger zone) ---- */}
          <div
            style={{
              marginTop: 20,
              paddingTop: 18,
              borderTop: "1px solid var(--border)",
            }}
          >
            <h3 className="t-micro" style={{ color: "var(--danger)", margin: "0 0 4px" }}>
              Danger zone
            </h3>
            <p className="t-small" style={{ color: "var(--text-tertiary)", margin: "0 0 12px" }}>
              Deleting a workspace permanently removes it and all of its data
              (dashboards, slideshows, queries, synced records). This cannot be
              undone.
            </p>
            {confirmDelete ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label className="t-small" htmlFor="ws-confirm" style={{ color: "var(--text-secondary)" }}>
                  Type <strong style={{ color: "var(--text-primary)" }}>{workspace.name}</strong> to confirm
                </label>
                <input
                  id="ws-confirm"
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={pending}
                  style={inputStyle}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={remove}
                    disabled={pending || confirmText !== workspace.name}
                  >
                    {pending ? "Deleting…" : "Delete workspace"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setConfirmDelete(false);
                      setConfirmText("");
                    }}
                    disabled={pending}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
              >
                <Icons.Close size={14} /> Delete workspace
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
