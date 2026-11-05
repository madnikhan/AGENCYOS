/**
 * Wipe operational/demo data for a clean realtime start.
 * Keeps: AgencySettings (API keys) and AgencyUser (login).
 *
 * Run from repo root:
 *   pnpm --filter @seo/db exec dotenv -e ../../.env -- node ../../scripts/wipe-demo-data.mjs
 * or:
 *   pnpm wipe:demo
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const before = {
    clients: await db.client.count(),
    posts: await db.post.count(),
    briefs: await db.contentBrief.count(),
    campaigns: await db.campaign.count(),
  };

  await db.rankSnapshot.deleteMany();
  await db.rankKeyword.deleteMany();
  await db.seoKeyword.deleteMany();
  await db.seoDomainSnapshot.deleteMany();
  await db.backlinkSnapshot.deleteMany();
  await db.seoAuditSnapshot.deleteMany();
  await db.gscConnection.deleteMany();
  await db.publishAttempt.deleteMany();
  await db.approval.deleteMany();
  await db.post.deleteMany();
  await db.asset.deleteMany();
  await db.briefAttachment.deleteMany();
  await db.contentBrief.deleteMany();
  await db.campaign.deleteMany();
  await db.channelConnection.deleteMany();
  await db.brandKit.deleteMany();
  await db.publishRule.deleteMany();
  await db.oAuthPending.deleteMany();
  await db.session.deleteMany();
  await db.client.deleteMany();

  const after = {
    clients: await db.client.count(),
    posts: await db.post.count(),
    briefs: await db.contentBrief.count(),
    settings: await db.agencySettings.count(),
    users: await db.agencyUser.findMany({
      select: { email: true, role: true },
    }),
  };

  console.log("Wiped demo/operational data.");
  console.log("Before:", before);
  console.log("After:", {
    clients: after.clients,
    posts: after.posts,
    briefs: after.briefs,
  });
  console.log("Preserved AgencySettings rows:", after.settings);
  console.log(
    "Preserved users:",
    after.users.map((u) => `${u.email} (${u.role})`).join(", ")
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
