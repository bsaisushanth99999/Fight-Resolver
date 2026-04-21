import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSessionsCollection } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { SessionStatus, Highlight } from "@/types";
import { neutralizeText } from "@/lib/neutralize";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const FROM_EMAIL = "The Arbitration Panel <onboarding@resend.dev>"; // Replace with your verified domain

async function sendEmail(to: string, subject: string, text: string) {
  if (!to) return;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      text,
      html: `<div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:32px;background:#0a0a0a;color:#e8e8e8;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:32px;">⚖️</span>
          <h2 style="color:#c8a96e;font-weight:400;margin:8px 0 0;">${subject}</h2>
        </div>
        <p style="color:#aaa;line-height:1.7;">${text.replace(/\n/g, "<br/>")}</p>
      </div>`,
    });
  } catch (e) { console.error("Email failed:", e); }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId, action, payload } = await req.json();

    const sessions = await getSessionsCollection();
    const session = await sessions.findOne({
      _id: new ObjectId(sessionId),
      orgId,
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const isPersonA = session.personA_userId === userId;
    const isPersonB = session.personB_userId === userId;

    if (!isPersonA && !isPersonB) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const perspective: "A" | "B" = isPersonA ? "A" : "B";

    // ── ACTION: submit_story ──────────────────────────────
    if (action === "submit_story") {
      const { story, scenario, email, name } = payload;
      const neutralized = await neutralizeText(story, perspective);
      const wordCount = story.trim().split(/\s+/).length;

      if (perspective === "A") {
        await sessions.updateOne(
          { _id: session._id },
          {
            $set: {
              storyA: { raw: story, neutralized, wordCount },
              "scenario.rawA": scenario,
              "emails.personA": email,
              "names.personA": name,
            },
          }
        );

        // Notify B if they're already in the session
        if (session.personB_userId && session.emails.personB) {
          await sendEmail(
            session.emails.personB,
            "Your partner has submitted their account",
            `Log in to submit yours and continue the session.\n\n${APP_URL}/session/${sessionId}`
          );
        }
      } else {
        // Person B submits — both stories now in
        const wordCountA = session.storyA?.wordCount || 0;
        const wordCountWarning =
          Math.max(wordCountA, wordCount) /
            Math.max(Math.min(wordCountA, wordCount), 1) >
          3;

        await sessions.updateOne(
          { _id: session._id },
          {
            $set: {
              storyB: { raw: story, neutralized, wordCount },
              "scenario.rawB": scenario,
              "emails.personB": email,
              "names.personB": name,
              wordCountWarning,
              status: "highlighting_a" as SessionStatus,
            },
          }
        );

        if (session.emails.personA) {
          await sendEmail(
            session.emails.personA,
            "Your partner has submitted their account",
            `Log in to review their account and highlight any disputed sections.\n\n${APP_URL}/session/${sessionId}`
          );
        }
      }

      return NextResponse.json({ success: true });
    }

    // ── ACTION: submit_highlights ─────────────────────────
    if (action === "submit_highlights") {
      const { highlights }: { highlights: Highlight[] } = payload;

      const neutralized = await Promise.all(
        highlights.map(async (h) => ({
          ...h,
          neutralizedDisputeNote: await neutralizeText(h.disputeNote, perspective),
        }))
      );

      if (perspective === "A") {
        // Person A highlighted B's story → next: B highlights A's story
        await sessions.updateOne(
          { _id: session._id },
          {
            $set: {
              highlightsOnB: neutralized,
              status: "highlighting_b" as SessionStatus,
            },
          }
        );

        if (session.emails.personB) {
          await sendEmail(
            session.emails.personB,
            "Your turn to review and highlight",
            `Your partner has reviewed your account. Now log in to read their account and highlight any disputed sections.\n\n${APP_URL}/session/${sessionId}`
          );
        }
      } else {
        // Person B highlighted A's story → both done with highlighting → responses
        await sessions.updateOne(
          { _id: session._id },
          {
            $set: {
              highlightsOnA: neutralized,
              status: "responding_a" as SessionStatus,
            },
          }
        );

        if (session.emails.personA) {
          await sendEmail(
            session.emails.personA,
            "Time to respond to disputes",
            `Your partner has highlighted disputed sections in your account. Log in to respond.\n\n${APP_URL}/session/${sessionId}`
          );
        }
      }

      return NextResponse.json({ success: true });
    }

    // ── ACTION: submit_responses ─────────────────────────
    if (action === "submit_responses") {
      const { responses } = payload;

      if (perspective === "A") {
        // A responds to highlights B made on A's story (highlightsOnA)
        const updated = await Promise.all(
          session.highlightsOnA.map(async (h) => {
            const r = responses.find((x: any) => x.id === h.id);
            if (!r) return h;
            return {
              ...h,
              choice: r.choice,
              clarification: r.clarification || "",
              neutralizedClarification: r.clarification
                ? await neutralizeText(r.clarification, "A")
                : "",
            };
          })
        );

        const bothResponded = session.respondedB;
        const nextStatus: SessionStatus = bothResponded ? "judging" : "responding_b";

        await sessions.updateOne(
          { _id: session._id },
          {
            $set: {
              highlightsOnA: updated,
              respondedA: true,
              status: nextStatus,
            },
          }
        );

        if (!bothResponded && session.emails.personB) {
          await sendEmail(
            session.emails.personB,
            "Your turn to respond",
            `Your partner has responded. Log in to respond to the sections highlighted in your account.\n\n${APP_URL}/session/${sessionId}`
          );
        }

        return NextResponse.json({ success: true, triggerJudging: bothResponded });
      } else {
        // B responds to highlights A made on B's story (highlightsOnB)
        const updated = await Promise.all(
          session.highlightsOnB.map(async (h) => {
            const r = responses.find((x: any) => x.id === h.id);
            if (!r) return h;
            return {
              ...h,
              choice: r.choice,
              clarification: r.clarification || "",
              neutralizedClarification: r.clarification
                ? await neutralizeText(r.clarification, "B")
                : "",
            };
          })
        );

        const bothResponded = session.respondedA;
        const nextStatus: SessionStatus = bothResponded ? "judging" : "responding_a";

        await sessions.updateOne(
          { _id: session._id },
          {
            $set: {
              highlightsOnB: updated,
              respondedB: true,
              status: nextStatus,
            },
          }
        );

        if (!bothResponded && session.emails.personA) {
          await sendEmail(
            session.emails.personA,
            "Your turn to respond",
            `Your partner has responded. Log in to respond to the sections highlighted in your account.\n\n${APP_URL}/session/${sessionId}`
          );
        }

        return NextResponse.json({ success: true, triggerJudging: bothResponded });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Update session error:", err);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}
