import path from "path";
import { config } from "dotenv";
config({ path: path.resolve(__dirname, "../../../.env") });
config({ path: path.resolve(__dirname, "../../../packages/db/.env") });
import { db } from "@seo/db";
import { hashPassword } from "./auth";

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? "reachline-demo";

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
    update: {
      passwordHash,
    },
  });
  console.log(
    `Agency login: ${user.email} / ${DEFAULT_PASSWORD} (change after first login)`
  );
  return user;
}

async function main() {
  await ensureEditorUser();

  const existing = await db.client.findUnique({ where: { slug: "demo-local" } });
  if (existing) {
    console.log("Demo client already present:", existing.id);
    return;
  }

  const old = await db.client.findUnique({ where: { slug: "demo-bistro" } });
  if (old) {
    await db.client.update({
      where: { id: old.id },
      data: {
        name: "Demo Local Services",
        slug: "demo-local",
        industry: "Restaurant",
      },
    });
    console.log("Migrated demo client to multi-industry seed:", old.id);
    return;
  }

  const client = await db.client.create({
    data: {
      name: "Demo Local Services",
      slug: "demo-local",
      industry: "Restaurant",
      locality: "Manchester",
      websiteUrl: "https://example.com",
      phone: "+44 161 000 0000",
      address: "12 Market Street, Manchester",
      brandKit: {
        create: {
          voiceTone: "professional, local, friendly",
          tagline: "Trusted locally",
          primaryColor: "#C45C26",
          secondaryColor: "#1A1A1A",
          bannedWords: ["cheap", "worst"],
          bannedClaims: [],
        },
      },
      publishRule: {
        create: {
          autoPublishEnabled: true,
          allowlistedTypes: ["DAILY_SPECIAL", "GENERAL"],
          forceApprovalTypes: ["PROMO", "BLOG", "PICTURE_AD"],
          requireApprovalFirstN: 3,
          minConfidence: 0.7,
          postingWindows: [
            { days: [1, 2, 3, 4, 5], startHour: 10, endHour: 20 },
            { days: [6, 0], startHour: 11, endHour: 18 },
          ],
          quietHours: { startHour: 22, endHour: 8 },
        },
      },
      channelConnections: {
        create: [
          {
            platform: "WEBSITE_BLOG",
            accountLabel: "Website embed",
            connected: true,
            metadata: { mode: "embed" },
          },
        ],
      },
    },
  });

  console.log("Seeded client", client.name, client.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
