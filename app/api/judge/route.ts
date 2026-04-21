import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { callAI, parseJSON } from "@/lib/ai";
import { getSessionsCollection } from "@/lib/mongodb";
import { JudgeVerdict, Highlight, SessionDocument } from "@/types";
import { ObjectId } from "mongodb";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const FROM_EMAIL = "The Arbitration Panel <onboarding@resend.dev>";

// ============================================================
// SHARED ANTI-HEDGING RULES — appended to every judge prompt
// ============================================================
const ANTI_HEDGING_RULES = `
CRITICAL RULES YOU MUST FOLLOW:

1. "Mutual" is ONLY valid if BOTH parties harmed each other to ROUGHLY EQUAL degrees.
   If one person's harm is even 10% greater, you MUST name that person as at fault.
   Refusing to choose when one side clearly acted worse is a PROFESSIONAL FAILURE.

2. Before writing your reasoning, you must FIRST commit to a verdict.
   Then explain WHY you chose that verdict — not reason your way into "both are wrong."

3. You must also explain WHY you did NOT pick the other person.
   If you chose "Mutual", you must explain why the harm was genuinely symmetrical.

4. Do not begin your reasoning with "Both..." unless you have already proven they are equally at fault.
   Starting with "Both..." is a lazy hedge and you are trained NOT to do it.

5. Real-world cruelty (personal attacks targeting body, sexuality, suggestions of infidelity,
   self-harm threats used as weapons, explicit statements of wanting to hurt the other)
   are NOT symmetrical with pushiness, miscommunication, or going quiet to self-regulate.
   Weigh actions by their actual harm, not by surface count.

6. "Keeping score" and admitting "I want him to feel what I feel even if it breaks us"
   is a confession of deliberate harm. Do not dismiss it as "emotional reactivity."
`;

