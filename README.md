# Shelf Notes

Shelf Notes turns page-level reading notes into connected maps of ideas.

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add the Supabase project URL and
publishable key.

## Supabase

Run these files in the Supabase SQL editor, in order:

1. [`supabase/schema.sql`](supabase/schema.sql)
2. [`supabase/migrations/20260612_connections.sql`](supabase/migrations/20260612_connections.sql)

All user data is protected with Row Level Security.
