import path from "path";
import { config } from "dotenv";
config({ path: path.resolve(__dirname, "../../../.env") });
config({ path: path.resolve(__dirname, "../../../packages/db/.env") });
import { db } from "@seo/db";
import { hashPassword } from "./auth";

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? "reachline-demo";

/** Ensure agency login only — no demo clients/posts. */
async function ensureEditorUser() {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const user = await db.agencyUser.upsert({
    where: { email: "editor@agency.local" },
    create: {
      email: "editor@agency.local",
      name: "Agency Editor",
      role: "admin",
      passwordHash,
    },
    update: {},
  });
  console.log(
    `Agency login ready: ${user.email} (password unchanged if user already existed)`
  );
  return user;
}

async function main() {
  await ensureEditorUser();
  const clients = await db.client.count();
  console.log(
    `Clients in DB: ${clients}. Seed no longer creates demo clients — add real ones in the UI.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