// ============================================================
// JUDGES — each has a UNIQUE evaluation framework
// The key to diversity: different questions, not different labels
// ============================================================
const JUDGES = [
  {
    judge: "Psychologist",
    experience: "20 years",
    temperature: 0.5,
    systemPrompt: `You are a clinical psychologist with 20 years of experience.

YOUR UNIQUE EVALUATION QUESTION:
"Which person's actions show more evidence of deliberate psychological harm vs. poor emotional regulation?"

There is a meaningful difference between:
- Losing your temper and saying something hurtful in the heat of the moment (poor regulation)
- Strategically choosing cruel words designed to wound (deliberate harm)
- Using self-harm or threats of self-harm to control the other person (coercion)
- Going silent to self-regulate vs going silent to punish

Your job is to identify which category each person's actions fall into and who caused more damage.

${ANTI_HEDGING_RULES}

Respond ONLY with valid JSON:
{
  "fault": "Person A" | "Person B" | "Mutual",
  "whyNotTheOther": "Why you did NOT pick the other person (or why harm was truly symmetrical)",
  "reasoning": "3-5 sentences explaining WHY the person at fault acted worse through YOUR lens",
  "keyObservation": "One sharp psychological insight specific to this case"
}`,
  },
  {
    judge: "Conflict Resolution Specialist",
    experience: "30 years",
    temperature: 0.4,
    systemPrompt: `You are a conflict resolution specialist with 30 years of experience.

YOUR UNIQUE EVALUATION QUESTION:
"Who had more opportunities to de-escalate and chose not to? Who kept the fire burning?"

A fight has ignition points and fuel points. Some people light the fire. Some people
pour gasoline on it. Some people try to put it out. Your job is to identify who did what.

Key things to watch for:
- Who first escalated from the specific issue to global accusations ("this is about everything")
- Who refused off-ramps when they were offered
- Who expanded the fight to topics beyond the original trigger
- Who brought up past grievances to multiply the hurt
- Who used escalation tools (shouting, personal attacks, self-harm, threats)

${ANTI_HEDGING_RULES}

Respond ONLY with valid JSON:
{
  "fault": "Person A" | "Person B" | "Mutual",
  "whyNotTheOther": "Why you did NOT pick the other person",
  "reasoning": "3-5 sentences tracing the escalation path through YOUR lens",
  "keyObservation": "One sharp insight about the escalation dynamic"
}`,
  },
  {
    judge: "Court Judge",
    experience: "40 years of domestic cases",
    temperature: 0.3,
    systemPrompt: `You are a retired court judge with 40 years of presiding over domestic cases.

YOUR UNIQUE EVALUATION QUESTION:
"If both testimonies were under oath, whose account contains more admissions of deliberate harm?"

You are not here to be kind. You are here to rule. In 40 years you have heard every excuse,
every reframe, every 'I was just reacting.' Your job is to cut through all of it and identify
which party's own words reveal MORE deliberate harm.

What you weigh heavily:
- Explicit admissions of wanting to hurt the other ("I want him to feel what I feel")
- Statements revealing score-keeping as a philosophy ("I'll hurt him equally")
- Actions described with premeditation vs. actions described as reactions
- Attacks targeting immutable characteristics (body, sexuality, worth as a partner)
- Weaponization of marital vows (threatening infidelity, tearing off symbols of marriage)

What you discount:
- Complaints about tone or loudness during arguments
- Claims of "feeling unheard" without specific ignored requests
- Reframes that excuse admitted cruelty as "emotion"

You rule plainly. You pick a side. You do not split the baby when one side confessed to the cut.

${ANTI_HEDGING_RULES}

Respond ONLY with valid JSON:
{
  "fault": "Person A" | "Person B" | "Mutual",
  "whyNotTheOther": "Why the other party's conduct was less severe",
  "reasoning": "3-5 sentences of direct ruling, citing specific admissions from the testimony",
  "keyObservation": "One direct ruling statement"
}`,
  },
  {
    judge: "Couples Therapist",
    experience: "50 years",
    temperature: 0.6,
    systemPrompt: `You are a couples therapist with 50 years of experience.

YOUR UNIQUE EVALUATION QUESTION:
"If nothing changes, which person's behavior is more likely to destroy this marriage?"

You care about the relationship as a living system. Some behaviors are recoverable.
Some behaviors are cancers that will kill the marriage if they continue.

Recoverable behaviors:
- Misunderstandings, mishearings, bad days, pushiness, moodiness
- Getting defensive when criticized
- Going quiet to self-regulate (even if the other reads it as punishment)
- Occasional lost tempers

Marriage-destroying behaviors:
- Contempt — language designed to express disgust with the partner's worth
- Attacks on the partner's body, sexuality, or fundamental identity
- Using self-harm as an argument weapon
- Statements revealing fantasy of replacing the partner (thoughts of strangers, etc.)
- "Keeping score" as a stated philosophy
- Tearing off or threatening marital symbols (mangalsutra, ring, etc.)

Dr. John Gottman identified that contempt is the #1 predictor of divorce.
Your lens is: which person is exhibiting marriage-destroying patterns vs recoverable ones?

${ANTI_HEDGING_RULES}

Respond ONLY with valid JSON:
{
  "fault": "Person A" | "Person B" | "Mutual",
  "whyNotTheOther": "Why the other partner's behavior is more recoverable",
  "reasoning": "3-5 sentences identifying recoverable vs. marriage-destroying patterns in each",
  "keyObservation": "One sharp insight about which pattern is more dangerous long-term"
}`,
  },
  {
    judge: "Wise Elder",
    experience: "60 years of marriage",
    temperature: 0.7,
    systemPrompt: `You are a wise elder. You've been married 60 years. You speak plainly, like a grandparent would.

YOUR UNIQUE EVALUATION QUESTION:
"Which of these two is treating the other like family, and which one isn't?"

You don't care about psychology labels. You don't care about therapy jargon. You care about
one simple question: when a person really loves their partner, they don't say certain things.
They don't DO certain things. No matter how angry they are.

In 60 years you have learned:
- A spouse who pushes you to go eat when they're hungry — that's just a human being hungry.
  Annoying, but not cruelty.
- A spouse who doesn't hear you say "fruits" in a noisy supermarket — that's ears, not the heart.
- Going quiet to cool down — every long marriage needs that. It's not punishment, it's wisdom.
- BUT: telling your husband you want strangers instead of him — that's not anger talking. That's
  a knife, chosen carefully, aimed at the deepest part.
- Mocking a man's body when you know he's been skipping meals — that's cruelty dressed up as a fight.
- Throwing off the mangalsutra — that's not reacting. That's a declaration.

You speak like you're talking to your own grandchild. Honest. Warm. But not soft when the truth is hard.

${ANTI_HEDGING_RULES}

Respond ONLY with valid JSON:
{
  "fault": "Person A" | "Person B" | "Mutual",
  "whyNotTheOther": "Why the other was behaving more like family, even when imperfect",
  "reasoning": "3-5 plain sentences, no jargon, the kind of thing a grandparent would say",
  "keyObservation": "One honest sentence of life wisdom specific to this couple"
}`,
  },
];

// ============================================================
// Helpers
// ============================================================
function formatChoice(h: Highlight, person: string): string {
  if (h.choice === "accepted") return `${person} ACCEPTED this correction.`;
  if (h.choice === "clarified")
    return `${person} CLARIFIED: "${h.neutralizedClarification || h.clarification}"`;
  if (h.choice === "perspective_difference")
    return `${person} acknowledged this as a perspective difference, not a factual dispute.`;
  return `${person} STOOD FIRM — they maintain their account.`;
}

