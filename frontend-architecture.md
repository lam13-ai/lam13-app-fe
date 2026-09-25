# Frontend Architecture — Lam13 Chat

**Stack:** React 19, Vite, TypeScript (strict). The backend is FastAPI (see `api-contract.md`).
The visual source of truth is `reference-ui-analysis.md`.

---

## 1. Principles

1. **One way to reach the backend.** All HTTP, streaming and upload calls go through `src/api/`. Components never call `fetch`.
2. **Vendors stay behind adapters.** Kinde code lives only in `features/auth/` and Vapi code only in `features/calling/`. General UI imports *our* hooks (`useAuth`, `useCall`) and never imports `@kinde-oss/*` or `@vapi-ai/*` directly.
3. **Server state and client state are kept separate.**
   - *Server state* (conversations, message history, the current user) lives in **TanStack Query**.
   - *Ephemeral client state* (the in-flight stream, recorder state, call state, UI toggles) lives in small **Zustand** stores.
4. **Streaming is a transport detail.** The chat feature consumes an async iterator of typed events. SSE versus WebSocket is decided inside `src/api/stream/`.
5. **Tokens first.** Every colour, size and duration comes from CSS variables defined in `styles/tokens.css`, and components never hard-code design values.
6. **Components are presentational by default.** Logic lives in feature hooks, and `components/` holds dumb, reusable primitives.

---

## 2. Planned dependencies

These are *not installed in Phase 0*. They are added in the phase that needs them.

