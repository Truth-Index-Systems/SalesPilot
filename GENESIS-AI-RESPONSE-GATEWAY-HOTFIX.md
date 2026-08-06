# Genesis AI Response Gateway Hotfix

Introduces one structured-response boundary for every production AI stage that returns JSON.

Stages covered: Business Intelligence, Company Intelligence, Contact/Route Intelligence, Commercial Reasoning, Channel Content Generation, and AI Self Review.

Recovery order:
1. strict parse and Zod validation;
2. markdown/control-character cleanup;
3. deterministic repair of mechanically truncated strings and containers;
4. one schema-constrained repair request that may not add facts;
5. stage-local retry/dead-letter policy.

Raw JSON parser details are no longer exposed by the first-use Business Intelligence flow.