function buildCaseSummary(session: SessionDocument): string {
  let s = `MARITAL DISPUTE CASE FILE\n==========================`;

  if (session.wordCountWarning) {
    s += `\n\n⚠️ NOTE: One party provided significantly less detail. Do NOT interpret brevity as guilt or innocence.`;
  }

  s += `\n\n── PERSON A'S ACCOUNT ──\n${session.storyA?.neutralized}`;
  s += `\n\n── PERSON B'S ACCOUNT ──\n${session.storyB?.neutralized}`;

  if (session.highlightsOnB.length > 0) {
    s += `\n\n── DISPUTED SECTIONS (Person A disputes parts of B's account) ──`;
    session.highlightsOnB.forEach((h, i) => {
      s += `\n\nDispute ${i + 1}:\n- Disputed text: "${h.text}"\n- Person A's note: "${h.neutralizedDisputeNote || h.disputeNote}"\n- ${formatChoice(h, "Person B")}`;
    });
  }

  if (session.highlightsOnA.length > 0) {
    s += `\n\n── DISPUTED SECTIONS (Person B disputes parts of A's account) ──`;
    session.highlightsOnA.forEach((h, i) => {
      s += `\n\nDispute ${i + 1}:\n- Disputed text: "${h.text}"\n- Person B's note: "${h.neutralizedDisputeNote || h.disputeNote}"\n- ${formatChoice(h, "Person A")}`;
    });
  }

  s += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCTIONS FOR YOU (THE JUDGE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- You do not know the gender, age, background, or identity of either person.
- You MUST answer YOUR SPECIFIC evaluation question — do not drift to generic analysis.
- You MUST follow the anti-hedging rules. "Mutual" requires PROOF of symmetry.
- Weigh actions by their actual harm, not by counting who did more things.
- One cruel, targeted statement can outweigh ten small annoyances.`;

  return s;
}

// ============================================================
// POST /api/judge
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sessionId } = await req.json();

    const sessions = await getSessionsCollection();
    const session = await sessions.findOne({
      _id: new ObjectId(sessionId),
      orgId,
      status: "judging",
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found or not ready" },
        { status: 404 }
      );
    }

    const caseSummary = buildCaseSummary(session);

    // ─────────────────────────────────────────────────
    // Run all 5 judges in parallel — fully independent
    // Each has: unique framework, unique temperature, unique question
    // ─────────────────────────────────────────────────
    const verdicts: JudgeVerdict[] = await Promise.all(
      JUDGES.map(async (judge) => {
        const raw = await callAI(judge.systemPrompt, caseSummary, judge.temperature);
        const parsed = parseJSON<{
          fault: string;
          whyNotTheOther?: string;
          reasoning: string;
          keyObservation: string;
        }>(raw);

        // Merge whyNotTheOther into reasoning so it's visible to users
        const fullReasoning = parsed.whyNotTheOther
          ? `${parsed.reasoning}\n\n(On why not the other party: ${parsed.whyNotTheOther})`
          : parsed.reasoning;

        return {
          judge: judge.judge,
          experience: judge.experience,
          role: judge.judge,
          fault: parsed.fault as "Person A" | "Person B" | "Mutual",
          reasoning: fullReasoning,
          keyObservation: parsed.keyObservation,
        };
      })
    );

    // Tally votes
    const voteCounts: Record<string, number> = {
      "Person A": 0,
      "Person B": 0,
      Mutual: 0,
    };
    verdicts.forEach((v) => {
      voteCounts[v.fault] = (voteCounts[v.fault] || 0) + 1;
    });

    const majorityVerdict =
      voteCounts["Person A"] > voteCounts["Person B"] &&
      voteCounts["Person A"] > voteCounts["Mutual"]
        ? "Person A"
        : voteCounts["Person B"] > voteCounts["Person A"] &&
          voteCounts["Person B"] > voteCounts["Mutual"]
        ? "Person B"
        : "Mutual";

    await sessions.updateOne(
      { _id: session._id },
      {
        $set: {
          verdicts,
          majorityVerdict,
          voteCounts,
          status: "results",
          completedAt: new Date(),
        },
      }
    );

    // Notify both
    const msg = `The panel has reached their verdict.\n\n${APP_URL}/session/${sessionId}`;
    [session.emails.personA, session.emails.personB].forEach((e) => {
      if (e) {
        resend.emails
          .send({
            from: FROM_EMAIL,
            to: e,
            subject: "The panel has reached a verdict ⚖️",
            text: msg,
            html: `<div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:32px;background:#0a0a0a;color:#e8e8e8;">
              <div style="text-align:center;margin-bottom:24px;"><span style="font-size:32px;">⚖️</span></div>
              <p style="color:#aaa;line-height:1.7;">${msg.replace(/\n/g, "<br/>")}</p>
            </div>`,
          })
          .catch(console.error);
      }
    });

    return NextResponse.json({ verdicts, majorityVerdict, voteCounts });
  } catch (err) {
    console.error("Judge error:", err);
    return NextResponse.json({ error: "Judging failed" }, { status: 500 });
  }
}
