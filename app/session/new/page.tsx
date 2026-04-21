"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useOrganization } from "@clerk/nextjs";

const COLORS = {
  bg: "#1e293b",
  surface: "#1f2937",
  border: "#334155",
  text: "#f8fafc",
  textMuted: "#cbd5e1",
  textSubtle: "#94a3b8",
  accent: "#d6b678",
  danger: "#f87171",
};

export default function NewSessionPage() {
  const router = useRouter();
  const { userId, orgId } = useAuth();
  const { organization } = useOrganization();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!orgId) { setError("You need to be part of a family first."); return; }
    setBusy(true); setError("");
    const email = localStorage.getItem(`email_${userId}`) || "";
    const name = localStorage.getItem(`name_${userId}`) || "";
    try {
      const res = await fetch("/api/session/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.sessionId) { router.push(`/session/${data.sessionId}`); return; }
        setError(data.error || "Failed to create session.");
        setBusy(false); return;
      }
      router.push(`/session/${data.sessionId}`);
    } catch {
      setError("Something went wrong.");
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!orgId) { setError("You need to be part of a family first."); return; }
    setBusy(true); setError("");
    const email = localStorage.getItem(`email_${userId}`) || "";
    const name = localStorage.getItem(`name_${userId}`) || "";
    try {
      const res = await fetch("/api/session/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No pending session found.");
        setBusy(false); return;
      }
      router.push(`/session/${data.sessionId}`);
    } catch {
      setError("Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="new-session-page" style={styles.container}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 40 }}>⚖️</div>
        <h1 style={styles.title}>Start a Session</h1>
        {organization && <p style={{ color: COLORS.accent, fontSize: 14, margin: "4px 0 0" }}>{organization.name}</p>}
      </div>

      {!orgId && (
        <div style={{ ...styles.card, maxWidth: 500, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
          <h3 style={{ color: COLORS.text, marginBottom: 12 }}>You need a family first</h3>
          <p style={{ color: COLORS.textMuted, fontSize: 14, lineHeight: 1.6 }}>
            Use the family selector in the top right to create or join one.
          </p>
        </div>
      )}

      {orgId && (
        <div style={{ display: "grid", gap: 16, maxWidth: 500, width: "100%" }}>
          <div style={styles.card}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
            <h3 style={{ color: COLORS.text, margin: "0 0 8px" }}>Start a new session</h3>
            <p style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              You'll submit your account first. Your partner gets emailed to log in and submit theirs.
            </p>
            <button style={{ ...styles.btn, width: "100%" }} onClick={handleCreate} disabled={busy}>
              {busy ? "Creating..." : "Create New Session"}
            </button>
          </div>

          <div style={styles.card}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🤝</div>
            <h3 style={{ color: COLORS.text, margin: "0 0 8px" }}>My partner already started one</h3>
            <p style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              Join the pending session in your family.
            </p>
            <button style={{ ...styles.btnSecondary, width: "100%" }} onClick={handleJoin} disabled={busy}>
              {busy ? "Joining..." : "Join Pending Session"}
            </button>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.btnGhost} onClick={() => router.push("/")}>← Back to Dashboard</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "calc(100vh - 60px)", background: COLORS.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 14px", fontFamily: "'Georgia', serif" },
  title: { color: COLORS.text, fontSize: 28, fontWeight: 400, margin: "8px 0 0" },
  card: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 },
  btn: { background: COLORS.accent, color: "#0f172a", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { background: "transparent", color: COLORS.accent, border: `1px solid ${COLORS.accent}`, borderRadius: 8, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "transparent", color: COLORS.textSubtle, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  error: { color: COLORS.danger, fontSize: 13, textAlign: "center" },
};
