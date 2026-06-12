// @productmap/templates — four real document templates (Task 1C).
import type { DocType } from '@productmap/shared';

export interface DocTemplate {
  type: DocType;
  name: string; // "Product requirements (PRD)"
  description: string; // one-liner for the picker
  markdownBody: string; // full markdown skeleton with ## sections
  promptHints: string; // guidance prepended to the AI generation prompt
}

const PRD_BODY = `# {{title}}

## Overview

*One or two sentences: what is this and why now?*

## Problem & opportunity

*What problem are we solving and for whom? What evidence do we have that it matters?*

## Goals & success metrics

*What does success look like? Each goal should pair with a measurable metric and a target.*

- Goal: … — Metric: … — Target: …
- Goal: … — Metric: … — Target: …

## Non-goals

*What are we deliberately not doing in this release? Be explicit to prevent scope creep.*

- …

## Users & use cases

*Who uses this and in what situations? One line per persona and the job they're trying to do.*

| Persona | Use case |
| --- | --- |
| … | … |

## Requirements

*Mark each requirement Must / Should / Won't. Keep them testable.*

| Priority | Requirement |
| --- | --- |
| Must | … |
| Should | … |
| Won't | … |

## UX notes

*Key flows, states, and edge cases. Link mockups if they exist. Note loading, empty, and error states.*

## Risks & open questions

*What could derail this? What decisions are still pending, and who owns them?*

- [ ] …

## Launch checklist

*Everything that must be true before we ship.*

- [ ] Requirements signed off
- [ ] Designs reviewed
- [ ] Test plan in place
- [ ] Docs / announcement drafted
- [ ] Rollout & rollback plan agreed
`;

const BRD_BODY = `# {{title}}

## Executive summary

*Three to five sentences a busy executive can read: the ask, the value, the cost, the timeline.*

## Business objectives

*Which company or team objectives does this serve? Tie each one to a measurable outcome.*

- Objective: … — Outcome: …
- Objective: … — Outcome: …

## Background

*What's the current situation and how did we get here? Include relevant history, prior attempts, and market context.*

## Stakeholders

*Who is involved, affected, or must approve? One row each with their role in this initiative.*

| Stakeholder | Role | Interest |
| --- | --- | --- |
| … | … | … |

## Scope

*Draw the boundary clearly: what is in, what is out.*

**In scope**

- …

**Out of scope**

- …

## Business requirements

*What the business needs the solution to do, independent of how it's built. Number them for traceability.*

1. BR-1: …
2. BR-2: …

## Cost-benefit

*Estimated cost (build, run, opportunity) versus expected benefit (revenue, savings, risk reduction). Rough numbers beat no numbers.*

| Item | Estimate |
| --- | --- |
| Cost | … |
| Benefit | … |

## Constraints & assumptions

*Budget, deadline, regulatory, technical, or staffing constraints — and the assumptions this case rests on.*

- Constraint: …
- Assumption: …

## Approval

*Who signs off, and what does approval unlock?*

| Approver | Role | Date |
| --- | --- | --- |
| … | … | … |
`;

const TECH_SPEC_BODY = `# {{title}}

## Summary

*One paragraph: what are we building and what is the high-level approach?*

## Context

*The current state of the system and the problem driving this change. Link the PRD or brief if one exists.*

## Goals & non-goals

*What this design must achieve, and what it explicitly does not attempt.*

**Goals**

- …

**Non-goals**

- …

## Proposed design

*The core of the spec: architecture, components, data flow, and key decisions. Diagrams welcome. Explain why this approach, not just what.*

## Alternatives considered

*What other approaches were evaluated and why were they rejected? One short paragraph each.*

- **Alternative A:** … — rejected because …

## Data model changes

*New tables/columns, migrations, indexes, and backfill strategy. Note anything destructive.*

## API changes

*New or changed endpoints, request/response shapes, versioning, and backward compatibility.*

\`\`\`
METHOD /path → response
\`\`\`

## Security & privacy

*Threats, authn/authz changes, data sensitivity, PII handling, and audit requirements.*

## Rollout plan

*How this ships: flags, phases, migration order, monitoring, and the rollback story.*

1. …

## Open questions

*Unresolved decisions, with an owner and a deadline for each.*

- [ ] …
`;

