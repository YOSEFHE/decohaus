---
name: decohaus-seo
description: Run evidence-led SEO, GEO/AEO, technical SEO, content, schema, indexing, hreflang, and AI-search readiness work for decohaus.ir. Use for DecoHaus SEO audits, fixes, content roadmaps, indexing checks, schema changes, Core Web Vitals, bilingual /fa/ and /en/ SEO, or BanaIQ search visibility.
---

# DecoHaus SEO

Use this skill for SEO work on `https://decohaus.ir/` and its Persian and English sections.

## Upstream SEO engine

Prefer the installed Codex SEO orchestrator at `${CODEX_HOME:-$HOME/.codex}/skills/seo/SKILL.md` for specialist workflows. If it is not installed, do not improvise a partial copy of the upstream suite. Report that the one-time project setup is missing and run or ask the user to run:

```bash
bash scripts/install-codex-seo.sh
```

After installation, restart/reload Codex if skill discovery does not refresh automatically.

## Project profile

Read `references/site-profile.md` before making recommendations or code changes.

Key constraints:

- Primary domain: `decohaus.ir`.
- Persian-first architecture with parallel `/fa/` and `/en/` experiences.
- Preserve correct canonicals and reciprocal hreflang behavior across language equivalents.
- BanaIQ is the public construction-intelligence product name; BuildPilot is an internal/core name and must not replace BanaIQ in public SEO copy unless explicitly requested.
- Do not expose confidential employer, client, project, contract, or infrastructure details in public-facing SEO content.
- Prefer technically correct, human copy over keyword stuffing or generic AI-written filler.
- Treat SEO and GEO/AEO as one evidence-led system: classic search visibility, entity clarity, structured data, answerability, crawlability, and AI citation readiness all matter.

## Workflow

1. Establish the exact target: whole site, section, page, query cluster, or technical issue.
2. Gather live evidence before recommending changes. Use crawl/page inspection, source HTML, structured data, sitemap/robots, Search Console or other configured providers when available.
3. When multiple signals conflict, prefer direct URL-level evidence over aggregate counters. Call out the conflict instead of silently choosing the convenient number.
4. Route specialist work through the upstream `seo` skill when available, selecting only the workflows needed for the task.
5. For bilingual pages, verify canonical, hreflang, language attribute, metadata parity, navigation/internal linking, and whether translated pages target equivalent intent rather than literal translation only.
6. For content work, map each page to a distinct search intent and avoid cannibalization. Keep DecoHaus positioning around architecture, project delivery, construction management, and construction intelligence coherent.
7. For BanaIQ pages, optimize for decision intelligence, construction/project decision workflows, evidence, risk, actions, contracts/procurement, and traceability without overstating product maturity.
8. For schema, only emit properties supported by visible page content or verified business facts. Never fabricate reviews, awards, addresses, ratings, dates, people, or project claims.
9. Before changing code/content, record the reason, affected URL(s), expected search impact, and validation method.
10. After changes, re-crawl/reinspect the affected pages and verify no regressions in canonical, hreflang, status codes, indexing directives, structured data, responsive rendering, and internal links.

## Output standard

For audits, report findings in priority order:

- `P0`: blocks crawling/indexing or causes severe search loss.
- `P1`: material ranking/visibility or entity-understanding issue.
- `P2`: meaningful optimization opportunity.
- `P3`: polish/low-impact improvement.

Every actionable finding should include the affected URL/path, evidence, exact recommended change, and validation step. Avoid long generic SEO checklists when the site already passes those checks.

For implementation tasks, make the smallest coherent change set, then verify it. Do not rewrite unrelated site copy merely to increase word count.
