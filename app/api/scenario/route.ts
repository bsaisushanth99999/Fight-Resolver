import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { callAI, parseJSON } from "@/lib/ai";
import { getSessionsCollection } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const SCENARIO_SYSTEM_PROMPT = `You are a neutral summarizer for a marital dispute resolution system.

Two people described what their argument is about. Combine them into ONE neutral title that:
1. Doesn't favor either person's framing
2. Identifies the core underlying issue
3. Is 5-12 words
4. Is factual, non-judgmental
5. Doesn't reveal who is right or wrong

Examples:
- "Dispute over household responsibilities and expectations"
- "Conflict about communication and feeling unheard"
- "Disagreement over financial decisions and trust"

Respond ONLY with valid JSON: { "combined": "the neutral title" }`;

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sessionId, scenarioA, scenarioB } = await req.json();

    const raw = await callAI(
      SCENARIO_SYSTEM_PROMPT,
      `Person A: "${scenarioA}"\n\nPerson B: "${scenarioB}"\n\nCreate a neutral combined title.`
    );

    const result = parseJSON<{ combined: string }>(raw);

    // Save to session
    if (sessionId) {
      const sessions = await getSessionsCollection();
      await sessions.updateOne(
        { _id: new ObjectId(sessionId), orgId },
        { $set: { "scenario.combined": result.combined } }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Scenario error:", err);
    return NextResponse.json({ error: "Scenario generation failed" }, { status: 500 });
  }
}
