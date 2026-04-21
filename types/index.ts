import type { ObjectId } from "mongodb";

// ============================================================
// Session Status
// ============================================================
export type SessionStatus =
  | "waiting_for_b"
  | "highlighting_a"
  | "highlighting_b"
  | "responding_a"
  | "responding_b"
  | "judging"
  | "results";

// ============================================================
// Dispute
// ============================================================
export type DisputeChoice =
  | "accepted"
  | "clarified"
  | "stood_firm"
  | "perspective_difference";

export interface Highlight {
  id: string;
  text: string;
  disputeNote: string;
  neutralizedDisputeNote?: string;
  choice?: DisputeChoice;
  clarification?: string;
  neutralizedClarification?: string;
}

// ============================================================
// Story / Scenario
// ============================================================
export interface Story {
  raw: string;
  neutralized: string;
  wordCount: number;
}

export interface Scenario {
  rawA?: string;
  rawB?: string;
  combined?: string;
}

// ============================================================
// Verdict
// ============================================================
export interface JudgeVerdict {
  judge: string;
  experience: string;
  role: string;
  fault: "Person A" | "Person B" | "Mutual";
  reasoning: string;
  keyObservation: string;
}

// ============================================================
// Session Document (MongoDB)
// ============================================================
export interface SessionDocument {
  _id?: ObjectId;
  orgId: string;
  personA_userId: string;
  personB_userId?: string;
  status: SessionStatus;

  scenario?: Scenario;
  storyA?: Story;
  storyB?: Story;
  wordCountWarning?: boolean;

  highlightsOnB: Highlight[];
  highlightsOnA: Highlight[];

  respondedA: boolean;
  respondedB: boolean;

  verdicts?: JudgeVerdict[];
  majorityVerdict?: "Person A" | "Person B" | "Mutual";
  voteCounts?: Record<string, number>;

  emails: { personA?: string; personB?: string };
  names: { personA?: string; personB?: string };

  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

// ============================================================
// API responses
// ============================================================
export interface SafetyResponse {
  flagged: boolean;
  message: string;
}
