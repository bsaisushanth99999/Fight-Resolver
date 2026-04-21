import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSessionsCollection } from "@/lib/mongodb";

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, name } = await req.json();

    const sessions = await getSessionsCollection();
    const session = await sessions.findOne({
      orgId,
      status: "waiting_for_b",
    });

    if (!session) {
      return NextResponse.json(
        { error: "No pending session found. Ask your partner to create one first." },
        { status: 404 }
      );
    }

    if (session.personA_userId === userId) {
      return NextResponse.json(
        { error: "You created this session. Share your family name with your partner." },
        { status: 400 }
      );
    }

    await sessions.updateOne(
      { _id: session._id },
      {
        $set: {
          personB_userId: userId,
          "emails.personB": email,
          "names.personB": name,
        },
      }
    );

    return NextResponse.json({ sessionId: session._id?.toString() });
  } catch (err) {
    console.error("Join session error:", err);
    return NextResponse.json({ error: "Failed to join session" }, { status: 500 });
  }
}
