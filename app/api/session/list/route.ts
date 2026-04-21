import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSessionsCollection } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessions = await getSessionsCollection();

    const results = await sessions
      .find(
        { orgId },
        {
          projection: {
            _id: 1,
            status: 1,
            scenario: 1,
            majorityVerdict: 1,
            createdAt: 1,
            completedAt: 1,
            names: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({
      sessions: results.map((s) => ({ ...s, _id: s._id?.toString() })),
    });
  } catch (err) {
    console.error("List sessions error:", err);
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}