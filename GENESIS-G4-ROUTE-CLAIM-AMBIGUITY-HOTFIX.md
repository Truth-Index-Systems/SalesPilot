# Genesis G4 Route Claim Ambiguity Hotfix

Fixes PostgreSQL error `42702` in `claim_contact_discovery`: the `route_expansion_pass` output column from `RETURNS TABLE` collided with the table column of the same name.

All colliding values in the update statement are now explicitly qualified through the `target` table alias. Migration `0059` replaces the deployed RPC; migration `0057` is also corrected for fresh databases.