const FEATURE_BRIEF_BODY = `# {{title}}

## Problem

*What's broken or missing, for whom, and how do we know? Two or three sentences.*

## Hypothesis

*If we build X, then Y will happen, because Z. Make it falsifiable.*

## Proposed solution

*One paragraph describing the smallest thing that tests the hypothesis. No implementation detail.*

## Success metric

*The single number that tells us this worked, its current baseline, and the target.*

- Metric: …
- Baseline: …
- Target: …

## Effort guess

*S / M / L — gut feel from whoever knows the codebase best, with one line of reasoning.*

- Size: …
- Why: …

## Links

*Related docs, designs, tickets, conversations.*

- …
`;

const IDEA_PITCH_BODY = `# {{title}}

## Problem

*What hurts, for whom, and how badly? Two or three sentences — if you can't state the problem without mentioning your solution, keep digging.*

## Who's asking (evidence)

*Name names: customers, calls, tickets, dogfooding moments. Weak evidence is fine; pretending it's strong is not.*

- Source: … — What they said/did: …
- Source: … — What they said/did: …

## Proposed direction

*One paragraph sketching the smallest credible answer. Direction, not design — no screens, no schemas.*

## Why now

*What makes this cheaper, more valuable, or more urgent today than six months ago or six months from now?*

## Open questions

*The things that would change your mind, with whoever can answer them.*

- [ ] …

## Effort gut-check

*S / M / L from gut feel — one line on what makes it that size, and what would make it smaller.*

- Size: …
- Why: …
`;

const RELEASE_NOTES_BODY = `# {{title}}

## Highlights

*Two or three sentences a customer actually reads: the headline changes and why they matter.*

## What's new

*The features. One bullet each — lead with the user benefit, not the implementation.*

- …

## Improvements

*Smaller upgrades to existing behavior: faster, clearer, fewer clicks.*

- …

## Fixes

*Bugs squashed. Be specific enough that the person who reported it recognizes their bug.*

- …

## Thanks

*Customers, beta testers, and teammates who shaped this release.*

- …
`;

export const TEMPLATES: Record<DocType, DocTemplate> = {
  prd: {
    type: 'prd',
    name: 'Product requirements (PRD)',
    description: 'Full requirements doc: problem, goals, prioritized requirements, launch checklist.',
    markdownBody: PRD_BODY,
    promptHints:
      "Write a complete PRD. Be specific about user problems and measurable success metrics. Mark requirements Must/Should/Won't. Cover non-goals explicitly so scope is unambiguous. Keep it under 800 words.",
  },
  brd: {
    type: 'brd',
    name: 'Business requirements (BRD)',
    description: 'Business case: objectives, stakeholders, scope, cost-benefit, approval.',
    markdownBody: BRD_BODY,
    promptHints:
      'Write a business requirements document aimed at decision-makers, not engineers. Lead with the executive summary. Tie every requirement to a business objective and a measurable outcome. Give rough but concrete cost-benefit numbers. Keep it under 700 words.',
  },
  tech_spec: {
    type: 'tech_spec',
    name: 'Technical spec',
    description: 'Engineering design: proposed design, alternatives, data/API changes, rollout.',
    markdownBody: TECH_SPEC_BODY,
    promptHints:
      'Write a technical design spec for engineers. Explain the proposed design concretely — components, data flow, and the reasoning behind key decisions. Always include at least one alternative considered and why it was rejected. Call out security implications and a rollback plan. Keep it under 900 words.',
  },
  feature_brief: {
    type: 'feature_brief',
    name: 'Feature brief',
    description: 'One-pager: problem, hypothesis, solution sketch, success metric, effort guess.',
    markdownBody: FEATURE_BRIEF_BODY,
    promptHints:
      'Write a one-page feature brief. Be ruthless about brevity: one falsifiable hypothesis, one paragraph of solution, one success metric with a baseline and target. Give an S/M/L effort guess with one line of reasoning. Keep it under 300 words.',
  },
  idea_pitch: {
    type: 'idea_pitch',
    name: 'Idea pitch',
    description: 'Sell an idea: problem, evidence, direction, why now, effort gut-check.',
    markdownBody: IDEA_PITCH_BODY,
    promptHints:
      'Write an idea pitch that earns a slot on the roadmap. State the problem without referencing the solution, cite concrete evidence (who asked, where), and argue why now. Keep the proposed direction to one paragraph and close with an S/M/L gut-check. Keep it under 400 words.',
  },
  release_notes: {
    type: 'release_notes',
    name: 'Release notes',
    description: 'Customer-facing notes: highlights, what’s new, improvements, fixes, thanks.',
    markdownBody: RELEASE_NOTES_BODY,
    promptHints:
      'Write customer-facing release notes. Lead every bullet with the user benefit, never the implementation. Keep the highlights to three sentences, group changes under What’s new / Improvements / Fixes, and thank the people who helped. Keep it under 400 words.',
  },
};
