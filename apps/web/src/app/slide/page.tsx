"use client";

import { useState } from "react";
import { COLORS, GroupedBarChart, LineChartSvg, PieChartSvg } from "./charts";

type SlideId =
  | "title"
  | "cost"
  | "efficiency"
  | "accuracy"
  | "hidden"
  | "scorecard"
  | "verdict";

const SLIDES: Array<{ id: SlideId; label: string; n: number }> = [
  { id: "title", label: "Overview", n: 1 },
  { id: "cost", label: "Cost", n: 2 },
  { id: "efficiency", label: "Efficiency", n: 3 },
  { id: "accuracy", label: "Accuracy", n: 4 },
  { id: "hidden", label: "Hidden edges", n: 5 },
  { id: "scorecard", label: "Scorecard", n: 6 },
  { id: "verdict", label: "Verdict", n: 7 },
];

function SlideChrome({
  n,
  title,
  subtitle,
  children,
}: {
  n: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="slide-panel">
      <div className="slide-meta">
        <span className="slide-kicker">Slide {n} / 7</span>
        <span className="muted">Semrush vs Agency OS · comparison deck</span>
      </div>
      <h1>{title}</h1>
      <p className="muted slide-sub">{subtitle}</p>
      <div className="slide-body">{children}</div>
    </section>
  );
}

function TitleSlide() {
  return (
    <SlideChrome
      n={1}
      title="Semrush vs Agency OS"
      subtitle="Cost, efficiency, accuracy, and workflow advantages for agencies that research → brief → draft → publish → report."
    >
      <div className="stats">
        <div className="stat">
          <div className="label">Semrush annual (typ.)</div>
          <div className="value" style={{ color: "var(--bad)" }}>
            ~$6–12k
          </div>
        </div>
        <div className="stat">
          <div className="label">Agency OS annual (typ.)</div>
          <div className="value" style={{ color: "var(--ok)" }}>
            ~$1.5–3k
          </div>
        </div>
        <div className="stat">
          <div className="label">Workspace hops</div>
          <div className="value">1</div>
        </div>
      </div>

      <div className="slide-callout info">
        <strong>How to read this deck</strong>
        <p>
          Semrush wins as a broad SEO research index. Agency OS wins as the
          operating system for client work: keywords feed Claude briefs, drafts
          publish to social/blog, ranks come from Search Console, and monthly
          reports stay in one place. Charts use modeled 10-client agency figures
          (not vendor quotes).
        </p>
      </div>

      <div className="slide-grid-2">
        <div className="panel">
          <h2>Semrush strength</h2>
          <p>
            Massive proprietary crawl, keyword DB, competitive intel, and
            agency-ready SEO reporting. Best when research depth is the product.
          </p>
        </div>
        <div className="panel">
          <h2>Agency OS strength</h2>
          <p>
            End-to-end agency loop with DataForSEO + free GSC data, Claude
            content, hybrid publish, and client reports — without paying for a
            second content/social stack.
          </p>
        </div>
      </div>
    </SlideChrome>
  );
}

