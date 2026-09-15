#!/usr/bin/env node
//
// Builds assets/github-stats-terminal.svg from live GitHub data.
//
//   node scripts/generate-stats.mjs [username]
//
// GITHUB_TOKEN in the environment is optional locally (it only raises the REST
// rate limit); the workflow always passes one.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USER = process.argv[2] || process.env.GH_USER || "Abhishek84313";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "github-stats-terminal.svg");

const ACCENT = "#2E9EF7";
const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", HTML: "#e34c26", CSS: "#563d7c",
  Java: "#b07219", Python: "#3572a5", "C++": "#f34b7d", C: "#8f8f8f", "C#": "#178600",
  Shell: "#89e051", Dockerfile: "#384d54", Vue: "#41b883", SCSS: "#c6538c",
  PHP: "#4f5d95", Ruby: "#701516", Go: "#00add8", Rust: "#dea584", Kotlin: "#a97bff",
  Swift: "#f05138", Dart: "#00b4ab", "Jupyter Notebook": "#da5b0b", EJS: "#a91e50",
  Handlebars: "#f7931e", Makefile: "#427819", Svelte: "#ff3e00", Lua: "#000080",
};

const headers = {
  "User-Agent": "readme-stats-generator",
  Accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function allRepos() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await api(`/users/${USER}/repos?per_page=100&page=${page}&type=owner`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

// GitHub's contributions page is public HTML: each day cell carries a date and a
// tooltip holding the count. No token needed, and it is the same source the
// profile calendar renders from, so the numbers always agree with the profile.
async function contributionDays() {
  const res = await fetch(`https://github.com/users/${USER}/contributions`, {
    headers: { "User-Agent": "Mozilla/5.0 (readme-stats-generator)" },
  });
  if (!res.ok) throw new Error(`contributions -> ${res.status}`);
  const html = await res.text();

  const counts = new Map();
  const tip = /<tool-tip[^>]*\bfor="(contribution-day-component-[\d-]+)"[^>]*>([^<]*)</g;
  for (let m; (m = tip.exec(html)); ) {
    const n = /^([\d,]+)\s+contribution/.exec(m[2].trim());
    counts.set(m[1], n ? Number(n[1].replace(/,/g, "")) : 0);
  }

  const days = [];
  const cell = /data-date="([\d-]+)"\s+id="(contribution-day-component-[\d-]+)"/g;
  for (let m; (m = cell.exec(html)); ) {
    days.push({ date: m[1], count: counts.get(m[2]) ?? 0 });
  }
  if (!days.length) throw new Error("could not parse the contribution calendar");
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nf = (n) => n.toLocaleString("en-US");

function weeklyTotals(days, weeks = 52) {
  const out = [];
  for (let i = Math.max(0, days.length - weeks * 7); i < days.length; i += 7) {
    out.push(days.slice(i, i + 7).reduce((s, d) => s + d.count, 0));
  }
  return out.slice(-weeks);
}

function summarise({ user, repos }) {
  const owned = repos.filter((r) => !r.fork);
  const tally = new Map();
  for (const r of owned) if (r.language) tally.set(r.language, (tally.get(r.language) || 0) + 1);
  return {
    stars: repos.reduce((s, r) => s + r.stargazers_count, 0),
    forks: repos.reduce((s, r) => s + r.forks_count, 0),
    langs: [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    langTotal: [...tally.values()].reduce((s, n) => s + n, 0) || 1,
    since: new Date(user.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    stamp: new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }),
  };
}

// 720 wide is ~80% of GitHub's README column, so the card renders close to 1:1
// and the small monospace labels stay legible instead of being scaled to mush.
function buildTerminal({ user, repos, days }) {
  const s = summarise({ user, repos });
  const contributions = days.reduce((sum, d) => sum + d.count, 0);
  const W = 720, H = 318, X = 28;
  const MONO = `font-family="ui-monospace, SFMono-Regular, Consolas, monospace"`;

  const rows = [
    ["repositories", user.public_repos, ACCENT],
    ["total stars", s.stars, "#f2cc60"],
    ["total forks", s.forks, "#7ee787"],
    ["followers", user.followers, "#d2a8ff"],
    ["contributions (1y)", contributions, "#ff7b72"],
  ];
  const VX = 360;
  const statRows = rows.map(([label, value, color], i) => {
    const y = 92 + i * 18;
    const leaderX = X + 16 + label.length * 6.4 + 6;
    return `
    <g opacity="0">
      <text x="${X + 16}" y="${y}" ${MONO} font-size="11" fill="#8b949e">${esc(label)}</text>
      <line x1="${leaderX.toFixed(1)}" y1="${y - 3}" x2="${VX - 8 - String(nf(value)).length * 6.6}" y2="${y - 3}" stroke="#21262d" stroke-width="1" stroke-dasharray="1 3"/>
      <text x="${VX}" y="${y}" ${MONO} font-size="11.5" font-weight="700" fill="${color}" text-anchor="end">${nf(value)}</text>
      <animate attributeName="opacity" from="0" to="1" begin="${(0.2 + i * 0.12).toFixed(2)}s" dur="0.3s" fill="freeze"/>
    </g>`;
  }).join("");

  // 52-week contribution strip, drawn as terminal-ish ticks
  const weeks = weeklyTotals(days);
  const peak = Math.max(1, ...weeks);
  const TKX = X + 16, TKW = 640, TKB = 212, TKH = 30;
  const ticks = weeks.map((v, i) => {
    const h = Math.max(1.5, (v / peak) * TKH);
    return `<rect x="${(TKX + i * (TKW / weeks.length)).toFixed(1)}" y="${(TKB - h).toFixed(1)}" width="${(TKW / weeks.length - 3).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${v ? ACCENT : "#21262d"}" opacity="${v ? 0.9 : 1}"/>`;
  }).join("");

  const langRows = s.langs.slice(0, 4).map(([name, count], i) => {
    const y = 252 + i * 16;
    const pct = (count / s.langTotal) * 100;
    const lit = Math.max(1, Math.round((pct / 100) * 18));
    const blocks = Array.from({ length: 18 }, (_, b) =>
      `<rect x="${150 + b * 19}" y="${y - 7}" width="16" height="8" rx="1" fill="${b < lit ? LANG_COLORS[name] || "#6e7681" : "#1b2129"}"/>`
    ).join("");
    return `
    <g opacity="0">
      <text x="${X + 16}" y="${y}" ${MONO} font-size="10.5" fill="#c9d1d9">${esc(name)}</text>
      ${blocks}
      <text x="${W - X}" y="${y}" ${MONO} font-size="10.5" fill="#8b949e" text-anchor="end">${pct.toFixed(1)}%</text>
      <animate attributeName="opacity" from="0" to="1" begin="${(0.9 + i * 0.12).toFixed(2)}s" dur="0.3s" fill="freeze"/>
    </g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
     role="img" aria-label="GitHub analytics for ${esc(USER)} as a terminal readout">
  <title>${esc(USER)} — github stats, terminal readout</title>

  <rect width="${W}" height="${H}" rx="14" fill="#05080e"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="13.5" fill="none" stroke="#1f2937"/>
  <path d="M0,14 a14,14 0 0 1 14,-14 h${W - 28} a14,14 0 0 1 14,14 v26 h-${W} Z" fill="#11161f"/>
  <circle cx="28" cy="20" r="4" fill="#ff5f57"/>
  <circle cx="42" cy="20" r="4" fill="#febc2e"/>
  <circle cx="56" cy="20" r="4" fill="#28c840"/>
  <text x="${W / 2}" y="24" text-anchor="middle" ${MONO} font-size="10" fill="#8b949e">${esc(USER)}@github: ~/profile</text>

  <text x="${X}" y="68" ${MONO} font-size="11" fill="#c9d1d9"><tspan fill="#7ee787">$</tspan> gh api /users/${esc(USER)} --jq .stats</text>
  ${statRows}

  <text x="${X}" y="196" ${MONO} font-size="11" fill="#c9d1d9" opacity="0"><tspan fill="#7ee787">$</tspan> gh contributions --weeks ${weeks.length} --peak ${peak}
    <animate attributeName="opacity" from="0" to="1" begin="0.8s" dur="0.3s" fill="freeze"/>
  </text>
  <g opacity="0">
    ${ticks}
    <animate attributeName="opacity" from="0" to="1" begin="0.85s" dur="0.6s" fill="freeze"/>
  </g>

  <text x="${X}" y="236" ${MONO} font-size="11" fill="#c9d1d9" opacity="0"><tspan fill="#7ee787">$</tspan> gh languages --top 4
    <animate attributeName="opacity" from="0" to="1" begin="1.3s" dur="0.3s" fill="freeze"/>
  </text>
  ${langRows}

  <text x="${X}" y="${H - 16}" ${MONO} font-size="11" fill="#7ee787" opacity="0">$
    <animate attributeName="opacity" from="0" to="1" begin="1.8s" dur="0.2s" fill="freeze"/>
  </text>
  <rect x="${X + 10}" y="${H - 25}" width="6.5" height="12" fill="${ACCENT}" opacity="0">
    <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.45;0.46;0.72;0.73" dur="2.4s" begin="1.8s" repeatCount="indefinite"/>
  </rect>
  <text x="${W - X}" y="${H - 16}" ${MONO} font-size="8.5" fill="#6e7681" text-anchor="end">since ${esc(s.since)} · refreshed daily by GitHub Actions · ${esc(s.stamp)}</text>
</svg>
`;
}

const [user, repos, days] = await Promise.all([api(`/users/${USER}`), allRepos(), contributionDays()]);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buildTerminal({ user, repos, days }));

const total = days.reduce((s, d) => s + d.count, 0);
console.log(
  `wrote ${OUT}\n` +
  `  repos=${user.public_repos} followers=${user.followers} ` +
  `stars=${repos.reduce((s, r) => s + r.stargazers_count, 0)} ` +
  `forks=${repos.reduce((s, r) => s + r.forks_count, 0)} ` +
  `contributions(1y)=${total} days=${days.length}`
);
