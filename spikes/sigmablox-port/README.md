# Sigmablox → EmDash Port Spike

A small, runnable spike for the "rewrite sigmablox on emdash" decision. Validates the three claims from the comparison:

1. **Astro templates can replace the Handlebars theme** without losing fidelity.
2. **The Authentik → emdash auth bridge works** for both members and staff.
3. **The emdash admin is acceptable** for sigmablox's content editors.

We pick **one content type** — Success Stories — as the test case. It's low-stakes, has a real schema, and exercises the rich-content + image + reference patterns you'd hit everywhere else.

## What's here

| File                                  | Purpose                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `seed/seed.json`                      | EmDash schema for `success_stories` + `industry` taxonomy + one sample story.                 |
| `src/auth/authentik.ts`               | Runtime auth provider — validates Authentik OIDC JWTs and maps groups to emdash roles.        |
| `astro.config.example.mjs`            | Wires the Authentik provider into `emdash()` as an `AuthDescriptor`.                          |
| `src/pages/success-stories/[slug].astro` | Astro template that mirrors a typical Ghost `success-story.hbs` — uses Portable Text rendering, image helper, and content query. |

## How to run it

```bash
# 1. Scaffold a fresh emdash project
npx create-emdash sigmablox-spike --template blank
cd sigmablox-spike

# 2. Drop the spike files in
cp -r ../spikes/sigmablox-port/seed ./
cp -r ../spikes/sigmablox-port/src ./
cp ../spikes/sigmablox-port/astro.config.example.mjs ./astro.config.mjs.spike

# 3. Merge astro.config.example.mjs into your existing astro.config.mjs by hand
#    (the AuthDescriptor block is the only thing you need to copy)

# 4. Set Authentik env vars
cat >> .env <<EOF
AUTHENTIK_ISSUER=https://auth.example.com/application/o/sigmablox/
AUTHENTIK_AUDIENCE=<your-authentik-client-id>
AUTHENTIK_JWT_COOKIE=authentik_jwt
EOF

# 5. Run it
pnpm install
npx emdash dev
```

Open `http://localhost:4321/_emdash/admin` to see the admin UI with the `success_stories` collection. Open `http://localhost:4321/success-stories/example-success-story` to see the Astro-rendered template.

## What "success" looks like for each validation goal

**Goal 1 (templates):** Pick one real Ghost success-story page from sigmablox. Compare it side-by-side with the Astro version. The diff should be visual styling only — no structural mismatches, no missing fields, no broken images.

**Goal 2 (auth):** Hit the admin while logged into Authentik. You should land at `/_emdash/admin` without an emdash login flow. Check `_emdash_users` in the DB — your Authentik account should be auto-provisioned with the right role from your group membership.

**Goal 3 (editor UX):** Have one of your content editors create a new success story end-to-end in the emdash admin: type fields, upload a hero image, write rich content, attach an industry term, save as draft, publish. If they get through it without you, you have your answer.

## What's intentionally NOT in this spike

- **No Companies / Cohorts / Coaches collections.** Those live in your webhook Postgres via Prisma and aren't moving in this experiment. The success story stores `company_id` as a plain string; the frontend can join against the webhook API.
- **No content migration from Ghost.** That's a separate project (Ghost Lexical → Portable Text adapter). For the spike, the sample story is hand-written.
- **No Yjs / collaboration.** Hocuspocus stays where it is for now.
- **No Members Portal replacement.** The spike treats Authentik as the only identity provider — same model you've already moved to.

## Known gaps to address before going all-in

- **Authentik group → emdash role mapping** in `astro.config.example.mjs` is a placeholder. Confirm the exact group names from your Authentik tenant.
- **JWT delivery mechanism.** The provider reads from either a cookie or `Authorization: Bearer` header. Your existing `authentik-middleware.js` should tell you which one your Cloudflare-Access + Authentik setup actually uses; match the `cookieName` or `headerName` config to that.
- **Ghost Lexical/Mobiledoc → Portable Text.** Not done here. `@emdash-cms/gutenberg-to-portable-text` is the closest existing tool; expect to write a small Lexical adapter.

## Time-box

If you can't validate goals 1+2 in **one focused day** with this spike, you've learned something important — probably that the Authentik integration is more bespoke than it looks. That alone is worth the day.
