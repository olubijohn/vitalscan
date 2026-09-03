---
name: PreCURE persistence boundary
description: The storage decision for the current PreCURE MVP and its implications.
---

PreCURE currently uses a seeded in-memory store behind the API. It is suitable for the demo and keeps the mock scan flows self-contained, but data resets whenever the API process restarts.

**Why:** The initial build prioritized a complete, testable multi-role demo with no external keys or migrations; replacing the store with PostgreSQL would be a separate persistence milestone.

**How to apply:** Do not present demo mutations as durable production records. When production persistence is requested, add the schema, migrations, seed strategy, and tenant-scoped database queries together rather than partially mixing database and in-memory state.