function CostSlide() {
  return (
    <SlideChrome
      n={2}
      title="Cost: total cost of ownership"
      subtitle="Modeled annual spend for a 10-client agency. Semrush = Business seat + common add-ons; Agency OS = hosting + Claude + DataForSEO usage."
    >
      <div className="slide-grid-2">
        <div className="panel">
          <h2>Annual TCO by category (USD / year)</h2>
          <GroupedBarChart
            categories={[
              "SEO data",
              "Content AI",
              "Publish / social",
              "Seats tax",
              "Hosting",
            ]}
            series={[
              {
                name: "Semrush stack",
                data: [6000, 1800, 2400, 1200, 0],
                color: COLORS.semrush,
              },
              {
                name: "Agency OS stack",
                data: [900, 1200, 0, 0, 360],
                color: COLORS.agency,
              },
            ]}
            valuePrefix="$"
            height={260}
          />
          <p className="muted slide-caption">
            Source: modeled TCO · Semrush Business + Content/Social-class
            add-ons vs Agency OS + Claude + DataForSEO pay-as-you-go
          </p>
        </div>
        <div className="panel">
          <h2>Where Agency OS dollars go</h2>
          <PieChartSvg
            donut
            size={210}
            data={[
              { label: "Claude / AI drafts", value: 1200, color: COLORS.info },
              { label: "DataForSEO API", value: 900, color: COLORS.warn },
              { label: "Hosting / infra", value: 360, color: COLORS.muted },
            ]}
          />
          <p className="muted slide-caption">
            Search Console is free; you pay for research API calls you actually
            make — not a flat crawl index subscription.
          </p>
        </div>
      </div>

      <div className="panel">
        <h2>Cumulative spend over 12 months (USD)</h2>
        <LineChartSvg
          fill
          valuePrefix="$"
          categories={[
            "M1",
            "M2",
            "M3",
            "M4",
            "M5",
            "M6",
            "M7",
            "M8",
            "M9",
            "M10",
            "M11",
            "M12",
          ]}
          series={[
            {
              name: "Semrush stack",
              data: [
                950, 1900, 2850, 3800, 4750, 5700, 6650, 7600, 8550, 9500, 10450,
                11400,
              ],
              color: COLORS.semrush,
            },
            {
              name: "Agency OS stack",
              data: [
                280, 520, 760, 1000, 1240, 1480, 1720, 1960, 2200, 2440, 2680,
                2920,
              ],
              color: COLORS.agency,
            },
          ]}
        />
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Cost lever</th>
              <th>Semrush</th>
              <th>Agency OS</th>
              <th>Winner</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Base SEO platform</td>
              <td>~$140–500+/seat/mo</td>
              <td>Self-hosted + DFS usage</td>
              <td>Agency OS</td>
            </tr>
            <tr>
              <td>Real client rankings</td>
              <td>Paid tracker / limited GSC</td>
              <td>Native GSC OAuth (free)</td>
              <td>Agency OS</td>
            </tr>
            <tr>
              <td>Content production</td>
              <td>Add-on or separate tool</td>
              <td>Claude briefs + drafts</td>
              <td>Agency OS</td>
            </tr>
            <tr>
              <td>Social / blog publish</td>
              <td>Separate stack</td>
              <td>Hybrid publish in-product</td>
              <td>Agency OS</td>
            </tr>
            <tr>
              <td>Global keyword index</td>
              <td>Industry-leading crawl</td>
              <td>API-backed (DataForSEO)</td>
              <td>Semrush</td>
            </tr>
          </tbody>
        </table>
      </div>
    </SlideChrome>
  );
}

function EfficiencySlide() {
  return (
    <SlideChrome
      n={3}
      title="Efficiency: research → publish cycle time"
      subtitle="Fewer tool hops means less copy-paste, fewer logins, and faster client delivery."
    >
      <div className="stats">
        <div className="stat">
          <div className="label">Semrush tool hops</div>
          <div className="value">6–8</div>
        </div>
        <div className="stat">
          <div className="label">Agency OS workspace</div>
          <div className="value" style={{ color: "var(--ok)" }}>
            1
          </div>
        </div>
        <div className="stat">
          <div className="label">Time saved / brief</div>
          <div className="value" style={{ color: "var(--ok)" }}>
            ~45%
          </div>
        </div>
        <div className="stat">
          <div className="label">Keyword re-entry</div>
          <div className="value">0</div>
        </div>
      </div>

      <div className="slide-grid-2">
        <div className="panel">
          <h2>Minutes per client campaign cycle</h2>
          <GroupedBarChart
            horizontal
            height={280}
            valueSuffix=" min"
            categories={[
              "Keyword research",
              "Brief writing",
              "Draft generation",
              "Approval + publish",
              "Client report",
            ]}
            series={[
              {
                name: "Semrush + extras",
                data: [40, 35, 50, 45, 60],
                color: COLORS.semrush,
              },
              {
                name: "Agency OS",
                data: [25, 12, 18, 20, 15],
                color: COLORS.agency,
              },
            ]}
          />
        </div>
        <div className="panel">
          <h2>Workflow friction share (Semrush path)</h2>
          <PieChartSvg
            size={200}
            data={[
              { label: "Actual SEO analysis", value: 35, color: COLORS.info },
              {
                label: "Tool switching / export",
                value: 25,
                color: COLORS.warn,
              },
              {
                label: "Rewriting into content tools",
                value: 22,
                color: COLORS.semrush,
              },
              { label: "Report assembly", value: 18, color: COLORS.muted },
            ]}
          />
          <p className="muted slide-caption">
            Roughly half of calendar time on a Semrush-centric path is logistics,
            not insight.
          </p>
        </div>
      </div>

      <div className="panel">
        <h2>Throughput: campaigns / week (team of 2)</h2>
        <LineChartSvg
          fill
          categories={["Wk1", "Wk2", "Wk3", "Wk4", "Wk5", "Wk6", "Wk7", "Wk8"]}
          series={[
            {
              name: "Semrush + Docs + Canva + Buffer",
              data: [3, 3, 4, 3, 4, 4, 3, 4],
              color: COLORS.semrush,
            },
            {
              name: "Agency OS",
              data: [4, 5, 6, 6, 7, 7, 8, 8],
              color: COLORS.agency,
            },
          ]}
        />
      </div>
    </SlideChrome>
  );
}

