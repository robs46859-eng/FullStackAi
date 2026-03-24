#!/bin/bash
set -e
pnpm install --frozen-lockfile
psql "$DATABASE_URL" -f lib/db/migrations/0001_pgvector_embedding.sql
psql "$DATABASE_URL" -f lib/db/migrations/0002_is_admin.sql
pnpm --filter db push
