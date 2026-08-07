# Genesis Post-Freeze — Executive Prompt Architecture

## Scope
Prompt/intelligence delegation only. No G4/G5 lifecycle, routing, evidence, approval, queue or execution semantics are changed.

## Compiled commercial leadership team

1. **Chief Commercial Strategy Officer** — Business Understanding
   - Turns first-party website evidence into commercial mechanics, ICP/anti-ICP and campaign strategy.
   - Decision standard: would senior sales capacity be deliberately allocated here?
   - Reasoning effort: medium.
   - Prompt: `business-discovery/v2-executive`.

2. **VP Market Intelligence & Territory Strategy** — Company Discovery
   - Maps the market through observable operating conditions, multiple search lenses and falsification.
   - Decision standard: is this account worth an account executive's scarce time?
   - Reasoning effort: medium.
   - Prompt policy/fingerprint: `company-discovery/v3-executive-market-intelligence`.

3. **VP Account Mapping & Buying Committees** — Route Intelligence / Contact Finder
   - Seeks minimum sufficient authority, not maximum seniority.
   - Explicitly considers company scale, organisational depth, likely commercial commitment, budget authority, routing power and buying-committee role.
   - Never invents a budget; when spend is unknown it uses a conservative authority band and records uncertainty.
   - Decision standard: which verified person/route is closest to the authority level required to progress the likely purchase?
   - Reasoning effort: high.
   - Prompt policy/fingerprint: `contact-discovery/v4-executive-account-mapping`.

4. **Chief Revenue Officer / Executive Deal Strategist** — G5 Commercial Reasoning
   - Builds the truthful deal thesis from immutable G4 intelligence.
   - Uses observed condition -> implication -> consequence -> relevance -> unknown -> validation conversation.
   - Includes falsification and a reason-to-reply test.
   - Reasoning effort: high.
   - Prompt: `g5-commercial-reasoning/v2-executive-deal-strategy`.

5. **VP Sales Development** — G5 Channel Strategy
   - Chooses the first move with the highest probability of creating the right conversation, not merely the easiest channel.
   - Considers sufficient authority, relevance, accessibility, routing power, friction and sequence.
   - Reasoning effort: medium.
   - Prompt: `g5-channel-strategy/v2-vp-sales-development`.

6. **Executive Communications Director** — G5 Outreach Generation
   - Expresses the approved insight with executive-grade brevity, humanity and restraint.
   - Uses observation -> plausibly framed implication -> credible relevance -> low-friction question.
   - Email guidance normally targets ~50–100 words where possible; LinkedIn is materially shorter; switchboard is routing, not pitching.
   - Reasoning effort: low because strategy is already decided upstream.
   - Prompt: `g5-outreach-generation/v4-executive-communications`.

7. **Chief Revenue Risk & Quality Officer** — G5 Self Review
   - Independent adversarial review through Truth, Sales and Human gates plus recipient nine-second simulation.
   - PASS requires safe and commercially strong output; accurate-but-mediocre outreach is rewritten.
   - Reasoning effort: high.
   - Prompt: `g5-self-review/v2-chief-revenue-risk`.

## Universal doctrine
- **KNOWN**: supported fact.
- **INFERRED**: commercially reasonable interpretation, never presented as known.
- **UNKNOWN**: gap to preserve, not fill.
- Every research/strategy agent performs a falsification check before finalising.
- Commercial judgement is optimised over task completion.
- G4 truth remains immutable and downstream agents cannot create new facts/routes.

## Backward compatibility
Existing G5 records using historical prompt versions remain readable by Zod parsers. New OpenAI Structured Output schemas accept only the new prompt version. Migration `0089_genesis_post_freeze_executive_prompt_architecture.sql` updates only the existing fenced persistence RPC prompt-version checks; schema versions remain unchanged.