function AccuracySlide() {
  return (
    <SlideChrome
      n={4}
      title="Accuracy: what “truth” means for clients"
      subtitle="Semrush estimates the open web. Agency OS prioritizes verified client Search Console data for ranks, with DataForSEO for research."
    >
      <div className="slide-callout warn">
        <strong>Different accuracy jobs</strong>
        <p>
          Semrush is stronger for competitive market maps. Agency OS is stronger
          for “what is our client ranking for right now?” because GSC is
          first-party Google data.
        </p>
      </div>

      <div className="slide-grid-2">
        <div className="panel">
          <h2>Fit score by accuracy job (0–100)</h2>
          <GroupedBarChart
            yMax={100}
            height={260}
            categories={[
              "Competitor map",
              "Volume estimates",
              "Client ranks",
              "Brief fidelity",
              "Publish attribution",
            ]}
            series={[
              {
                name: "Semrush",
                data: [95, 92, 70, 55, 40],
                color: COLORS.info,
              },
              {
                name: "Agency OS",
                data: [72, 70, 96, 90, 88],
                color: COLORS.agency,
              },
            ]}
          />
        </div>
        <div className="panel">
          <h2>Rank data source mix (Agency OS)</h2>
          <PieChartSvg
            donut
            size={210}
            data={[
              {
                label: "Google Search Console",
                value: 70,
                color: COLORS.agency,
              },
              {
                label: "DataForSEO research",
                value: 25,
                color: COLORS.info,
              },
              { label: "Manual / demo", value: 5, color: COLORS.muted },
            ]}
          />
          <p className="muted slide-caption">
            Agency OS keeps “real ranks” and “research opportunities” in
            separate, labeled surfaces.
          </p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Signal</th>
              <th>Semrush</th>
              <th>Agency OS</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Client organic queries</td>
              <td>Estimate / tracker</td>
              <td>GSC search analytics</td>
              <td>GSC = ground truth</td>
            </tr>
            <tr>
              <td>Keyword opportunities</td>
              <td>Deep proprietary DB</td>
              <td>DFS + select-for-brief</td>
              <td>Semrush deeper; OS actionable</td>
            </tr>
            <tr>
              <td>Backlink overview</td>
              <td>Strong index</td>
              <td>DFS snapshot + cache</td>
              <td>Semrush richer historically</td>
            </tr>
            <tr>
              <td>Content quality</td>
              <td>Writing assist add-ons</td>
              <td>Claude + brand files</td>
              <td>OS stronger on-brand</td>
            </tr>
          </tbody>
        </table>
      </div>
    </SlideChrome>
  );
}

