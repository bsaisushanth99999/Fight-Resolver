"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useOrganization, useUser, Show } from "@clerk/nextjs";

interface SessionSummary {
  _id: string;
  status: string;
  scenario?: { combined?: string };
  majorityVerdict?: string;
  createdAt: string;
  completedAt?: string;
  names?: { personA?: string; personB?: string };
}

const COLORS = {
  bg: "#1e293b",
  surface: "#1f2937",
  surfaceAlt: "#0f172a",
  border: "#334155",
  text: "#f8fafc",
  textMuted: "#cbd5e1",
  textSubtle: "#94a3b8",
  accent: "#d6b678",
  warning: "#f59e0b",
  info: "#60a5fa",
  success: "#4ade80",
  danger: "#f87171",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  waiting_for_b: { label: "Waiting for partner", color: COLORS.warning },
  highlighting_a: { label: "Review & Highlight", color: COLORS.info },
  highlighting_b: { label: "Partner reviewing", color: COLORS.info },
  responding_a: { label: "Your response needed", color: COLORS.accent },
  responding_b: { label: "Partner responding", color: COLORS.accent },
  judging: { label: "Panel deliberating", color: COLORS.textMuted },
  results: { label: "Verdict in", color: COLORS.success },
};

export default function Dashboard() {
  const router = useRouter();
  const { userId, orgId } = useAuth();
  const { organization } = useOrganization();
  const { user } = useUser();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const savedEmail = localStorage.getItem(`email_${userId}`);
    const savedName = localStorage.getItem(`name_${userId}`);
    // Only show modal if EITHER email or name is missing
    if (!savedEmail || !savedName) {
      setShowProfileModal(true);
      setEmail(savedEmail || "");
      setName(savedName || user?.firstName || "");
    }
    fetchSessions();
  }, [userId, orgId, user?.firstName]);

  async function fetchSessions() {
    if (!orgId) { setLoading(false); return; }
    try {
      const res = await fetch("/api/session/list");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch { }
    finally { setLoading(false); }
  }

  function handleSaveProfile() {
    if (!email.includes("@") || !name.trim()) return;
    localStorage.setItem(`email_${userId}`, email);
    localStorage.setItem(`name_${userId}`, name.trim());
    setShowProfileModal(false);
  }

  const active = sessions.filter((s) => s.status !== "results");
  const past = sessions.filter((s) => s.status === "results");

  return (
    <div className="dashboard-page" style={styles.container}>
      <Show when="signed-out">
        <div style={{ ...styles.card, maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚖️</div>
          <h2 style={styles.heading}>Welcome to The Arbitration Panel</h2>
          <p style={{ color: COLORS.textMuted, lineHeight: 1.7, fontSize: 14 }}>
            A fair, unbiased panel of 5 independent judges for marital disputes.
            <br />Sign up or sign in (top right) to begin.
          </p>
        </div>
      </Show>

      <Show when="signed-in">
        {showProfileModal && (
          <div style={styles.modalOverlay}>
            <div style={styles.modal}>
              <div style={{ fontSize: 40, textAlign: "center", marginBottom: 16 }}>👤</div>
              <h2 style={{ ...styles.heading, textAlign: "center" }}>Quick Setup — One Time Only</h2>
              <p style={{ color: COLORS.textMuted, lineHeight: 1.7, marginBottom: 20, textAlign: "center", fontSize: 14 }}>
                We need your name (for how we display verdicts) and your email (to notify you when it's your turn).
                <br /><br />
                <strong style={{ color: COLORS.accent }}>Your name never reaches the judges — they only see "Person A" and "Person B". Email is used only for notifications.</strong>
              </p>
              <label style={{ display: "block", color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Your name</label>
              <input
                type="text"
                placeholder="e.g. Sai"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ ...styles.input, marginBottom: 12 }}
                autoFocus
              />
              <label style={{ display: "block", color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Your email</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
              />
              <button
                style={{ ...styles.btn, width: "100%", marginTop: 16, opacity: (!name.trim() || !email.includes("@")) ? 0.5 : 1 }}
                onClick={handleSaveProfile}
                disabled={!name.trim() || !email.includes("@")}
              >
                Save & Continue
              </button>
            </div>
          </div>
        )}

        <div style={styles.header}>
          <div style={{ fontSize: 40 }}>⚖️</div>
          <h1 style={styles.title}>Dashboard</h1>
          {organization && (
            <p style={{ color: COLORS.accent, fontSize: 14, margin: "4px 0 0" }}>
              {organization.name}
            </p>
          )}
          <p style={{ color: COLORS.textSubtle, fontSize: 13, margin: "4px 0 0" }}>
            Welcome back, {user?.firstName || "there"}
          </p>
        </div>

        {!orgId && (
          <div style={{ ...styles.card, maxWidth: 500, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
            <h3 style={{ color: COLORS.text, marginBottom: 12 }}>You're not part of a family yet</h3>
            <p style={{ color: COLORS.textMuted, fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
              To start, create a new family or join your partner's existing one.
            </p>
            <p style={{ color: COLORS.textSubtle, fontSize: 13 }}>
              Use the <strong style={{ color: COLORS.accent }}>family selector</strong> in the top-right header.
            </p>
          </div>
        )}

        {orgId && (
          <>
            <section className="dashboard-section" style={styles.section}>
              <div className="dashboard-section-header" style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Active Sessions</h2>
                {active.length === 0 && (
                  <button style={styles.btn} onClick={() => router.push("/session/new")}>
                    + Start New Session
                  </button>
                )}
              </div>

              {loading && <p style={{ color: COLORS.textSubtle, fontSize: 14 }}>Loading...</p>}

              {!loading && active.length === 0 && (
                <div style={styles.emptyState}>
                  <p style={{ color: COLORS.textSubtle, fontSize: 14 }}>No active sessions.</p>
                </div>
              )}

              {active.map((s) => {
                const info = STATUS_LABELS[s.status] || { label: s.status, color: COLORS.textMuted };
                return (
                  <div
                    className="dashboard-session-card"
                    key={s._id}
                    style={{ ...styles.sessionCard, cursor: "pointer", borderColor: info.color + "44" }}
                    onClick={() => router.push(`/session/${s._id}`)}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ color: COLORS.text, margin: "0 0 4px", fontWeight: 500 }}>
                        {s.scenario?.combined || "Session in progress"}
                      </p>
                      <p style={{ color: COLORS.textSubtle, fontSize: 12, margin: 0 }}>
                        Started {new Date(s.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div style={{
                      background: info.color + "22",
                      border: `1px solid ${info.color}`,
                      borderRadius: 20, padding: "4px 12px",
                      color: info.color, fontSize: 12,
                    }}>
                      {info.label}
                    </div>
                  </div>
                );
              })}
            </section>

            {past.length > 0 && (
              <section className="dashboard-section" style={styles.section}>
                <h2 style={styles.sectionTitle}>Past Sessions</h2>
                {past.map((s) => (
                  <div
                    className="dashboard-session-card"
                    key={s._id}
                    style={{ ...styles.sessionCard, cursor: "pointer", opacity: 0.7 }}
                    onClick={() => router.push(`/session/${s._id}`)}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ color: COLORS.text, margin: "0 0 4px" }}>
                        {s.scenario?.combined || "Completed session"}
                      </p>
                      <p style={{ color: COLORS.textSubtle, fontSize: 12, margin: 0 }}>
                        {s.completedAt && `Completed ${new Date(s.completedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    {(() => {
                      const mv = s.majorityVerdict;
                      const isMutual = mv === "Mutual";
                      const color = isMutual ? COLORS.success : COLORS.danger;
                      let label = "Verdict in";
                      if (mv === "Mutual") label = "Mutual";
                      else if (mv === "Person A") label = s.names?.personA || "Person A";
                      else if (mv === "Person B") label = s.names?.personB || "Person B";
                      return (
                        <div style={{
                          background: color + "22",
                          border: `1px solid ${color}`,
                          borderRadius: 20, padding: "4px 12px",
                          color, fontSize: 12,
                        }}>
                          {label}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </Show>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "calc(100vh - 60px)", background: COLORS.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", fontFamily: "'Georgia', serif" },
  header: { textAlign: "center", marginBottom: 40 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: 400, margin: "8px 0 0", letterSpacing: "0.02em" },
  heading: { color: COLORS.text, fontSize: 20, fontWeight: 400, margin: "0 0 8px" },
  section: { width: "100%", maxWidth: 640, marginBottom: 40 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  sectionTitle: { color: COLORS.accent, fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 },
  card: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 },
  sessionCard: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 10, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" },
  emptyState: { background: COLORS.surface, border: `1px dashed ${COLORS.border}`, borderRadius: 10, padding: 24, textAlign: "center" },
  btn: { background: COLORS.accent, color: COLORS.surfaceAlt, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "transparent", color: COLORS.textSubtle, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  input: { width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, padding: "10px 14px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 },
  modal: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 32, maxWidth: 480, width: "100%" },
};