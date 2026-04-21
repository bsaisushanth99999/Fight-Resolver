import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { callAI, parseJSON } from "@/lib/ai";
import { SafetyResponse } from "@/types";

const SAFETY_SYSTEM_PROMPT = `You are a safety screening system for a marital dispute resolution tool.
Detect ONLY if the situation involves:
- Physical violence or threats of violence
- Fear for personal safety
- Physical, emotional, or sexual abuse
- Self-harm or suicidal ideation

Respond ONLY with valid JSON: { "flagged": true/false, "message": "compassionate message if flagged, else empty string" }
Do NOT flag normal arguments or emotional distress.`;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { storyA, storyB } = await req.json();

    const raw = await callAI(
      SAFETY_SYSTEM_PROMPT,
      `Screen these two accounts:\n\nPERSON A:\n${storyA}\n\nPERSON B:\n${storyB}`
    );

    const result = parseJSON<SafetyResponse>(raw);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ flagged: false, message: "" });
  }
}