| Purpose | Package | Phase |
|---|---|---|
| Framework | `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript` | 1 |
| Styling | `tailwindcss` v4 plus `@tailwindcss/vite` (the reference is Tailwind-built; tokens map 1:1) | 1 |
| Routing | `react-router` | 1 |
| Server state | `@tanstack/react-query` | 1 |
| Client state | `zustand` | 1 |
| Markdown | `react-markdown` plus `remark-gfm` (tables are required by the reference) | 2 |
| Icons | `lucide-react` (strokeWidth 1.5 matches the reference's hairline SVGs) | 1 |
| Motion | `motion` (the reference uses a JS motion lib for message enter; CSS handles everything else) | 2 |
| Auth | `@kinde-oss/kinde-auth-react` | 3 |
| Calling | `@vapi-ai/web` | 5 |
| Tests | `vitest`, `@testing-library/react`, `msw` | 1 |

**Not needed:**
- no Axios (native `fetch`)
- no Redux
- no Socket.IO
- no recording library: the browser `MediaRecorder` handles pause and resume natively
- no waveform library: a `canvas` fed by an `AnalyserNode` is enough

Fonts are self-hosted with `@fontsource/cousine` (400, 700) and `@fontsource-variable/inter`.

---

## 3. Directory structure

```
src/
├── app/                        # Composition root: nothing feature-specific
│   ├── main.tsx                # ReactDOM root, imports styles
│   ├── App.tsx                 # Providers + router outlet
│   ├── providers.tsx           # QueryClientProvider, AuthProvider, ToastProvider
│   ├── router.tsx              # Route table (lazy routes)
│   ├── layouts/
│   │   ├── AppShell.tsx        # Sidebar + main; responsive drawer
│   │   └── AuthLayout.tsx      # Centered card for login/callback screens
│   └── routes/
│       ├── ChatRoute.tsx       # /c/:conversationId  and  / (new chat)
│       ├── LoginRoute.tsx
│       ├── AuthCallbackRoute.tsx
│       └── NotFoundRoute.tsx
│
├── api/                        # THE ONLY place that talks to the backend
│   ├── client.ts               # createApiClient(): base URL, auth header, JSON, errors, retries
│   ├── errors.ts               # ApiError, NetworkError, AuthError, StreamError (typed)
│   ├── stream/
│   │   ├── sse.ts              # POST-capable SSE parser over fetch ReadableStream
│   │   ├── types.ts            # StreamEvent discriminated union (mirrors api-contract)
│   │   └── index.ts            # openStream() → AsyncIterable<StreamEvent> + abort
│   ├── endpoints/
│   │   ├── me.ts
│   │   ├── conversations.ts
│   │   ├── messages.ts         # list + send (returns stream)
│   │   ├── audio.ts            # upload voice note, get playback URL
│   │   ├── calls.ts            # create Vapi call session, list call records
│   │   └── models.ts           # optional: model/effort catalogue
│   ├── queryKeys.ts            # Central TanStack Query key factory
│   └── index.ts                # export const api = { conversations, messages, ... }
│
├── components/                 # Generic, feature-agnostic UI primitives
│   ├── ui/                     # Button, IconButton, Chip, Popover, Menu, Tooltip,
│   │                           # Dialog, Drawer, Spinner, Skeleton, Toast, VisuallyHidden
│   ├── Markdown/               # Markdown renderer with reference typography (h2/p/ol/table)
│   ├── AgentMark/              # Gradient square + sparkle avatar
│   ├── StatusIndicator/        # Canvas dot-ring + label (Online / Answering… / …)
│   ├── Waveform/               # Canvas waveform (live analyser or static peaks)
│   └── ScrollArea/             # Hidden-scrollbar scroll container
│
├── features/
│   ├── auth/                   # ── Kinde isolated here ──
│   │   ├── AuthProvider.tsx    # Wraps KindeProvider; exposes our AuthContext
│   │   ├── useAuth.ts          # { user, status, login, logout, getToken } (vendor-neutral)
│   │   ├── RequireAuth.tsx     # Route guard
│   │   ├── tokenBridge.ts      # Registers getToken() with api/client (no import cycle)
│   │   └── kinde.config.ts     # Reads VITE_KINDE_* env
│   │
│   ├── conversations/
│   │   ├── components/         # Sidebar, ConversationList, ConversationItem, NewChatButton,
│   │   │                       # RenameDialog, DeleteConfirm
│   │   ├── hooks/              # useConversations (infinite), useConversation,
│   │   │                       # useCreate/Rename/DeleteConversation (optimistic)
│   │   └── utils/groupByDate.ts
│   │
│   ├── chat/
│   │   ├── components/
│   │   │   ├── ChatView.tsx          # Header + MessageLog + Composer
│   │   │   ├── ChatHeader.tsx        # AgentMark, title, StatusIndicator, call button
│   │   │   ├── MessageLog.tsx        # role="log", top-anchoring spacer, jump-to-latest
│   │   │   ├── UserMessage.tsx       # Black square block (text | voice)
│   │   │   ├── AssistantMessage.tsx  # Full-width Markdown, hover actions
│   │   │   ├── MessageActions.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── composer/
│   │   │       ├── Composer.tsx          # State machine: idle|expanded|recording|preview|streaming
│   │   │       ├── ComposerTextarea.tsx  # Auto-grow, fade masks, Enter/Shift+Enter
│   │   │       ├── ComposerToolbar.tsx   # Model/effort chips (if enabled), attach
│   │   │       └── SendButton.tsx        # Morphing mic ↔ arrow ↔ stop
│   │   ├── hooks/
│   │   │   ├── useMessages.ts        # History (infinite, reverse pagination)
│   │   │   ├── useSendMessage.ts     # Optimistic user msg → openStream → store → cache
│   │   │   ├── useStopGeneration.ts
│   │   │   └── useAnchoredScroll.ts  # Spacer/pinning logic from the reference
│   │   └── lib/
│   │       └── applyStreamEvent.ts   # Pure reducer: (draft, event) → draft (unit-tested)
│   │
│   ├── voice/                  # Voice NOTES (record → preview → send)
│   │   ├── components/
│   │   │   ├── RecordingBar.tsx      # Live waveform, timer, pause/resume, cancel, stop, send
│   │   │   ├── VoicePreview.tsx      # Playback + scrub + send/discard
│   │   │   └── VoiceMessagePlayer.tsx# Used inside UserMessage for sent notes
│   │   ├── hooks/
│   │   │   ├── useRecorder.ts        # MediaRecorder wrapper incl. pause/resume
│   │   │   ├── useAudioLevels.ts     # AnalyserNode → level samples for Waveform
│   │   │   └── useSendVoiceMessage.ts# upload → send message(kind: voice) → stream
│   │   └── lib/
│   │       ├── mime.ts               # Pick supported mimeType (webm/opus → mp4/aac fallback)
│   │       └── peaks.ts              # Decode blob → downsampled peaks for static waveform
│   │
│   └── calling/                # ── Vapi isolated here ──
│       ├── vapiClient.ts       # Lazy singleton around @vapi-ai/web (dynamic import)
│       ├── useCall.ts          # { status, start, end, mute, isMuted, volume, transcript }
│       ├── components/
│       │   ├── CallButton.tsx
│       │   └── CallPanel.tsx   # Overlay/sheet: agent mark, live level, timer, mute, end
│       └── callEvents.ts       # Maps Vapi events → our CallEvent union
│
├── hooks/                      # Cross-feature generic hooks
│   ├── useMediaQuery.ts
│   ├── useAutoResizeTextarea.ts
│   ├── useEventListener.ts
│   ├── usePrefersReducedMotion.ts
│   └── useLatest.ts
│
├── lib/                        # Pure utilities, no React
│   ├── env.ts                  # Typed, validated import.meta.env access
│   ├── cn.ts                   # className join
│   ├── format.ts               # durations (mm:ss), relative dates
│   ├── id.ts                   # client ids (crypto.randomUUID)
│   └── invariant.ts
│
├── stores/                     # Zustand: ephemeral client state only
│   ├── streamStore.ts          # Per-conversation in-flight assistant draft + status
│   ├── composerStore.ts        # Draft text per conversation (persisted to sessionStorage)
│   ├── recorderStore.ts        # Recorder state machine snapshot
│   ├── callStore.ts            # Call status (so header/sidebar can react)
│   └── uiStore.ts              # Sidebar open/collapsed, selected model/effort
│
├── types/                      # Shared domain types (mirror api-contract.md)
│   ├── api.ts                  # DTOs: User, Conversation, Message, Attachment, CallSession
│   ├── chat.ts                 # UI-level: MessageView, StreamStatus
│   └── env.d.ts
│
└── styles/
    ├── tokens.css              # :root CSS variables (see §9)
    ├── fonts.css               # @fontsource imports
    ├── base.css                # Resets, body font, selection, focus ring
    ├── markdown.css            # .md-content typography from the reference
    └── index.css               # @import "tailwindcss"; @theme mapping tokens → utilities
```

**Import rules** (enforced with lint `no-restricted-imports`):
- `components/*` must not import from `features/*`.
- `features/X` must not import from `features/Y` internals, except through `features/Y/index.ts`.
- Only `features/auth/**` may import `@kinde-oss/*`, and only `features/calling/**` may import `@vapi-ai/*`.
- Only `src/api/**` may call `fetch`.

---

## 4. API client (`src/api/client.ts`)

```ts
type TokenGetter = () => Promise<string | null>;

createApiClient({ baseUrl: env.API_BASE_URL, getToken })
  .request<T>(method, path, { query, body, signal, headers }) : Promise<T>
  .upload<T>(path, formData, { signal, onProgress }) : Promise<T>   // XHR for progress
  .stream(path, body, { signal }) : AsyncIterable<StreamEvent>
```

Responsibilities:
- **Base URL** comes from `VITE_API_BASE_URL`, and every path is prefixed with `/api/v1`.
- **Auth:** it awaits `getToken()` (registered by `features/auth/tokenBridge.ts`) and sets `Authorization: Bearer <token>`.
  - On `401` it calls `getToken({ forceRefresh: true })` and retries once.
  - If the retry also fails, it emits `auth:expired`, which the auth feature handles by redirecting to login.
- **Errors:** it parses the FastAPI error envelope (`api-contract.md §2`) into `ApiError { status, code, message, details, requestId }`. Network failures become `NetworkError`, and user aborts are rethrown as `AbortError`, which the UI ignores.
- **Headers:** it sends `X-Request-Id` (a client UUID) on every call for backend log correlation.
- **Retries:** only idempotent `GET`s are retried, via TanStack Query's retry settings. The client itself never retries POSTs, apart from the single 401 retry above.
- **Idempotency:** message sends include a `client_message_id` so a user retry can't double-post.

**Endpoint modules** are thin typed functions, for example:
```ts
export const conversations = {
  list: (p: { cursor?: string; limit?: number }) => client.request<Page<Conversation>>('GET', '/conversations', { query: p }),
  create: (b: { title?: string }) => client.request<Conversation>('POST', '/conversations', { body: b }),
  ...
};
```

---

## 5. Streaming design

**Transport:** **SSE over `fetch` POST** (`Accept: text/event-stream`).
- Native `EventSource` can't send a body or an `Authorization` header, so `api/stream/sse.ts` parses the `ReadableStream` itself.
- It follows the spec: `event:`, `data:`, `id:`, and a blank line terminating each event; `:` lines are heartbeats.
- A plain HTTP chunked **NDJSON** fallback is supported by the same iterator if the backend chooses it. The choice is made by the `Content-Type` of the response.
- **WebSocket** is not used for chat. Vapi manages its own realtime transport inside its SDK.

**Flow (`useSendMessage`):**
1. Generate `client_message_id`. **Optimistically** insert the user message into the Query cache and create a draft in `streamStore` (`status: 'thinking'`).
2. `for await (const ev of api.messages.send(convId, payload, { signal }))` and dispatch each event through the **pure** reducer `applyStreamEvent(draft, ev)`:
   - `message.created`: reconcile the optimistic ids with the server ids.
   - `delta`: append text. Updates are coalesced with `requestAnimationFrame` so the Markdown re-renders at most once per frame.
   - `status`: header label (`thinking | answering`).
   - `done`: write the final message into the Query cache, then clear the draft.
   - `error`: mark the draft as failed and keep the partial text, with a Retry button.
3. **Stop:** `AbortController.abort()` on the fetch, plus `POST /messages/{id}/cancel` so the backend stops generation. The partial message is kept.
4. **Resilience:**
   - If the stream drops without `done`, refetch the conversation messages. The server is the source of truth.
   - If the backend supports it, resume with `Last-Event-ID` (see the contract).
5. `ChatHeader` reads `streamStore` for its status: **Online / Thinking… / Answering…**.

**Scroll (`useAnchoredScroll`)** follows the reference:
- On send, it appends a spacer of `logHeight − userMessageHeight − padding` and scrolls the new user message to the top.
- The spacer shrinks as the answer grows.
- It never auto-scrolls during streaming. A "jump to latest" button appears when the user is far from the bottom.

---

## 6. Voice notes (`features/voice`)

**Recorder state machine** (`recorderStore`):
```
idle → requesting-permission → recording ⇄ paused → stopped(preview) → uploading → sent
                     ↘ denied/error                  ↘ discarded → idle
      (recording|paused) --"send now"--> uploading   (direct voice send, skips preview)
```

- **`useRecorder`:**
  - calls `getUserMedia({ audio: { echoCancellation, noiseSuppression } })`
  - builds a `MediaRecorder` with the mimeType from `mime.ts`: `audio/webm;codecs=opus`, then `audio/mp4` (Safari), then `audio/ogg`
  - supports **`pause()` / `resume()`** natively, and collects chunks via `timeslice: 250ms`
  - tracks elapsed time excluding paused spans
  - enforces a max duration (the default of 5 min is configurable)
  - stops tracks on unmount
- **Live waveform:** `AudioContext` → `AnalyserNode` → RMS samples → `Waveform` canvas.
- **Preview:** `URL.createObjectURL(blob)` feeds an `<audio>` element, with static peaks decoded via `decodeAudioData`. The object URL is revoked on discard or send.
- **Send:** `useSendVoiceMessage` does `api.audio.upload(blob, duration)` → `{ audio_id }`, then `api.messages.send(convId, { kind: 'voice', audio_id })`.
  - The response stream starts with a `transcript` event, followed by normal assistant deltas.
- **Permissions UX:** on a denied mic, the composer shows an inline muted message with help text. It never throws.

---

## 7. Realtime calling (`features/calling`, Vapi isolated)

- **`vapiClient.ts`** lazily `import('@vapi-ai/web')` on first call, so the SDK is not in the main bundle, and holds one instance.
- **`useCall()`:**
  1. `api.calls.createSession({ conversation_id })`. The backend returns `{ public_key, assistant_id | assistant_overrides, call_session_id, metadata }`. **The backend decides the assistant config.**
  2. `vapi.start(assistantId, overrides)` with `metadata.call_session_id` so the backend webhook can link the call to the conversation.
  3. Vapi events (`call-start`, `call-end`, `speech-start/end`, `volume-level`, `message` for transcripts, `error`) are mapped by `callEvents.ts` into our `CallEvent` union, then into `callStore`.
  4. **End:** `vapi.stop()`. After the call, invalidate the conversation's messages query, because the backend appends the call transcript through the Vapi server webhook.
- **UI:** `CallButton` sits in `ChatHeader`. `CallPanel` is a bottom sheet (mobile) or a floating card (desktop) in the reference style: a square gradient `AgentMark` pulsing with the volume level, a mm:ss timer, mute and end (destructive).
- **Guards:**
  - Recording and calling are mutually exclusive, since both hold the mic.
  - Sending text during a call is allowed.
  - Starting a call aborts any active recording.

---

## 8. Auth (`features/auth`, Kinde isolated)

- `AuthProvider` wraps `KindeProvider` (`clientId`, `domain`, `redirectUri`, `logoutUri`, **`audience`** = FastAPI API identifier) and exposes a vendor-neutral `AuthContext`:
  `{ status: 'loading'|'authenticated'|'anonymous', user, login(), register(), logout(), getToken() }`.
- `tokenBridge.ts` registers `getToken` with the API client at startup, so `api/` never imports Kinde.
- `RequireAuth` guards app routes, and `LoginRoute` uses the reference's primary/secondary button styles.
- The FastAPI backend validates the Kinde **access token** (JWKS, `aud`, `iss`) and upserts the user on `GET /me`.
- Env: `VITE_KINDE_CLIENT_ID`, `VITE_KINDE_DOMAIN`, `VITE_KINDE_REDIRECT_URI`, `VITE_KINDE_LOGOUT_URI`, `VITE_KINDE_AUDIENCE`.

---

## 9. Design tokens (`styles/tokens.css`)

Values are taken from the reference (see `reference-ui-analysis.md`). They are exposed to Tailwind with `@theme`.

### Colour
| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#FFFFFF` | App background, chat surface |
| `--color-bg-subtle` | `#F7F8FA` | Sidebar, section/alt backgrounds |
| `--color-fg` | `#0A0A0A` | Text, primary buttons, user blocks |
| `--color-fg-muted` | `#616161` | Secondary text, eyebrow, subtitles |
| `--color-fg-soft` | `rgb(10 10 10 / .5)` | Composer chips, idle icons |
| `--color-muted` | `#F5F5F5` | Hover fills, attachment tray, code bg |
| `--color-border` | `#DBDBDB` | Inputs, composer |
| `--color-hairline` | `rgb(10 10 10 / .10)` | Header dividers |
| `--color-hairline-strong` | `rgb(10 10 10 / .20)` | Card outlines |
| `--color-table-border` | `rgb(10 10 10 / .15)` | Markdown tables |
| `--color-table-head` | `rgb(0 0 0 / .04)` | `th` background |
| `--color-accent` | `#2B5CE6` (`hsl 224 77% 53%`) | Links, focus accents, highlights |
| `--color-accent-deep` | `#1E3FBF` | Accent pressed / gradient start |
| `--color-accent-wash` | `rgb(43 92 230 / .10)` | Chip/icon hover background |
| `--gradient-accent` | `linear-gradient(100deg,#1E3FBF 0%,#2B5CE6 50%,#7AA0FF 100%)` | AgentMark, model square |
| `--color-danger` | `hsl(11 58% 44%)` ≈ `#B1482F` | Errors, end call, discard |
| `--color-recording` | `var(--color-danger)` | Recording dot / timer |
| `--color-ring` | `#0A0A0A` | Focus ring (at 20–40% alpha) |

Light only for v1, because the reference defines no dark theme. The tokens are structured so a `[data-theme=dark]` block can be added later.

### Typography
| Token | Value |
|---|---|
| `--font-mono` (UI/chat) | `"Cousine", ui-monospace, "Courier New", monospace` |
| `--font-sans` (long helper copy) | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| `--text-2xs` | `11px / 16.5px`: header subtitle, status |
| `--text-xs` | `12px / 16px`: chips, eyebrow (uppercase, `tracking .22em`) |
| `--text-table` | `12.5px / 1.625` |
| `--text-user` | `13px / 1.625`: user message |
| `--text-body` | `13.5px / 1.625`: assistant message, header title (700) |
| `--text-sm` | `14px / 20px`: composer (desktop), empty state |
| `--text-base` | `16px / 24px`: composer on mobile, md `h2` |
| `--text-title` | `clamp(1.7rem, 3.4vw, 2.7rem)`, 700, `tracking -0.02em`: large page titles (login) |
| Weights | 400 regular · 500 placeholder · 600 chips · 700 headings/labels |

### Spacing (4px base)
`--space-1: 4px` · `2: 8px` · `2.5: 10px` (message gap) · `3: 12px` · `4: 16px` · `5: 20px` (log/header padding) · `6: 24px` (page gutter) · `8: 32px` · `12: 48px`
- Chat column max width: `--chat-max-w: 760px`. Composer idle width: `520px`. Composer expanded width: the column width.
- Sidebar width: `--sidebar-w: 260px`. Rail width: `56px`.

### Radii
| Token | Value | Use |
|---|---|---|
| `--radius-none` | `0` | **Default**: buttons, user blocks, avatar, tables, inputs other than the composer |
| `--radius-card` | `12px` | Chat card (desktop), popover items |
| `--radius-popover` | `16px` | Popovers, menus, attachment tray top |
| `--radius-composer` | `24px` | Composer pill |
| `--radius-full` | `9999px` | Chips, icon buttons, send button |

### Shadows
| Token | Value |
|---|---|
| `--shadow-xs` | `0 1px 2px rgb(0 0 0 / .05)` (composer) |
| `--shadow-card` | `0 2px 8px rgb(0 0 0 / .06)` |
| `--shadow-elevated` | `0 8px 24px rgb(0 0 0 / .10)` (call panel) |
| `--shadow-popover` | `0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1)` |

### Motion
| Token | Value | Use |
|---|---|---|
| `--ease-standard` | `cubic-bezier(.4, 0, .2, 1)` | Colours/borders |
| `--ease-spring` | `cubic-bezier(.175, .885, .32, 1.275)` | Composer expand, popovers, send-icon morph |
| `--dur-fast` | `150ms` | Hover/focus |
| `--dur-base` | `200ms` | Chip/icon button |
| `--dur-slow` | `300ms` | Toolbar reveal, label swaps, icon morph |
| `--dur-expand` | `400ms` | Composer open/close |
- Enter pattern: `opacity 0→1`, `scale .95→1`, `translateY 8px→0`, `blur 4px→0`.
- With `prefers-reduced-motion: reduce`, all durations become ≤ `150ms` and there is no scale, blur or translate.

### Component sizing
| Component | Size |
|---|---|
| App header / chat header | `68px` / `70px` |
| Agent mark (header) | `36px` square |
| Status animation | `20px` (header), `64px` (empty state) |
| Composer (idle) | `48px` tall |
| Composer max height | `min(40dvh, 240px)`, then internal scroll with fade masks |
| Send button | `32px` round |
| Icon button | `28px` round (`44px` touch target on mobile via padding) |
| Chip | `24px` tall |
| Primary button | `min-height 52px` (landing/login), `40px` (in-app) |
| Popover width | `176px` (`w-44`) |
| Recording bar | `48px` (matches composer) |
| Focus ring | `2px` `--color-ring` at 40%, `2px` offset |

---

## 10. Routing

| Path | Screen |
|---|---|
| `/login` | Login (anonymous only) |
| `/callback` | Kinde redirect handler |
| `/` | New chat (empty state). The conversation is created lazily on the first send. |
| `/c/:conversationId` | Conversation |
| `/contacts` | My Contacts (grid, profile sheet, meeting-derived suggestions) |
| `*` | Not found |

All routes except `/login` and `/callback` are wrapped in `RequireAuth` and `AppShell`, and are lazy-loaded.

---

## 11. Environment (`lib/env.ts`, validated at boot)

```
VITE_API_BASE_URL=            # e.g. https://api.example.com  (dev: http://localhost:8000)
VITE_KINDE_CLIENT_ID=
VITE_KINDE_DOMAIN=
VITE_KINDE_REDIRECT_URI=
VITE_KINDE_LOGOUT_URI=
VITE_KINDE_AUDIENCE=
VITE_VAPI_PUBLIC_KEY=         # optional; backend may return it per session instead
VITE_FEATURE_CALLING=true
VITE_FEATURE_VOICE_NOTES=true
```

In dev, the Vite proxy maps `/api` to FastAPI, which avoids CORS locally. In prod, FastAPI must set CORS for the frontend origin and must **not buffer SSE** (`X-Accel-Buffering: no` behind nginx).

---

## 12. Quality, accessibility and testing

- **Accessibility:**
  - The log has `role="log"` and `aria-live="polite"`. The streaming draft announces only on `done`, which avoids a token-by-token screen-reader flood.
  - Every icon button has an `aria-label`, and the recorder and call controls are reachable by keyboard.
  - Focus is visible everywhere. Contrast is at least AA: muted `#616161` on white is 6.2:1.
- **Tests:**
  - Vitest unit tests for `sse.ts` (chunk boundaries, multi-line data, heartbeats), `applyStreamEvent`, the recorder state machine and `groupByDate`.
  - MSW-mocked streaming for `useSendMessage`.
- **Performance:**
  - Vapi, the Markdown renderer and the recorder are code-split.
  - Rendering of stream deltas is rAF-batched.
  - The message list is virtualized only if needed later (not in v1).

---

## 13. Phase plan

| Phase | Scope |
|---|---|
| **0** | Reference analysis, architecture, API contract (this). |
| 1 | Vite scaffold, tokens, fonts, primitives, AppShell (sidebar/drawer), static ChatView with mock data. |
| 2 | API client, SSE parser, conversations and messages with real streaming, Markdown, stop and retry, anchored scroll. |
| 3 | Kinde auth, token bridge, route guards, `/me`. |
| 4 | Voice notes: record, pause/resume, preview, direct send, voice message player, transcript. |
| 5 | Vapi calling: session endpoint, CallPanel, transcript sync. |
| 6 | Responsive polish, accessibility pass, reduced motion, error and empty states, tests. |
