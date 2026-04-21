import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSessionsCollection } from "@/lib/mongodb";
import { SessionDocument } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, name } = await req.json();

    const sessions = await getSessionsCollection();

    // Check if active session already exists for this org
    const existing = await sessions.findOne({
      orgId,
      status: { $ne: "results" },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "An active session already exists for your family.",
          sessionId: existing._id?.toString(),
        },
        { status: 409 }
      );
    }

    const now = new Date();
    const newSession: SessionDocument = {
      orgId,
      personA_userId: userId,
      status: "waiting_for_b",
      highlightsOnB: [],
      highlightsOnA: [],
      respondedA: false,
      respondedB: false,
      emails: { personA: email },
      names: { personA: name },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };

    const result = await sessions.insertOne(newSession as any);

    return NextResponse.json({ sessionId: result.insertedId.toString() });
  } catch (err) {
    console.error("Create session error:", err);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
