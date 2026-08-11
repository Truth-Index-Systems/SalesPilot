# Genesis T8 — CIE-R6 Contact Authority

CIE-R6 removes weighted contact confidence from commercial selection authority.

A named contact is authoritative only when the person participates in an R5-authorised OPEN route, has verified identity and role evidence, and the direct channel on that route is compatible with the persisted contact channel. Organisational routes remain valid without a named person.

Where multiple people satisfy the same authorised relationship, they form a nondominated contact frontier. Canonical contact ID order is used solely for reproducible operational selection; it is not a commercial ranking.

R6 also introduces the authoritative persistence ledger `cie_r6_contact_decisions`. Once an opportunity is a CIE-R4 `COMMERCIAL_CANDIDATE` and R6 has a valid named-contact or organisational-route binding, the opportunity may become `READY` without any numeric opportunity/contact score. `opportunity_score` remains null.

Frozen UDOSIB, Truth Index, and CE2 Evolution files are not modified.
