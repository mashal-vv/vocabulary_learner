# Supabase Deployment Guide — Lexicon

This guide walks you through deploying the Lexicon backend: one SQL migration and five Edge Functions.

---

## Prerequisites

| Tool | Install |
|------|---------|
| Supabase CLI ≥ 1.200 | `npm install -g supabase` |
| Deno ≥ 1.44 | https://deno.land (required by Edge Functions locally) |
| A Supabase project | https://supabase.com → New project |

---

## 1. Link your project

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

Your project ref is the random string in your Supabase project URL:
`https://supabase.com/dashboard/project/<project-ref>`

---

## 2. Run the database migration

```bash
supabase db push
```

This applies `migrations/001_schema.sql`, which creates:

| Object | Description |
|--------|-------------|
| `vault_config` | Single-row vault (CHECK id = 1), stores PBKDF2 salt + argon2 hash placeholder, auth_user_id |
| `vocabulary` | All saved words, owned by `auth.uid()` |
| `review_progress` | SM-2 spaced-repetition state per word |
| `review_history` | Per-session review log |
| `collections` | Named vocabulary groups |
| `collection_words` | Many-to-many join: collection ↔ word |
| `settings` | Per-user key/value preferences |
| `outbox` | Sync queue for offline mutations |
| Rate-limit helper functions | `rl_window_key()`, `rl_increment()` |

RLS is **enabled on every table**. All policies use `auth.uid() = user_id`.

---

## 3. Deploy Edge Functions

All five functions must be deployed with `--no-verify-jwt` because they handle their own authentication internally (they receive the raw passphrase and return a JWT).

```bash
supabase functions deploy vault-status  --no-verify-jwt
supabase functions deploy vault-setup   --no-verify-jwt
supabase functions deploy vault-unlock  --no-verify-jwt
supabase functions deploy vault-refresh --no-verify-jwt
supabase functions deploy vault-lock    --no-verify-jwt
```

| Function | Purpose |
|----------|---------|
| `vault-status` | Returns `{ initialized: bool }` — no auth required |
| `vault-setup` | First-run only: creates the Supabase auth user and vault row from passphrase |
| `vault-unlock` | Verifies passphrase server-side (PBKDF2 600k iterations), returns JWT |
| `vault-refresh` | Exchanges a refresh token for a new access token |
| `vault-lock` | Revokes the current session (server-side sign-out) |

### Environment variables injected automatically

Supabase injects these into every Edge Function at runtime — **no manual setup needed**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` ← used only inside Edge Functions, never exposed to the browser

---

## 4. Frontend environment variables

Create a `.env.local` file at the project root (copy from `.env.local.example`):

```bash
cp .env.local.example .env.local
```

Then fill in your values:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

Both values are safe to expose — the anon key is public by design.  
Your service-role key must **never** appear in this file.

---

## 5. Supabase Dashboard settings

### Disable email confirmations

The vault user is created programmatically with `email_confirm: true` (bypasses confirmation at the Admin API level). To avoid any interference:

**Authentication → Email → "Enable email confirmations"** → turn **OFF**

### Auth email template (optional)

The vault email is `vault@lexicon.internal`. It is an internal identifier — no real email is ever sent.

---

## 6. Architecture overview

```
Browser (any device)
  │
  │  raw passphrase (over HTTPS only)
  ▼
vault-unlock Edge Function
  │  PBKDF2(passphrase, stored_salt, "lexicon:auth:v1", 600_000)
  │  → auth_password (deterministic per passphrase)
  ▼
supabase.auth.signInWithPassword(
  email: "vault@lexicon.internal",
  password: auth_password          ← same on every device
)
  │
  ▼
Supabase Auth → JWT (access token + refresh token)
  │
  ├── access token  → memory only (never persisted)
  └── refresh token → sessionStorage (clears on tab close)

All data operations use the JWT in the Authorization header.
RLS policies enforce  auth.uid() = user_id  on every table.
```

**Single vault guarantee:**  
`vault_config` has `CHECK (id = 1)` — the row can only be inserted once.  
If `vault-setup` is called again after initialization, it returns `409 Conflict`.

**Same passphrase = same vault on every device** because PBKDF2 is deterministic: same passphrase + same stored salt = same `auth_password` = same Supabase auth user = same `auth.uid()` = same data.

---

## 7. Rate limiting

The `rateLimit.ts` shared module tracks unlock attempts per IP in the `rate_limit` Postgres table (created by the migration). After **5 failed attempts within 15 minutes**, the function returns `429 Too Many Requests`. The window resets automatically.

---

## 8. Local cache (IndexedDB)

IndexedDB is used **only as a local cache and offline queue**. It is not the source of truth.

- On first unlock with existing local data: `migrateLocalDataToCloud()` pushes all IndexedDB vocabulary to Supabase.
- Subsequent operations write to both IndexedDB (immediate) and an outbox queue.
- The sync engine flushes the outbox to Supabase on every unlock and periodically while online.
- "Synced" is displayed only after a confirmed successful cloud write.

---

## 9. Verify the deployment

After completing steps 1–5, start the dev server:

```bash
npm run dev
```

1. Open `http://localhost:5173`
2. You should be redirected to the **Unlock** page
3. Click **"Set up vault"** (first run)
4. Enter a passphrase → vault initializes → you are redirected to Dashboard
5. Open a second browser or incognito window, go to the same URL
6. Enter the same passphrase → you should see the same vocabulary

If step 6 fails, check:
- Both browsers are pointing at the same `VITE_SUPABASE_URL`
- The Edge Functions are deployed and returning 200 for `vault-status`
- The browser console for CORS or JWT errors
