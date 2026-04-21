import { MongoClient, Db, Collection } from "mongodb";
import { SessionDocument } from "@/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME = "arbitration";

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined in environment variables");
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
}

let client: MongoClient;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(MONGODB_URI);
  }
  client = global._mongoClient;
} else {
  client = new MongoClient(MONGODB_URI);
}

export async function getDb(): Promise<Db> {
  await client.connect();
  return client.db(DB_NAME);
}

// ============================================================
// Sessions collection — auto-creates with TTL + indexes
// ============================================================
export async function getSessionsCollection(): Promise<Collection<SessionDocument>> {
  const db = await getDb();
  const collection = db.collection<SessionDocument>("sessions");

  // TTL index — sessions auto-delete after expiresAt time
  await collection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: "ttl_expires_at" }
  );

  // Lookup indexes
  await collection.createIndex({ orgId: 1 }, { name: "idx_org_id" });
  await collection.createIndex({ personA_userId: 1 }, { name: "idx_person_a" });
  await collection.createIndex({ personB_userId: 1 }, { name: "idx_person_b" });

  return collection;
}
