# CMX installation

## Current starting point

- Frontend: whatAreYouHerefor/open-bsp-ui
- Backend: whatAreYouHerefor/open-bsp-api
- Meta app ID: 1676666976602420 (identifier only; access has not been verified)
- Supabase project: not created yet
- First WhatsApp account: existing live CMX number; inspect Botpress routing before changing it

## Deploy the backend first

1. Create a dedicated Supabase project in the owner's account. Keep its database password in a password manager.
2. Follow the API repository README's self-host deployment instructions. Choose one deployment method: Supabase GitHub integration or its manually triggered Release workflow.
3. Deploy the checked-in migrations and Edge Functions from the API fork to the new project.
4. Set the Vault secrets `edge_functions_url` and `edge_functions_token` as documented in the API README. These are server-side settings.
5. Configure authentication. For an initial operator login, create an email/password user through Supabase's admin interface; the UI supports email login. Google/GitHub login also requires configuring those providers.
6. Set Supabase's Site URL and allowed redirects to the deployed frontend origin. The Supabase backend does not live in GitHub Pages.

## Deploy the frontend

Cloudflare Pages is the upstream-documented starting point. Connect this UI fork, choose main, and use build output directory `dist`.

Set the variables in `cmx/environment.example` in the frontend host. The Supabase URL and publishable/anon key must belong to the same new project.

Build command:

```sh
node cmx/check-environment.mjs && npm run build
```

For local development, copy `cmx/environment.example` to `.env.local`, fill in the public settings, then run:

```sh
node --env-file=.env.local cmx/check-environment.mjs
npm run dev
```

The check validates formats only. A successful build does not prove login, migrations, or WhatsApp work. Rebuild after changing Vite environment variables.

Use a dedicated application origin, such as a subdomain chosen by the owner. Confirm existing DNS before using `app` or `portal`. Keep the marketing website in its existing repository.

## Connect the existing WhatsApp number

Inventory the current Meta app, phone-number ID, WABA, subscription/webhook settings, and Botpress integration first. Decide one authoritative incoming-message route and one automated responder. Do not blindly replace the live webhook or disconnect the number.

Store Meta app secrets, system-user tokens, verify tokens, service-role keys, and Botpress credentials only in server-side secret settings. Never put them in VITE variables or commit them.

The UI Meta app ID is already known. Embedded Signup additionally needs a Facebook Login for Business configuration ID and the appropriate Meta setup; the app ID alone does not enable onboarding.

## Repeatable client onboarding

Use one organization per client with its own team roles, connected assets, automation configuration, and support scope. Prefer client ownership of their Meta business assets with authorized CMX access.

Before admitting a second client, test with two organizations and separate users:

- User A cannot read, search, subscribe to realtime data from, download media from, or modify organization B.
- An incoming message appears in the correct organization and an operator can reply.
- Automated replies stop when the agreed human handoff is active.
- Summaries and intake fields reach the appropriate record without mixing clients.
- Retries do not duplicate messages; failures are visible and assigned for review.

First launch can use assisted onboarding. Later, validate the existing Embedded Signup/token screens for repeatable self-service onboarding. Meta approvals and account eligibility remain dependencies.

## Acceptance gates

1. Backend deployed and operator login works.
2. Organization and account visible.
3. Incoming WhatsApp message visible; manual reply delivered.
4. Botpress integration, context capture, and human handoff verified.
5. Two-client isolation verified.
6. Client onboarding checklist, training, export, support, and cancellation process agreed.

Do not describe the installation as production-ready until these are exercised against the deployed system.
