import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSessionsCollection } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const sessions = await getSessionsCollection();
    const session = await sessions.findOne({
      _id: new ObjectId(sessionId),
      orgId, // Must be in same org (family)
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const isPersonA = session.personA_userId === userId;
    let isPersonB = session.personB_userId === userId;

    // ============================================================
    // AUTO-JOIN: If user is in the org but not yet registered
    // as Person B, and the session is still waiting for B,
    // automatically register them as Person B.
    // ============================================================
    if (!isPersonA && !isPersonB && !session.personB_userId && session.status === "waiting_for_b") {
      await sessions.updateOne(
        { _id: session._id },
        { $set: { personB_userId: userId } }
      );
      session.personB_userId = userId;
      isPersonB = true;
    }

    if (!isPersonA && !isPersonB) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({
      session: { ...session, _id: session._id?.toString() },
      perspective: isPersonA ? "A" : "B",
    });
  } catch (err) {
    console.error("Get session error:", err);
    return NextResponse.json({ error: "Failed to get session" }, { status: 500 });
  }
}
