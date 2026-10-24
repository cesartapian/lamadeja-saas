# Read-only conversation inbox

This increment extends the existing React application and retains its Supabase login, plum palette and Spanish copy. It depends on phase 2; it does not merge that branch or configure any production service.

## Behavior

- Conversation list shows the registered contact name (falling back to WhatsApp identity), preview, status and activity date. Lists load 25 at a time and append on request. Refresh returns to the first page.
- Selecting a conversation loads the latest 50 messages. Newest-first API pages are displayed in chronological order. Loading earlier messages preserves the reader's scroll position; initial history opens at the latest message.
- A separate contact request provides the contact identity and registration/update dates. Its errors are independently recoverable. On smaller screens the contact details are collapsed, and a back control returns to the conversation list with keyboard focus restored.
- Loading, empty and failure states are explicit. Aborted requests cannot overwrite another selection. Request timeouts surface a retry action. A 401/403 removes the private inbox and explains how to restore access.
- Session tokens remain managed by Supabase. The API client attaches the bearer token to every request; the backend alone establishes tenant/store scope. There is no organization selector or authentication bypass.
- All content is read-only. The interface does not send messages, download media, call Shopify, execute agents or change conversation state. Unsupported message types are labeled rather than silently omitted.

## Design and interaction decisions

This is a scoped extension of the existing identity, not a new visual direction. It retains the incumbent dark plum (`#392b51`) and system sans typography (`"Segoe UI", sans-serif`), with plum actions (`#604178`), a pale selected state (`#f0eaf5`) and quiet borders (`#e7e1ea`). There was no established `PRODUCT.md` or `DESIGN.md` when this increment began; these notes describe the implemented inbox and do not imply user approval of a new brand system.

At desktop widths of 1200px and above, the selected conversation uses three panes: conversation list, message history and contact details. Below 1200px, contact details start collapsed in a disclosure beneath the history. Below 700px, the list and selected conversation use a single main pane, with a back button to return to the list; contact details remain available beneath the history.

Selection moves focus to the conversation heading, and returning to the list restores focus to the selected conversation button. Controls have visible keyboard focus; the message history and contact panel are focusable scroll regions so keyboard users can reach overflowing content. Earlier-message pagination preserves the reading position. The persistent read-only label and footer explain the absence of a composer; no control sends messages or changes conversation state.

## API additions

Existing endpoints remain backward compatible. `limit` accepts 1–100 and defaults to 100. `offset` retains its 0–100000 bound. Both list responses add `hasMore` and `nextOffset`. A lookahead row determines whether another page exists.

Conversation rows add `contact_name`, `contact_phone`, `last_message`, `last_message_type` and `last_message_at`. Contact and latest-message joins apply organization/store restrictions. Messages accept `order=asc|desc`; the existing ascending order remains the default. The UI requests descending pages for recent history.

Pagination is offset-based, not a consistent snapshot. Concurrent arrivals can shift page boundaries; client-side deduplication avoids duplicate rows, and refresh restarts the list. Live subscriptions and cursor pagination are future improvements. The timestamp display uses the browser's local timezone and Spanish Chilean formatting; stored timestamps remain UTC.

## Local development

Use Node 22+. Run `npm ci`, then configure the API/web environment examples as described in phase 2. Apply migrations 001, 002 and the additive index migration `003_inbox_read_index.sql` in a dedicated SaaS development database. Add the authorized Supabase user's organization membership and channel registration. Do not use a production database for tests.

Run `npm run dev:api`, `npm run worker` and `npm run dev:web` in separate terminals. Sign in with the existing Google OAuth setup. The app explains missing frontend configuration instead of failing at startup. No OAuth or production webhook settings are changed by this increment.

## Verification

```text
npm run typecheck
npm run lint
npm test
npm run build -w @lamadeja/web
npx playwright install chromium
npm run test:e2e -w @lamadeja/web
```

The browser suite launches Vite locally with synthetic environment values, seeds a synthetic Supabase session in browser storage and intercepts HTTP responses in Playwright. This tests the shipped app and its real client request paths without altering production authentication or adding a demo mode. It covers desktop/mobile pagination, chronological history, contact detail, logout, empty/error states, expired/forbidden access, aborted selection changes, unsupported content and long-text overflow. It does not prove real Google OAuth or Meta delivery.

API tests execute the real SQL against PGlite and verify metadata, page boundaries, descending order, invalid parameters and organization isolation. CI also runs the connection-level worker test against an isolated PostgreSQL 16 service. Browser screenshots are generated locally under `apps/web/.impeccable/review/`; traces and browser artifacts are ignored by Git.

Main files: `apps/web/src/Inbox.tsx`, `api.ts`, `usePaged.ts`, `main.tsx`, `styles.css`; `apps/api/src/routes/conversations.ts`; migration 003; browser/API tests and CI. No new runtime dependencies were introduced; Playwright is development-only.

Next: validate real Supabase Google OAuth in an isolated environment with an authorized test account, then add a persistent outbound outbox before enabling any real WhatsApp sends.
