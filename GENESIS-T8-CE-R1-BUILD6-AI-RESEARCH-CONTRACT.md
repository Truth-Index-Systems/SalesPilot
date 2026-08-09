# Genesis T8 — Commercial Engine CE-R1 Build 6
## AI Research Contract

### Status
Build 6 defines the provider-neutral contract by which AI may contribute candidate commercial knowledge to Genesis T8. It does **not** activate new production research, change prompts, alter TI-2.1.8, or persist a new schema.

### Core boundary
AI owns discovery, reading, semantic extraction and canonicalisation. AI output is always **candidate knowledge**.

Deterministic Genesis T8 code owns schema validation, ontology validation, referential integrity and the hand-off boundary.

TI-2.1.8 remains the sole authority for probability, confidence, coverage, contradiction mathematics and truth qualification.

Commercial mathematics remains out of scope for CE-R1. AI may never output match strength, fit, opportunity priority, recommendations or rankings as authoritative knowledge.

### Research output
A research run emits one versioned `GenesisT8AIResearchEnvelope` containing:

- requested canonical predicates;
- source evidence with URL, class, timestamps and exact excerpt;
- atomic candidate tokens;
- candidate token relationships;
- one explicit result for every requested predicate.

The result vocabulary distinguishes `ASSERTED`, `CONTRADICTED`, `AMBIGUOUS`, `NOT_FOUND` and `NOT_RESEARCHED`. Missing knowledge is therefore never silently converted into `false`.

### Atomicity
Each asserted candidate describes one canonical predicate about one subject and references the evidence that supports the exact assertion. AI cannot invent predicate names or change ontology value types.

### Truth boundary
Candidate tokens contain no truth fields. They can be hard-validated into `DISCOVERED` Commercial Tokens only. TI-2.1.8 is required before any token can become truth-qualified or active.

AI is structurally unable to propose a Truth-dimension projection through the Build 6 type contract. Non-truth dimensional proposals must also be allowed by the predicate's Build 4/5 ontology definition.

### Ambiguity and conflict
AI must expose ambiguity rather than resolve it by guessing. Conflicting candidates may coexist and carry their separate evidence references so that TI-2.1.8 can resolve the evidential state deterministically.

### Research directives
`buildAIResearchDirectives()` deterministically derives AI-facing research instructions from the canonical ontology. Prompt authors therefore cannot silently redefine:

- predicate meaning;
- token kind;
- value type;
- mutability;
- refresh class;
- evidence expectation;
- dimensional scope.

### Build 6 release gate
Build 6 is complete when:

1. AI can research every canonical Commercial Genome predicate without inventing ontology.
2. Every asserted candidate is evidence-backed and atomic.
3. Unknown, contradictory and ambiguous states remain distinct.
4. No AI output can masquerade as TI truth or Commercial Engine reasoning.
5. The hand-off to TI is deterministic, provider-neutral and reproducible.
6. Builds 1–5 and the frozen TI-2.1.8 regression suite remain clean.

Build 7 remains the CE-R1 final freeze audit. No Commercial Genome freeze is implied by Build 6 alone.
