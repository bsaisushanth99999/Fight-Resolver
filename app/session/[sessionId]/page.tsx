"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import type { SessionDocument, Highlight, JudgeVerdict, DisputeChoice } from "@/types/index";

const MAX_HIGHLIGHTS = 3;
const MAX_DISPUTE_WORDS = 100;

const COLORS = {
  bg: "#1e293b",
  surface: "#1f2937",
  surfaceAlt: "#0f172a",
  border: "#334155",
  text: "#f8fafc",
  textMuted: "#cbd5e1",
  textSubtle: "#94a3b8",
  accent: "#d6b678",
  danger: "#f87171",
  success: "#4ade80",
};

const JUDGE_ICONS: Record<string, string> = {
  Psychologist: "🧠",
  "Conflict Resolution Specialist": "⚖️",
  "Court Judge": "🔨",
  "Couples Therapist": "💬",
  "Wise Elder": "🕰️",
};

const FAULT_COLORS: Record<string, string> = {
  "Person A": COLORS.danger,  // red — at fault
  "Person B": COLORS.danger,  // red — at fault
  Mutual: COLORS.success,      // green — no single person wronged
};

const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { userId } = useAuth();

  const [session, setSession] = useState<SessionDocument | null>(null);
  const [perspective, setPerspective] = useState<"A" | "B" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [error, setError] = useState("");

  const [story, setStory] = useState("");
  const [scenario, setScenario] = useState("");

  const [pendingText, setPendingText] = useState("");
  const [disputeNote, setDisputeNote] = useState("");
  const [localHighlights, setLocalHighlights] = useState<Highlight[]>([]);

  const [responses, setResponses] = useState<Record<string, { choice: DisputeChoice; clarification: string }>>({});

  const [calmConfirmed, setCalmConfirmed] = useState(false);
  const [safetyWarning, setSafetyWarning] = useState<string>("");
  const [safetyDismissed, setSafetyDismissed] = useState(false);

  useEffect(() => { fetchSession(); }, [sessionId]);

  async function fetchSession() {
    setLoading(true);
    try {
      const res = await fetch(`/api/session/get?sessionId=${sessionId}`);
      if (!res.ok) { router.push("/"); return; }
      const data = await res.json();
      setSession(data.session);
      setPerspective(data.perspective);
    } catch {
      setError("Failed to load session.");
    } finally { setLoading(false); }
  }

  function partnerStory() {
    return perspective === "A" ? session?.storyB?.neutralized : session?.storyA?.neutralized;
  }

  function highlightsOnMyStory(): Highlight[] {
    return perspective === "A" ? session?.highlightsOnA || [] : session?.highlightsOnB || [];
  }

  // ── Name helpers ──────────────────────────────────────────
  // Names are for UI display only — never sent to judges
  function myName(): string {
    if (!session) return "You";
    return (perspective === "A" ? session.names?.personA : session.names?.personB) || "You";
  }

  function partnerName(): string {
    if (!session) return "Your partner";
    return (perspective === "A" ? session.names?.personB : session.names?.personA) || "Your partner";
  }

  function nameForLabel(label: "Person A" | "Person B" | "Mutual"): string {
    if (label === "Mutual") return "Both of you";
    if (!session) return label;
    if (label === "Person A") return session.names?.personA || "Person A";
    return session.names?.personB || "Person B";
  }

  // Replace "Person A" / "Person B" in judge reasoning with actual names for display
  function humanizeText(text: string): string {
    if (!session || !text) return text;
    const nameA = session.names?.personA;
    const nameB = session.names?.personB;
    let result = text;
    if (nameA) result = result.replace(/Person A/g, nameA);
    if (nameB) result = result.replace(/Person B/g, nameB);
    return result;
  }

  async function handleSubmitStory() {
    if (story.length < 50) { setError("Please write at least 50 characters."); return; }
    if (!scenario.trim()) { setError("Please describe what the dispute is about."); return; }
    setError(""); setBusy(true); setBusyMsg("Neutralizing your account...");

    const storyA = perspective === "A" ? story : session?.storyA?.raw || "";
    const storyB = perspective === "B" ? story : session?.storyB?.raw || "";

    if (storyA && storyB) {
      // Safety check — runs in background but never blocks flow.
      // If flagged, a dismissible banner is stored in MongoDB and shown to both parties.
      fetch("/api/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyA, storyB }),
      })
        .then((r) => r.json())
        .then((safety) => {
          if (safety.flagged) {
            setSafetyWarning(
              safety.message ||
              "This situation may involve sensitive concerns. If either of you feels unsafe, please consider reaching out to a professional."
            );
          }
        })
        .catch(() => { });
    }

    const email = localStorage.getItem(`email_${userId}`) || "";
    const name = localStorage.getItem(`name_${userId}`) || "";

    await fetch("/api/session/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId, action: "submit_story",
        payload: { story, scenario, email, name },
      }),
    });

    if (perspective === "B" && session?.scenario?.rawA) {
      fetch("/api/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          scenarioA: session.scenario.rawA,
          scenarioB: scenario,
        }),
      }).catch(() => { });
    }

    setBusy(false);
    fetchSession();
  }

  function handleTextSelect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length < 5) return;
    if (localHighlights.length >= MAX_HIGHLIGHTS) {
      setError(`Maximum ${MAX_HIGHLIGHTS} highlights allowed.`); return;
    }
    setPendingText(text); setDisputeNote(""); setError("");
  }

  function handleAddHighlight() {
    if (!pendingText || !disputeNote.trim()) {
      setError("Please add a note explaining the dispute."); return;
    }
    if (countWords(disputeNote) > MAX_DISPUTE_WORDS) {
      setError(`Max ${MAX_DISPUTE_WORDS} words.`); return;
    }
    setLocalHighlights((prev) => [...prev, { id: Date.now().toString(), text: pendingText, disputeNote }]);
    setPendingText(""); setDisputeNote(""); setError("");
  }

  async function handleSubmitHighlights() {
    setBusy(true); setBusyMsg("Saving highlights...");
    await fetch("/api/session/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId, action: "submit_highlights",
        payload: { highlights: localHighlights },
      }),
    });
    setLocalHighlights([]);
    setBusy(false);
    fetchSession();
  }

  async function handleSubmitResponses() {
    setBusy(true); setBusyMsg("Submitting responses...");
    const respArray = Object.entries(responses).map(([id, r]) => ({
      id, choice: r.choice, clarification: r.clarification,
    }));

    const res = await fetch("/api/session/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId, action: "submit_responses",
        payload: { responses: respArray },
      }),
    });
    const data = await res.json();

    if (data.triggerJudging) {
      setBusyMsg("Summoning the panel of judges...");
      await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    }

    setBusy(false);
    fetchSession();
  }

  if (loading) return <div className="session-page" style={styles.container}><p style={{ color: COLORS.textSubtle }}>Loading...</p></div>;
  if (!session || !perspective) return <div className="session-page" style={styles.container}><p style={{ color: COLORS.danger }}>Session not found.</p></div>;

  const { status } = session;

  const renderHeader = () => (
    <>
      {safetyWarning && !safetyDismissed && (
        <div style={{
          maxWidth: 720, width: "100%", marginBottom: 16,
          background: "#3b1f2a", border: `1px solid ${COLORS.danger}`,
          borderRadius: 10, padding: "14px 16px",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>💛</span>
          <div style={{ flex: 1 }}>
            <p style={{ color: COLORS.text, fontSize: 13, margin: "0 0 4px", fontWeight: 600 }}>
              A gentle note
            </p>
            <p style={{ color: COLORS.textMuted, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
              {safetyWarning}
              <br />
              <span style={{ color: COLORS.textSubtle }}>
                If you need support: <strong style={{ color: COLORS.accent }}>1-800-799-7233</strong> (24/7)
              </span>
            </p>
          </div>
          <button
            onClick={() => setSafetyDismissed(true)}
            style={{
              background: "transparent", color: COLORS.textMuted, border: "none",
              cursor: "pointer", fontSize: 16, padding: 0,
            }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 32, cursor: "pointer" }} onClick={() => router.push("/")}>⚖️</div>
        {session.scenario?.combined && (
          <p style={{ color: COLORS.accent, fontSize: 14, margin: "8px 0 0" }}>{session.scenario.combined}</p>
        )}
      </div>
    </>
  );

  if (status === "waiting_for_b" && perspective === "A" && !session.storyA) {
    return (
      <div className="session-page" style={styles.container}>
        {renderHeader()}
        <div style={{ ...styles.card, maxWidth: 600 }}>
          <StoryForm
            scenario={scenario} setScenario={setScenario}
            story={story} setStory={setStory}
            label={`You (${myName()})`}
            onSubmit={handleSubmitStory}
            busy={busy} busyMsg={busyMsg} error={error}
          />
        </div>
      </div>
    );
  }

  if (status === "waiting_for_b" && perspective === "A" && session.storyA) {
    return (
      <div className="session-page" style={styles.container}>
        {renderHeader()}
        <div style={{ ...styles.card, maxWidth: 500, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h3 style={{ color: COLORS.text }}>Waiting for {partnerName()}</h3>
          <p style={{ color: COLORS.textMuted, lineHeight: 1.7 }}>
            Your account is submitted. {partnerName()} needs to log in and submit theirs.
          </p>
          <p style={{ color: COLORS.textSubtle, fontSize: 13, marginTop: 16 }}>
            Share your family name with them via <strong style={{ color: COLORS.accent }}>Settings → Organizations</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (status === "waiting_for_b" && perspective === "B") {
    return (
      <div className="session-page" style={styles.container}>
        {renderHeader()}
        <div style={{ ...styles.card, maxWidth: 600 }}>
          <StoryForm
            scenario={scenario} setScenario={setScenario}
            story={story} setStory={setStory}
            label={`You (${myName()})`}
            onSubmit={handleSubmitStory}
            busy={busy} busyMsg={busyMsg} error={error}
          />
        </div>
      </div>
    );
  }

  if ((status === "highlighting_a" && perspective === "A") || (status === "highlighting_b" && perspective === "B")) {
    return (
      <div className="session-page" style={styles.container}>
        {renderHeader()}
        <div style={{ ...styles.card, maxWidth: 720 }}>
          <h3 style={{ color: COLORS.text, marginBottom: 4 }}>Read {partnerName()}'s account</h3>
          <p style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 16 }}>
            Select up to {MAX_HIGHLIGHTS} sections you dispute and add a note for each.
          </p>
          <div onMouseUp={handleTextSelect} style={styles.storyText}>{humanizeText(partnerStory() || "")}</div>

          {pendingText && (
            <div style={styles.highlightForm}>
              <p style={{ color: COLORS.accent, fontSize: 13, marginBottom: 8 }}>Selected: "{pendingText}"</p>
              <textarea style={styles.textarea} placeholder={`Why do you dispute this? (max ${MAX_DISPUTE_WORDS} words)`} value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} rows={3} />
              <p style={{ color: COLORS.textSubtle, fontSize: 11 }}>{countWords(disputeNote)}/{MAX_DISPUTE_WORDS} words</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button style={styles.btn} onClick={handleAddHighlight}>Add Highlight</button>
                <button style={styles.btnSecondary} onClick={() => setPendingText("")}>Cancel</button>
              </div>
            </div>
          )}

          {localHighlights.map((h, i) => (
            <div key={h.id} style={styles.highlightItem}>
              <p style={{ color: COLORS.text, fontSize: 13, margin: "0 0 4px" }}><strong>Highlight {i + 1}:</strong> "{h.text}"</p>
              <p style={{ color: COLORS.textMuted, fontSize: 12, margin: 0 }}>Your note: {h.disputeNote}</p>
            </div>
          ))}

          {error && <p style={styles.error}>{error}</p>}

          <button style={{ ...styles.btn, marginTop: 20, width: "100%" }} onClick={handleSubmitHighlights} disabled={busy}>
            {busy ? busyMsg : "Submit Highlights →"}
          </button>
          <p style={{ color: COLORS.textSubtle, fontSize: 12, marginTop: 8, textAlign: "center" }}>
            You can submit with 0 highlights if you have no disputes.
          </p>
        </div>
      </div>
    );
  }

  if ((status === "highlighting_a" && perspective === "B") || (status === "highlighting_b" && perspective === "A")) {
    return (
      <div className="session-page" style={styles.container}>
        {renderHeader()}
        <div style={{ ...styles.card, maxWidth: 500, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h3 style={{ color: COLORS.text }}>Waiting for {partnerName()} to review</h3>
          <p style={{ color: COLORS.textMuted }}>You'll be notified by email when it's your turn.</p>
        </div>
      </div>
    );
  }

  if ((status === "responding_a" && perspective === "A") || (status === "responding_b" && perspective === "B")) {
    const myHighlights = highlightsOnMyStory();
    return (
      <div className="session-page" style={styles.container}>
        {renderHeader()}
        <div style={{ maxWidth: 700, width: "100%" }}>
          <h3 style={{ color: COLORS.text, marginBottom: 4, textAlign: "center" }}>Respond to disputes on your account</h3>
          <p style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 24, textAlign: "center" }}>
            <strong style={{ color: COLORS.accent }}>This is the final round — responses are locked.</strong>
          </p>

          {myHighlights.length === 0 ? (
            <div style={{ ...styles.card, textAlign: "center" }}>
              <p style={{ color: COLORS.textMuted }}>{partnerName()} had no disputes with your account.</p>
              <button style={{ ...styles.btn, marginTop: 16 }} onClick={handleSubmitResponses} disabled={busy}>
                {busy ? busyMsg : "Continue →"}
              </button>
            </div>
          ) : (
            <>
              {myHighlights.map((h) => {
                const resp = responses[h.id] || { choice: "" as any, clarification: "" };
                return (
                  <div key={h.id} style={{ ...styles.card, marginBottom: 16 }}>
                    <p style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>{partnerName()} disputes this:</p>
                    <blockquote style={{ borderLeft: `3px solid ${COLORS.border}`, paddingLeft: 12, color: COLORS.textMuted, margin: "0 0 12px" }}>"{humanizeText(h.text)}"</blockquote>
                    <div style={{ background: COLORS.surfaceAlt, padding: 10, borderRadius: 6, marginBottom: 16 }}>
                      <p style={{ color: COLORS.textMuted, fontSize: 12, margin: 0 }}>
                        <strong style={{ color: COLORS.accent }}>{partnerName()}'s note:</strong> {humanizeText(h.disputeNote)}
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                      {[
                        { value: "accepted", label: "✅ I accept this" },
                        { value: "clarified", label: "✏️ I want to clarify" },
                        { value: "stood_firm", label: "🔒 I stand by this" },
                        { value: "perspective_difference", label: "👁️ Different perspective" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          style={{
                            ...styles.btnSecondary,
                            borderColor: resp.choice === opt.value ? COLORS.accent : COLORS.border,
                            color: resp.choice === opt.value ? COLORS.accent : COLORS.textMuted,
                          }}
                          onClick={() => setResponses((r) => ({ ...r, [h.id]: { ...resp, choice: opt.value as DisputeChoice } }))}
                        >{opt.label}</button>
                      ))}
                    </div>

                    {resp.choice === "clarified" && (
                      <textarea
                        style={{ ...styles.textarea, minHeight: 70 }}
                        placeholder={`Your clarification (max ${MAX_DISPUTE_WORDS} words)`}
                        value={resp.clarification}
                        onChange={(e) => setResponses((r) => ({ ...r, [h.id]: { ...resp, clarification: e.target.value } }))}
                      />
                    )}
                  </div>
                );
              })}

              {error && <p style={styles.error}>{error}</p>}
              <button style={{ ...styles.btn, width: "100%", padding: "14px" }} onClick={handleSubmitResponses} disabled={busy}>
                {busy ? busyMsg : "Lock Responses & Submit →"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if ((status === "responding_a" && perspective === "B") || (status === "responding_b" && perspective === "A")) {
    return (
      <div className="session-page" style={styles.container}>
        {renderHeader()}
        <div style={{ ...styles.card, maxWidth: 500, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h3 style={{ color: COLORS.text }}>Waiting for {partnerName()} to respond</h3>
          <p style={{ color: COLORS.textMuted }}>Judges will be summoned once both of you respond. You'll get an email.</p>
        </div>
      </div>
    );
  }

  if (status === "judging") {
    return (
      <div className="session-page" style={styles.container}>
        {renderHeader()}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>⚖️</div>
          <h2 style={{ color: COLORS.text, fontWeight: 400 }}>The Panel is Deliberating</h2>
          <p style={{ color: COLORS.textMuted }}>You'll get an email when the verdict is in.</p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
            {["🧠", "⚖️", "🔨", "💬", "🕰️"].map((icon, i) => (
              <div key={i} style={{ ...styles.card, width: 90, textAlign: "center" }}>
                <div style={{ fontSize: 28 }}>{icon}</div>
                <p style={{ color: COLORS.textSubtle, fontSize: 11, margin: "8px 0 0" }}>Reviewing...</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (status === "results") {
    if (!calmConfirmed) {
      return (
        <div className="session-page" style={styles.container}>
          {renderHeader()}
          <div style={{ ...styles.card, maxWidth: 480, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧘</div>
            <h2 style={{ color: COLORS.text, fontWeight: 400, marginBottom: 12 }}>Before You See the Results</h2>
            <p style={{ color: COLORS.textMuted, lineHeight: 1.7, marginBottom: 24 }}>
              These results identify which <em>actions</em> were harmful — not who is a bad person.
              <br /><br />Are you in a calm, private space?
            </p>
            <button style={{ ...styles.btn, width: "100%" }} onClick={() => setCalmConfirmed(true)}>Yes, I'm ready</button>
          </div>
        </div>
      );
    }

    const v = session.verdicts || [];
    const mv = session.majorityVerdict || "Mutual";
    const vc = session.voteCounts || {};

    return (
      <div className="session-page" style={styles.container}>
        {renderHeader()}

        <div style={{ ...styles.card, maxWidth: 580, width: "100%", borderColor: FAULT_COLORS[mv] + "88", textAlign: "center", marginBottom: 32 }}>
          <p style={{ color: COLORS.textSubtle, fontSize: 13, marginBottom: 8 }}>Majority Verdict ({vc[mv] || 0}/5 judges)</p>
          <h2 style={{ color: FAULT_COLORS[mv], fontSize: 32, fontWeight: 400, margin: "0 0 16px" }}>
            {mv === "Mutual" ? "Mutual Responsibility" : `${nameForLabel(mv as any)} bears more responsibility`}
          </h2>
          <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
            {Object.entries(vc).map(([k, count]) => (
              <div key={k} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: FAULT_COLORS[k] }}>{count}</div>
                <div style={{ fontSize: 11, color: COLORS.textSubtle }}>{nameForLabel(k as any)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 720, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
          {v.map((verdict: JudgeVerdict) => (
            <div key={verdict.judge} style={{ ...styles.card, borderLeft: `4px solid ${FAULT_COLORS[verdict.fault]}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 24 }}>{JUDGE_ICONS[verdict.judge] || "⚖️"}</span>
                  <div>
                    <h3 style={{ color: COLORS.text, margin: 0, fontSize: 15 }}>{verdict.judge}</h3>
                    <p style={{ color: COLORS.textSubtle, fontSize: 11, margin: 0 }}>{verdict.experience}</p>
                  </div>
                </div>
                <div style={{ background: FAULT_COLORS[verdict.fault] + "22", border: `1px solid ${FAULT_COLORS[verdict.fault]}`, borderRadius: 20, padding: "4px 12px", color: FAULT_COLORS[verdict.fault], fontSize: 12, fontWeight: 600 }}>
                  {nameForLabel(verdict.fault)}
                </div>
              </div>
              <p style={{ color: COLORS.textMuted, lineHeight: 1.7, fontSize: 14, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{humanizeText(verdict.reasoning)}</p>
              <div style={{ background: COLORS.surfaceAlt, padding: 10, borderRadius: 6 }}>
                <p style={{ color: COLORS.accent, fontSize: 13, margin: 0 }}>💡 <em>{humanizeText(verdict.keyObservation)}</em></p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ ...styles.card, maxWidth: 720, width: "100%", marginTop: 24, textAlign: "center", background: "transparent", border: `1px solid ${COLORS.border}` }}>
          <p style={{ color: COLORS.textSubtle, lineHeight: 1.7, fontSize: 14, margin: 0 }}>
            This verdict identifies which <strong>actions</strong> were harmful — not who is a bad person. Speaking with a couples therapist can help both of you move forward.
          </p>
        </div>

        <button style={{ ...styles.btnSecondary, marginTop: 24 }} onClick={() => router.push("/")}>← Dashboard</button>
      </div>
    );
  }

  return <div className="session-page" style={styles.container}><p style={{ color: COLORS.textSubtle }}>Loading...</p></div>;
}

function StoryForm({
  scenario, setScenario, story, setStory, label, onSubmit, busy, busyMsg, error,
}: {
  scenario: string; setScenario: (s: string) => void;
  story: string; setStory: (s: string) => void;
  label: string;
  onSubmit: () => void;
  busy: boolean; busyMsg: string; error: string;
}) {
  return (
    <div>
      <h3 style={{ color: COLORS.text, marginBottom: 4 }}>{label} — Your Account</h3>
      <p style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 20 }}>
        Don't include your name or gender. Judges only know you as Person A or B.
      </p>

      <label style={styles.label}>In one sentence, what is this dispute about?</label>
      <input
        style={styles.input}
        placeholder="e.g. We fought about how chores are divided"
        value={scenario}
        onChange={(e) => setScenario(e.target.value)}
      />

      <label style={{ ...styles.label, marginTop: 20 }}>Your full account</label>
      <textarea
        style={{ ...styles.textarea, minHeight: 200 }}
        placeholder="Describe what happened in detail. The more context, the more accurate the judgment."
        value={story}
        onChange={(e) => setStory(e.target.value)}
        rows={10}
      />
      <p style={{ color: COLORS.textSubtle, fontSize: 12, margin: "4px 0 0" }}>
        💡 A detailed account leads to a more accurate judgment. {countWords(story)} words
      </p>

      {error && <p style={styles.error}>{error}</p>}

      <button style={{ ...styles.btn, width: "100%", marginTop: 20, padding: "12px" }} onClick={onSubmit} disabled={busy}>
        {busy ? busyMsg || "Processing..." : "Submit My Account →"}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "calc(100vh - 60px)", background: COLORS.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 14px", fontFamily: "'Georgia', serif" },
  card: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 },
  storyText: { color: COLORS.textMuted, lineHeight: 1.8, whiteSpace: "pre-wrap", background: COLORS.surfaceAlt, padding: 16, borderRadius: 8, cursor: "text", userSelect: "text", marginBottom: 16 },
  highlightForm: { background: COLORS.surfaceAlt, padding: 16, borderRadius: 8, marginBottom: 12, border: `1px solid ${COLORS.accent}66` },
  highlightItem: { background: COLORS.surfaceAlt, padding: 12, borderRadius: 8, marginBottom: 8, borderLeft: `3px solid ${COLORS.accent}` },
  textarea: { width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, padding: "10px 12px", fontSize: 14, lineHeight: 1.7, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none" },
  input: { width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" },
  label: { display: "block", color: COLORS.textMuted, fontSize: 13, marginBottom: 6 },
  btn: { background: COLORS.accent, color: COLORS.surfaceAlt, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { background: "transparent", color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  error: { color: COLORS.danger, fontSize: 13, marginTop: 8 },
};