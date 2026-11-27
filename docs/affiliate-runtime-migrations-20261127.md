# Runtime schema update — 27 November 2026

The running Team application returned Prisma P2022 because `team_members.username`
was absent. The feature code was running against databases without its migrations.

The five Main affiliate migrations (`20261127000100_affiliate_tables` through
`20261127000500_affiliate_integrity`) and Team's
`20261127000100_affiliator_role` were applied to the databases selected by the
existing Team Backend environment. Each database update used one transaction,
a five-second lock timeout and a statement timeout. Existing server database
connection configuration was used; no TLS verification setting was weakened.

The existing databases have no public Prisma migration registry. Only the reviewed
feature SQL was executed; no historical migrations were replayed and no historical
Prisma records were fabricated. **Establish the correct historical baseline before
using `prisma migrate deploy`; do not blindly reapply these feature migrations.**

Integrity checks before and after showed 21 Main payments, 2 vouchers and 12 Team
members unchanged. No commission entries were created. The agreement remains an
unpublished draft. No accounts, payments, payouts or accepted agreements were
created as verification data in these databases.

Verification after the update:

- The actual Prisma membership query reads the new username column successfully.
- Active department lookup succeeds.
- The shared affiliate pricing function is installed.
- Both backend database readiness endpoints return HTTP 200.
- Team login returns HTTP 200; unauthenticated protected navigation redirects to
  login, and the monitoring API rejects unauthenticated requests.

SQL checksums, execution timestamps and before/after counts were retained in the
agent's local operational record, `runtime-affiliate-migrations.json`.
