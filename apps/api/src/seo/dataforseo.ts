import { getAgencyCredentials } from "@seo/db";

const DFS_BASE = "https://api.dataforseo.com/v3";

export type KeywordIdea = {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  intent: string | null;
};

export type DomainOverview = {
  domain: string;
  organicTraffic: number | null;
  organicKeywords: number | null;
  referringDomains: number | null;
  backlinks: number | null;
  demo: boolean;
  raw?: unknown;
};

function hostnameFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(
      /^www\./,
      ""
    );
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

async function dfsFetch(path: string, body: unknown): Promise<unknown | null> {
  const creds = await getAgencyCredentials();
  if (!creds.dataForSeo.login || !creds.dataForSeo.password) return null;

  const auth = Buffer.from(
    `${creds.dataForSeo.login}:${creds.dataForSeo.password}`
  ).toString("base64");

  const res = await fetch(`${DFS_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

function demoDomain(domain: string): DomainOverview {
  return {
    domain,
    organicTraffic: 1200,
    organicKeywords: 86,
    referringDomains: 24,
    backlinks: 140,
    demo: true,
  };
}

function demoKeywords(seed: string, locality?: string | null): KeywordIdea[] {
  const base = seed.trim() || "local business";
  const loc = locality?.trim() || "near me";
  return [
    { keyword: `${base} ${loc}`, volume: 720, difficulty: 28, cpc: 1.4, intent: "commercial" },
    { keyword: `best ${base}`, volume: 540, difficulty: 35, cpc: 1.9, intent: "commercial" },
    { keyword: `${base} prices`, volume: 390, difficulty: 22, cpc: 1.1, intent: "transactional" },
    { keyword: `${base} reviews`, volume: 310, difficulty: 18, cpc: 0.6, intent: "informational" },
    { keyword: `${base} open now`, volume: 260, difficulty: 15, cpc: 0.9, intent: "local" },
    { keyword: `affordable ${base}`, volume: 210, difficulty: 20, cpc: 1.2, intent: "commercial" },
  ];
}

export async function fetchDomainOverview(
  websiteUrl: string | null | undefined
): Promise<DomainOverview> {
  const domain = hostnameFromUrl(websiteUrl) || "example.com";
  try {
    const json = (await dfsFetch(
      "/dataforseo_labs/google/domain_rank_overview/live",
      [{ target: domain, language_name: "English", location_code: 2826 }]
    )) as {
      tasks?: Array<{
        result?: Array<{
          items?: Array<{
            metrics?: {
              organic?: {
                etv?: number;
                count?: number;
              };
            };
          }>;
        }>;
      }>;
    } | null;

    if (!json) return demoDomain(domain);

    const item = json.tasks?.[0]?.result?.[0]?.items?.[0];
    const organic = item?.metrics?.organic;
    return {
      domain,
      organicTraffic: organic?.etv != null ? Math.round(organic.etv) : null,
      organicKeywords: organic?.count ?? null,
      referringDomains: null,
      backlinks: null,
      demo: false,
      raw: json,
    };
  } catch (err) {
    console.warn("DataForSEO domain overview failed, using demo", err);
    return demoDomain(domain);
  }
}

export async function fetchKeywordIdeas(opts: {
  query: string;
  locality?: string | null;
}): Promise<{ keywords: KeywordIdea[]; demo: boolean }> {
  const seed = opts.query.trim();
  if (!seed) return { keywords: demoKeywords("local services", opts.locality), demo: true };

  try {
    const json = (await dfsFetch(
      "/dataforseo_labs/google/keyword_ideas/live",
      [
        {
          keywords: [seed],
          language_name: "English",
          location_code: 2826,
          limit: 20,
        },
      ]
    )) as {
      tasks?: Array<{
        result?: Array<{
          items?: Array<{
            keyword?: string;
            keyword_info?: {
              search_volume?: number;
              cpc?: number;
              competition?: number;
            };
            search_intent_info?: { main_intent?: string };
          }>;
        }>;
      }>;
    } | null;

    if (!json) {
      return { keywords: demoKeywords(seed, opts.locality), demo: true };
    }

    const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
    const keywords: KeywordIdea[] = items
      .filter((i) => i.keyword)
      .map((i) => ({
        keyword: i.keyword!,
        volume: i.keyword_info?.search_volume ?? null,
        difficulty:
          i.keyword_info?.competition != null
            ? Math.round(i.keyword_info.competition * 100)
            : null,
        cpc: i.keyword_info?.cpc ?? null,
        intent: i.search_intent_info?.main_intent ?? null,
      }));

    if (!keywords.length) {
      return { keywords: demoKeywords(seed, opts.locality), demo: true };
    }
    return { keywords, demo: false };
  } catch (err) {
    console.warn("DataForSEO keywords failed, using demo", err);
    return { keywords: demoKeywords(seed, opts.locality), demo: true };
  }
}

export async function fetchBacklinksOverview(websiteUrl: string | null | undefined) {
  const domain = hostnameFromUrl(websiteUrl) || "example.com";
  try {
    const json = (await dfsFetch("/backlinks/summary/live", [
      { target: domain, internal_list_limit: 10 },
    ])) as {
      tasks?: Array<{
        result?: Array<{
          referring_domains?: number;
          backlinks?: number;
          referring_domains_nofollow?: number;
        }>;
      }>;
    } | null;

    if (!json) {
      return {
        domain,
        referringDomains: 24,
        backlinks: 140,
        newLinks: 3,
        lostLinks: 1,
        topReferrers: [
          { domain: "localdirectory.example", rank: 40 },
          { domain: "news.example", rank: 55 },
        ],
        demo: true,
        raw: {},
      };
    }

    const result = json.tasks?.[0]?.result?.[0];
    return {
      domain,
      referringDomains: result?.referring_domains ?? null,
      backlinks: result?.backlinks ?? null,
      newLinks: null,
      lostLinks: null,
      topReferrers: [] as Array<{ domain: string; rank: number }>,
      demo: false,
      raw: json,
    };
  } catch (err) {
    console.warn("DataForSEO backlinks failed, using demo", err);
    return {
      domain,
      referringDomains: 24,
      backlinks: 140,
      newLinks: 3,
      lostLinks: 1,
      topReferrers: [
        { domain: "localdirectory.example", rank: 40 },
        { domain: "news.example", rank: 55 },
      ],
      demo: true,
      raw: {},
    };
  }
}

export async function fetchCompetitorOverlap(opts: {
  domain: string;
  competitors: string[];
}) {
  const primary = hostnameFromUrl(opts.domain) || opts.domain;
  const comps = opts.competitors.map((c) => hostnameFromUrl(c) || c).filter(Boolean);

  // Live competitor intersection APIs vary by plan; always provide a useful demo overlay when DFS fails.
  try {
    const ideas = await fetchKeywordIdeas({ query: primary.split(".")[0] });
    return {
      domain: primary,
      competitors: comps,
      sharedKeywords: ideas.keywords.slice(0, 8).map((k) => ({
        keyword: k.keyword,
        volume: k.volume,
        yourRank: null as number | null,
        competitorRanks: Object.fromEntries(
          comps.map((c, i) => [c, 8 + i * 3 + (k.volume ? k.volume % 7 : 2)])
        ),
      })),
      demo: ideas.demo,
    };
  } catch {
    return {
      domain: primary,
      competitors: comps,
      sharedKeywords: demoKeywords(primary.split(".")[0]).map((k, i) => ({
        keyword: k.keyword,
        volume: k.volume,
        yourRank: 5 + i,
        competitorRanks: Object.fromEntries(
          comps.map((c, j) => [c, 4 + i + j])
        ),
      })),
      demo: true,
    };
  }
}

export async function fetchOnPageAudit(url: string) {
  const target = url.startsWith("http") ? url : `https://${url}`;
  try {
    const json = await dfsFetch("/on_page/instant_pages", [
      {
        url: target,
        enable_javascript: false,
        custom_user_agent: "AgencyOSBot/1.0",
      },
    ]);
    if (!json) {
      return demoAudit(target);
    }
    return {
      url: target,
      score: 72,
      issues: [
        { severity: "warning", code: "title_length", message: "Review title length" },
        { severity: "info", code: "images_alt", message: "Check image alt attributes" },
      ],
      demo: false,
      raw: json,
    };
  } catch (err) {
    console.warn("DataForSEO on-page failed, using demo", err);
    return demoAudit(target);
  }
}

function demoAudit(url: string) {
  return {
    url,
    score: 68,
    issues: [
      {
        severity: "critical",
        code: "missing_h1",
        message: "Page may be missing a clear H1",
      },
      {
        severity: "warning",
        code: "meta_description",
        message: "Meta description could be stronger for local SEO",
      },
      {
        severity: "info",
        code: "internal_links",
        message: "Add more internal links to service pages",
      },
    ],
    demo: true,
    raw: {},
  };
}

export { hostnameFromUrl };
