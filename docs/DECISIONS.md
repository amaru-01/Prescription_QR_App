# Open product decisions

Answers needed before the phase that depends on them (see `md files/IMPLEMENTATION_PLAN.md`).
Fill in the **Decision** column; the default applies if left blank.

| Decision | Needed by | Default | Decision |
|----------|-----------|---------|----------|
| Who may set a prescriber's displayed (signed) name? | Phase 1 | Admin only, via `set-role --name` | |
| What may anonymous guests do? | Phase 3 | Scan and save only | |
| Is a paid Redis (Upstash) acceptable? Which Vercel plan (cron frequency)? | Phase 3 / 6 | Upstash free tier; external cron on Hobby | |
| Claim window length; one-time PIN wanted? | Phase 5 | 7 days; PIN optional | |
| Data retention periods; legal regime (GDPR / HIPAA)? | Phase 4 | 90 days after expiry for issued codes and claims | |