function HiddenSlide() {
  const cards = [
    {
      tag: "Workflow",
      title: "Keyword → brief → Claude",
      body: "Selected SEO keywords prefill Create content. Research intent survives into the draft.",
    },
    {
      tag: "Ops",
      title: "Approve + publish in-product",
      body: "Hybrid rules and social/blog publish — Semrush research still needs a separate publishing layer.",
    },
    {
      tag: "Cost",
      title: "Pay for usage, not seats tax",
      body: "DataForSEO scales with API calls. Adding a junior doesn’t require another Semrush seat.",
    },
    {
      tag: "Data",
      title: "You own the workspace DB",
      body: "Clients, briefs, posts, and rank snapshots live in your Postgres — portable and queryable.",
    },
    {
      tag: "Local",
      title: "Locality packs + checklist",
      body: "Industry + locality keyword packs and NAP/GBP checklists without a separate local SEO SKU.",
    },
    {
      tag: "Clients",
      title: "One-click monthly report",
      body: "Print/PDF blends ranks, published content, backlinks, and site score — optional Slack notify.",
    },
  ];

  return (
    <SlideChrome
      n={5}
      title="Hidden advantages"
      subtitle="Benefits that don’t show up on a Semrush feature matrix — but dominate day-to-day agency P&L."
    >
      <div className="slide-grid-2">
        {cards.map((c) => (
          <div className="panel" key={c.title}>
            <div className="slide-card-tag">{c.tag}</div>
            <h2>{c.title}</h2>
            <p>{c.body}</p>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Advantage weight for a delivery agency (relative)</h2>
        <GroupedBarChart
          yMax={100}
          height={240}
          categories={[
            "Workflow glue",
            "Seat tax",
            "Reporting speed",
            "Data ownership",
            "SERP index",
            "Brand drafts",
          ]}
          series={[
            {
              name: "Value to Agency OS buyer",
              data: [95, 88, 90, 85, 55, 92],
              color: COLORS.agency,
            },
            {
              name: "Value if buying Semrush alone",
              data: [40, 35, 60, 45, 98, 50],
              color: COLORS.info,
            },
          ]}
        />
      </div>
    </SlideChrome>
  );
}

function ScorecardSlide() {
  return (
    <SlideChrome
      n={6}
      title="Scorecard"
      subtitle="Weighted for agencies that sell content + local/digital growth, not pure competitive intelligence retainers."
    >
      <div className="slide-grid-2">
        <div className="panel">
          <h2>Category scores (0–10)</h2>
          <GroupedBarChart
            yMax={10}
            height={280}
            categories={[
              "Cost",
              "Efficiency",
              "Accuracy*",
              "Workflow",
              "Reporting",
              "Index",
            ]}
            series={[
              {
                name: "Semrush",
                data: [4, 5, 8, 4, 6, 10],
                color: COLORS.info,
              },
              {
                name: "Agency OS",
                data: [9, 9, 8, 10, 9, 6],
                color: COLORS.agency,
              },
            ]}
          />
          <p className="muted slide-caption">
            *Accuracy is a draw by job: Semrush for market maps; Agency OS for
            first-party client ranks.
          </p>
        </div>
        <div className="panel">
          <h2>Weighted outcome mix (agency buyer)</h2>
          <PieChartSvg
            donut
            size={220}
            data={[
              { label: "Cost leverage", value: 25, color: COLORS.agency },
              { label: "Delivery speed", value: 25, color: COLORS.info },
              {
                label: "Client-facing accuracy",
                value: 20,
                color: COLORS.warn,
              },
              {
                label: "Publish + report loop",
                value: 20,
                color: COLORS.muted,
              },
              { label: "SERP index depth", value: 10, color: COLORS.semrush },
            ]}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Semrush</th>
              <th>Agency OS</th>
              <th>Edge</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Annual cost</td>
              <td>4 / 10</td>
              <td>9 / 10</td>
              <td>Agency OS</td>
            </tr>
            <tr>
              <td>Time to published asset</td>
              <td>5 / 10</td>
              <td>9 / 10</td>
              <td>Agency OS</td>
            </tr>
            <tr>
              <td>Competitive intel depth</td>
              <td>10 / 10</td>
              <td>6 / 10</td>
              <td>Semrush</td>
            </tr>
            <tr>
              <td>Client rank truth</td>
              <td>7 / 10</td>
              <td>9 / 10</td>
              <td>Agency OS</td>
            </tr>
            <tr>
              <td>Content + publish</td>
              <td>4 / 10</td>
              <td>10 / 10</td>
              <td>Agency OS</td>
            </tr>
            <tr>
              <td>Monthly client report</td>
              <td>6 / 10</td>
              <td>9 / 10</td>
              <td>Agency OS</td>
            </tr>
          </tbody>
        </table>
      </div>
    </SlideChrome>
  );
}

function VerdictSlide() {
  return (
    <SlideChrome
      n={7}
      title="Verdict"
      subtitle="Use Semrush when the deliverable is research. Use Agency OS when the deliverable is shipped client work."
    >
      <div className="stats">
        <div className="stat">
          <div className="label">Lower modeled annual cost</div>
          <div className="value" style={{ color: "var(--ok)" }}>
            ~3–4×
          </div>
        </div>
        <div className="stat">
          <div className="label">Campaigns / week after ramp</div>
          <div className="value" style={{ color: "var(--ok)" }}>
            ~2×
          </div>
        </div>
        <div className="stat">
          <div className="label">Client rank posture</div>
          <div className="value">GSC-first</div>
        </div>
      </div>

      <div className="slide-grid-2">
        <div className="panel">
          <h2>Choose Semrush when…</h2>
          <ul className="slide-list">
            <li>You sell deep competitive SEO audits as the product</li>
            <li>Analysts live in keyword DBs all day</li>
            <li>You need the widest proprietary crawl / backlink history</li>
            <li>Content and publishing already live elsewhere</li>
          </ul>
        </div>
        <div className="panel">
          <h2>Choose Agency OS when…</h2>
          <ul className="slide-list">
            <li>You run research → brief → draft → approve → publish → report</li>
            <li>Local/digital retainers need content + ranks + reports weekly</li>
            <li>Seat costs and tool-switching are eating margin</li>
            <li>You want GSC truth + DataForSEO without Semrush tax</li>
          </ul>
        </div>
      </div>

      <div className="panel">
        <h2>12-month value gap (USD saved vs Semrush stack)</h2>
        <LineChartSvg
          fill
          valuePrefix="$"
          categories={[
            "M1",
            "M2",
            "M3",
            "M4",
            "M5",
            "M6",
            "M7",
            "M8",
            "M9",
            "M10",
            "M11",
            "M12",
          ]}
          series={[
            {
              name: "Cumulative savings (Agency OS path)",
              data: [
                670, 1380, 2090, 2800, 3510, 4220, 4930, 5640, 6350, 7060, 7770,
                8480,
              ],
              color: COLORS.agency,
            },
          ]}
        />
      </div>

      <div className="slide-callout ok">
        <strong>North star</strong>
        <p>
          Agency OS is not “Semrush but cheaper.” It is the agency operating
          system: DataForSEO + Search Console for SEO signal, Claude for
          production, and one report surface for clients — so research actually
          ships.
        </p>
      </div>
    </SlideChrome>
  );
}

export default function SlidePage() {
  const [slide, setSlide] = useState<SlideId>("title");
  const idx = SLIDES.findIndex((s) => s.id === slide);

  return (
    <div className="slide-deck">
      <header className="slide-deck-header">
        <div>
          <p className="slide-brand">Agency OS</p>
          <h2 className="slide-deck-title">Comparison deck</h2>
        </div>
        <p className="muted slide-hint">Use pills or Previous / Next</p>
      </header>

      <nav className="slide-nav" aria-label="Slides">
        {SLIDES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`slide-pill${slide === s.id ? " active" : ""}`}
            onClick={() => setSlide(s.id)}
          >
            {s.n}. {s.label}
          </button>
        ))}
      </nav>

      <div className="slide-stage">
        {slide === "title" && <TitleSlide />}
        {slide === "cost" && <CostSlide />}
        {slide === "efficiency" && <EfficiencySlide />}
        {slide === "accuracy" && <AccuracySlide />}
        {slide === "hidden" && <HiddenSlide />}
        {slide === "scorecard" && <ScorecardSlide />}
        {slide === "verdict" && <VerdictSlide />}
      </div>

      <footer className="slide-footer">
        <button
          type="button"
          className="btn secondary"
          disabled={idx <= 0}
          onClick={() => setSlide(SLIDES[idx - 1].id)}
        >
          Previous
        </button>
        <p className="muted">
          Modeled figures for a 10-client agency · not vendor quotes
        </p>
        <button
          type="button"
          className="btn secondary"
          disabled={idx >= SLIDES.length - 1}
          onClick={() => setSlide(SLIDES[idx + 1].id)}
        >
          Next
        </button>
      </footer>
    </div>
  );
}
