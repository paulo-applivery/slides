"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/Icon";
import { toast } from "@/lib/toast";
import {
  acceptMember,
  changeMemberRole,
  removeMember,
} from "@/lib/member-actions";
import type { Role } from "@/lib/roles";

export type Member = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};
export type PendingUser = { id: string; email: string; name: string | null };

const ROLE_OPTIONS: Role[] = ["admin", "editor", "viewer"];

const selectStyle: React.CSSProperties = {
  height: 30,
  padding: "0 8px",
  borderRadius: 8,
  background: "var(--bg-elev-2)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontSize: 12,
  cursor: "pointer",
};

function initials(email: string, name: string | null) {
  const base = name || email;
  return base
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Settings → Members. Admins can accept pending users, change roles, and
 * remove members. Non-admins see a read-only roster. Last-admin and
 * self-removal are guarded server-side; the UI mirrors those constraints.
 */
export function MembersSettingsCard({
  members,
  pending,
  currentUserId,
  isAdmin,
}: {
  members: Member[];
  pending: PendingUser[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  // Optimistic role overrides keyed by user id (falls back to prop role).
  const [roleOverrides, setRoleOverrides] = useState<Record<string, Role>>({});
  // Default role to grant when accepting a pending user.
  const [acceptRole, setAcceptRole] = useState<Record<string, Role>>({});

  const adminCount = members.filter((m) => m.role === "admin").length;

  function onChangeRole(m: Member, next: Role) {
    if (next === (roleOverrides[m.id] ?? m.role)) return;
    const prev = roleOverrides[m.id] ?? m.role;
    setRoleOverrides((r) => ({ ...r, [m.id]: next }));
    startTransition(async () => {
      try {
        await changeMemberRole(m.id, next);
        toast.success({ title: "Role updated" });
        router.refresh();
      } catch (err) {
        setRoleOverrides((r) => ({ ...r, [m.id]: prev })); // revert
        toast.error({
          title: "Couldn't change role",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  function onAccept(u: PendingUser) {
    const role = acceptRole[u.id] ?? "editor";
    startTransition(async () => {
      try {
        await acceptMember(u.id, role);
        toast.success({ title: `${u.email} added` });
        router.refresh();
      } catch (err) {
        toast.error({
          title: "Couldn't accept user",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  function onRemove(m: Member) {
    startTransition(async () => {
      try {
        await removeMember(m.id);
        toast.success({ title: "Member removed" });
        router.refresh();
      } catch (err) {
        toast.error({
          title: "Couldn't remove member",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <section className="card" style={{ maxWidth: 680 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
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
          <Icons.Settings size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 className="t-h4" style={{ margin: 0 }}>
            Members
          </h2>
          <p className="t-small" style={{ margin: 0, color: "var(--text-tertiary)" }}>
            {members.length} {members.length === 1 ? "member" : "members"}
            {isAdmin && pending.length > 0 ? ` · ${pending.length} pending` : ""}
          </p>
        </div>
      </header>

      {/* ---- Pending (admin only) ---- */}
      {isAdmin && pending.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <h3 className="t-micro" style={{ color: "var(--text-secondary)", margin: "0 0 10px" }}>
            Pending requests
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "var(--bg-elev-1)",
                  border: "1px solid var(--border)",
                }}
              >
                <Avatar email={u.email} name={u.name} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="t-small" style={{ color: "var(--text-primary)" }}>
                    {u.name || u.email}
                  </div>
                  {u.name ? (
                    <div className="t-micro" style={{ color: "var(--text-muted)" }}>
                      {u.email}
                    </div>
                  ) : null}
                </div>
                <select
                  aria-label="Role to grant"
                  value={acceptRole[u.id] ?? "editor"}
                  onChange={(e) =>
                    setAcceptRole((r) => ({ ...r, [u.id]: e.target.value as Role }))
                  }
                  disabled={busy}
                  style={selectStyle}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onAccept(u)}
                  disabled={busy}
                >
                  <Icons.Check size={13} /> Accept
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---- Member roster ---- */}
      <div style={{ marginTop: isAdmin && pending.length > 0 ? 20 : 18 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {members.map((m, i) => {
            const role = roleOverrides[m.id] ?? m.role;
            const isSelf = m.id === currentUserId;
            const lastAdmin = m.role === "admin" && adminCount <= 1;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 2px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <Avatar email={m.email} name={m.name} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="t-small" style={{ color: "var(--text-primary)" }}>
                    {m.name || m.email}
                    {isSelf ? (
                      <span style={{ color: "var(--text-muted)" }}> (you)</span>
                    ) : null}
                  </div>
                  {m.name ? (
                    <div className="t-micro" style={{ color: "var(--text-muted)" }}>
                      {m.email}
                    </div>
                  ) : null}
                </div>

                {isAdmin ? (
                  <>
                    <select
                      aria-label={`Role for ${m.email}`}
                      value={role}
                      onChange={(e) => onChangeRole(m, e.target.value as Role)}
                      disabled={busy || lastAdmin}
                      title={lastAdmin ? "The last admin's role can't be changed" : undefined}
                      style={{ ...selectStyle, opacity: lastAdmin ? 0.6 : 1 }}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      aria-label={`Remove ${m.email}`}
                      onClick={() => onRemove(m)}
                      disabled={busy || isSelf || lastAdmin}
                      title={
                        isSelf
                          ? "You can't remove yourself"
                          : lastAdmin
                            ? "Can't remove the last admin"
                            : "Remove member"
                      }
                    >
                      <Icons.Close size={14} />
                    </button>
                  </>
                ) : (
                  <span
                    className="t-micro"
                    style={{
                      color: "var(--text-secondary)",
                      textTransform: "capitalize",
                    }}
                  >
                    {role}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Avatar({ email, name }: { email: string; name: string | null }) {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        borderRadius: "50%",
        background: "var(--primary)",
        color: "#fff",
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      {initials(email, name)}
    </div>
  );
}
