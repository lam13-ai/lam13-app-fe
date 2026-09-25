# Reference UI Analysis — Lam13.ai

> Visual source of truth for Phase 1+. Inspected on 2026-09-24 using Playwright at 1440×900 and 390×844, with computed styles read from the live DOM.

## 0. Sources and their limits

| Source | Status |
|---|---|
| `https://app.lam13.ai/` | **Inspected.** This is a public marketing page (title *"AI Native Strategy Consulting \| Lam13.ai"*). The chat reference is the **"Live demo" widget** in the second section. |
| Signed-in workspace | **Not inspectable.** "Sign in" and "Start free" link to `https://www.lam13.ai/auth`, which returned **HTTP 404** on the day of inspection. |
| Attached reference video | **Not received.** No video file was in the workspace or passed to this session. Everything the video would show (sidebar, conversation list, real workspace flows) is still **unverified**. The *Inferred* sections below should be re-checked against the video once it is provided. |

Each section is split into three labelled parts:

- **Observed.** Measured or seen directly on the live page.
- **Inferred.** A reasonable extrapolation from observed patterns. Not seen.
- **Ours.** Features our product adds that the reference does not have.

---

## 1. Overall visual language

### Observed
- **Monochrome, editorial and "document-like".** The palette is near-black `#0A0A0A` on pure white `#FFFFFF`, with greys only for secondary text and borders.
- **One accent family: blue.** `--accent: hsl(224 77% 53%)` ≈ `#2B5CE6`. It is used sparingly: the logo `.ai`, the gradient word in the hero, small square bullets, the agent avatar and model chips.
  - `--gradient-accent: linear-gradient(100deg, #1E3FBF 0%, #2B5CE6 50%, #7AA0FF 100%)`
- **Two typefaces, deliberately contrasted:**
  - **Cousine** (a monospace font, 400/700) is the display face *and the entire chat widget's face*: headings, nav, buttons, messages and composer.
  - **Inter** (400/500/600) is used for marketing body copy only (hero subtitle and section descriptions).
- **Square corners by default.** `--radius: 0rem`. Buttons, user bubbles, avatars and tables have 0 radius. Rounding appears only on:
  - the chat card container: `12px`
  - the composer pill: `24px`
  - small chips and icon buttons inside the composer: `9999px`
  - popovers: `16px`, with `12px` items
- **Hairline borders instead of shadows.** Most separation uses `1px` borders in `foreground / 10–30%` alpha. Shadows are subtle: `--shadow-card: 0 2px 8px hsl(0 0% 0% / .06)` and `--shadow-elevated: 0 8px 24px hsl(0 0% 0% / .1)`. The demo card sits on a very soft, large drop shadow.
- **Frosted sticky header:** `bg-white/90 backdrop-blur-xl`. The border starts transparent and becomes `border-foreground/15` after scrolling.
- **Section backgrounds** alternate between white and a very light grey (≈ `#F7F8FA`, from `--gradient-subtle` white→`hsl(0 0% 96%)`).
- **Eyebrow labels:** Cousine 12px, uppercase, `letter-spacing: 0.22em`, muted grey `#616161`, with a small blue gradient square on each side.

### Inferred
- The product's signed-in workspace probably shares this language (Cousine UI, square corners, monochrome and blue), because the demo widget is clearly a cut-down version of the real product composer. It has a model picker, an effort picker, attachments and a mic.

### Ours
- None at this level. **We adopt this language as-is.**

---

## 2. Layout and proportions

### Observed (demo widget, 1440px viewport)
- **Chat card:** `max-width ≈ 882px` (1140px when the section is wider), centred, `height: 80dvh`, `min-height: 520px`. The border is `1px solid rgba(10,10,10,.2)`, the radius `12px`, and the inner background white.
- **Vertical structure** is a three-row flex column:
  1. **Header row:** `70px` tall, `padding 16px 20px`, `gap 12px`, `border-bottom: 1px rgba(10,10,10,.1)`.
  2. **Message log:** `role="log"`, `flex: 1`, `overflow-y: auto`, **scrollbar hidden** (`scrollbar-width: none`), `padding 20px`, `gap 10px` between messages.
  3. **Composer area:** `padding 8px 16px 16px`. The composer is centred, with `max-width ≈ 520px` when idle.
- **Assistant messages** take the **full width** of the log. **User messages** are right-aligned with `max-width: 60%` (≥ md) or `85%` (mobile).
- **Page chrome:** header height `68px`, content container `max-width 1200px` with `24px` inner padding, and the logo at `32px` from the left edge.

### Inferred
- The real workspace probably places the conversation column in a similar centred reading width, with a separate navigation area (sidebar) that the demo omits.

### Ours
- **App shell:** a left sidebar (conversation list and account) plus the main chat workspace. The chat column follows the demo's proportions: full-width assistant text within a readable max width (~760px), right-aligned square user blocks, and a centred composer.

---

## 3. Header (chat header row)

### Observed
- **Avatar:** a `36×36` **square** filled with `--gradient-accent`, holding a white 4-point sparkle glyph (17px).
- **Title:** "Lam13 Strategy Agent", Cousine **13.5px / 700**.
- **Subtitle:** "Agentic reasoning • public sector", Cousine **11px**, muted `#616161`. Hidden below `sm`.
- **Right-aligned status:** a `20×20` `<canvas>` animation followed by a label in 11px muted text.
  - Idle: **"Online"**
  - While streaming: **"Answering…"**
  - The canvas animates while answering (a rotating ring of dots). It is the same visual family as the 64×64 empty-state animation.

### Ours
- The header gets a conversation title (editable) and actions: **start a voice call**, plus an overflow menu. The status slot is reused for **Online / Thinking… / Answering… / Recording… / In call**.

---

## 4. Messages

### Observed — user message
- A black block (`bg #0A0A0A`, text white) with **0 radius** and `padding 10px 16px`.
- Cousine **13px**, `line-height 1.625` (≈21px), right-aligned (`align-self: flex-end`).
- Appears with a small fade/slide-in (inline `opacity`/`transform` driven by a motion library, ending at `opacity:1; transform:none`).

### Observed — assistant message
- **No bubble, no avatar, no background.** Plain document text, full width, `padding 4px 0`, `align-self: flex-start`.
- Cousine **13.5px**, `line-height 1.625` (≈22px), colour `#0A0A0A`.
- **Rendered Markdown** with this typography:

  | Element | Style |
  |---|---|
  | `h2` | Cousine 16px / 700, `margin-bottom 12px`, line-height ≈1.12 |
  | `p` | `margin-bottom 8px` (last child 0) |
  | `ol` | decimal, `padding-left 20px`, `margin 8px 0` |
  | `ul` | disc, `padding-left 16px` |
  | `li` | `margin-bottom 6px` |
  | `strong` | 700. Used as run-in labels: **"The Framework:"** … |
  | `table` | full width, collapsed, **12.5px**, `margin 12px 0` |
  | `th` | `1px` border `rgba(10,10,10,.15)`, bg `rgba(0,0,0,.04)`, `padding 8px 12px`, bold, left-aligned |
  | `td` | same border, `padding 8px 12px`, `vertical-align: top` |

- **Response structure pattern:** an `h2` title, a one-line lead sentence, a numbered list with bold run-in labels, an optional table, and then a **closing clarifying question**. This is the "board-ready document" feel. It comes from the content, not from UI chrome.
- **No per-message action bar** (copy, retry, feedback) is visible in the demo.

### Inferred
- The real product very likely has message actions (copy, regenerate) on hover. **This is not verified.**

### Ours
- **Hover action row** under assistant messages (copy, regenerate), 28px icon buttons at muted `foreground/50` using the reference's icon-button style.
- **Voice message** as a user message: the same black square block, holding a play/pause button, a waveform and a duration, with the transcript shown underneath (collapsible).
- **Code blocks** (not seen in the reference): monospace is already the body font, so code gets a `bg-muted` panel with a `1px` border, 0 radius and a copy button.
- **Error state:** an inline muted-red (`--destructive hsl(11 58% 44%)`) line with "Retry".

---

## 5. Streaming and loading behaviour

### Observed
- The demo **plays a scripted conversation automatically** when the section scrolls into view. It restarts on re-entry.
  1. A typewriter effect types the prompt into the composer textarea.
  2. The prompt is "sent" and appears as a user block.
  3. The header status switches to **"Answering…"** and its canvas animates.
  4. The assistant text **streams in progressively at ≈170 characters/second** (measured: +42 to +48 chars every 250ms). The Markdown renders **as it streams**, so partial lists and headings show while they are still incomplete.
  5. Status returns to **"Online"**. The next scripted prompt starts.
- The demo streaming is **client-side simulated**. No network requests were made during playback.
- **The composer is hidden while answering** and returns afterwards.
- **Scroll anchoring:** when a new user message is sent, a spacer div (`shrink-0`, e.g. `height: 451px`) is appended under the latest turn. The log scrolls so the **new user message sits near the top of the viewport**, and the answer streams *downward* into the empty space. The view **does not** chase the bottom on every token (`scrollTop` stayed constant during streaming).

### Inferred
- There is no "typing dots" bubble. The pre-first-token wait is shown only by the header status and its animation.

### Ours
- **Real** backend streaming over SSE (see `api-contract.md`). We keep the observed behaviours: top-anchored new turn, progressive Markdown and the header status.
- **Stop generating:** while streaming, the send button becomes a **stop** button (square icon). The reference hides the composer instead. We keep the composer visible so users can stop, and disable its input during streaming.
- A thin **"Thinking…"** state before the first token (header status only, to match the reference).
- **Jump to latest:** a floating round button appears when the user scrolls up more than about one screen from the bottom.

---

## 6. Composer

### Observed
- **Idle (collapsed):** a **48px-tall pill**, `border-radius 24px`, `1px solid #DBDBDB`, white, `shadow-sm` (`0 1px 2px rgba(0,0,0,.05)`), width ≈520px.
  - It shows a placeholder button ("Ask about public sector strategy…"): Cousine 14px/500, `muted-foreground/80`.
  - A 32px black circular **send button** sits `8px` from the right and bottom edges.
- **Expanded (on click/focus):** the placeholder button cross-fades and scales out (`opacity-0 scale-105 translate-y-1`, 400ms, `cubic-bezier(0.175, 0.885, 0.32, 1.275)`, a springy overshoot). A `<textarea>` fades and scales in (`opacity-100 scale-100 translate-y-0`).
  - The textarea is `padding 14px 48px 14px 16px`, 14px (≥sm) / 16px (mobile, which avoids iOS zoom), `line-height 22px`, and auto-grows.
  - Top and bottom **fade masks** (`h-8` gradients from `card` to transparent) appear when it scrolls internally.
- **Toolbar** (shown only when expanded, fading up from `opacity-0 blur-sm translate-y-2`, 300ms, same spring easing). Its items:
  - **Model chip:** a gradient square (14px) plus "LAM13", Cousine 12px/600, `foreground/50`, `rounded-full`, `px-2 py-1`. Hover gives `bg-accent/10` and full-opacity text.
    - Opens a **popover above**: `rounded-2xl`, `bg-card/95`, `backdrop-blur-md`, `shadow-xl`, `p-1`, `w-44`. Items are `h-8 rounded-xl text-xs`, with a sliding `bg-muted` highlight behind the active item and `active:scale-[0.98]`.
  - **Effort chip:** a 3-bar signal icon plus "Medium". The bars' opacity encodes the level. Labels swap with `fade-in zoom-in-95` over 300ms.
  - **"+" button** (28px round, right-aligned): opens a hidden `<input type="file" accept="image/*" multiple>`.
  - **Attachment tray:** sits above the pill, `bg-muted`, `border`, `rounded-t-2xl`, and scrolls horizontally.
- **Send button** is a morphing icon (both icons are stacked and cross-faded with `scale-50 rotate-45 blur-[1px]` ↔ `scale-100 rotate-0`):
  - **Empty input:** a **microphone** icon.
  - **Has text:** an **up-arrow** icon.
  - Hover gives `opacity .9`. Focus-visible gives `ring-2 ring-ring`.
- **Focus state:** `focus-within:border-ring/40 ring-1 ring-ring/20`. Hover gives `border-border/80`.

### Inferred
- The mic presumably starts dictation or a voice interaction. Its behaviour could not be triggered in the demo.

### Ours
- **Voice recording in the composer.** Tapping the mic (empty-input state) turns the pill into a **recording bar**:
  - a live waveform, a timer, **pause/resume**, **cancel** (trash), **stop and preview**, and **send now**.
- **Preview before send:** play/pause, a scrubbable waveform, the duration, then **send** or **discard**.
- **Direct voice send:** "send now" skips the preview.
- **Start voice call** (Vapi): a separate header action. It is not in the composer, which keeps the composer's single mic affordance unambiguous.
- Model and effort chips: **only if the backend supports them.** The composer keeps the slots and they are hidden when there is no data.
- Enter sends; Shift+Enter adds a newline; Esc collapses an empty composer.

---

## 7. Empty state

### Observed
- Centred in the log (`m-auto`, `gap 20px`, `px-6`): a **64×64 canvas animation** (a ring of dots), `aria-label "Agent listening"`.
- Below it, a line of text: *"Ask me to design, stress-test, or package a strategy."* Cousine 14px, muted, `max-width: 34ch`, `leading-relaxed`.

### Ours
- The same composition, plus **2–4 suggested prompts** as square outlined chips (the "See it think" button style at a small size), shown only on a brand-new conversation.

---

## 8. Buttons and icons

### Observed
| Variant | Spec |
|---|---|
| **Primary** | `bg #0A0A0A`, white text, Cousine 15px, `px-8 py-4`, `min-h 52px`, **0 radius**, optional trailing `↗`. Transition 150ms `cubic-bezier(.4,0,.2,1)`. |
| **Secondary** | `1px border foreground/30`, `bg-white/70 backdrop-blur-sm`, same sizing. |
| **Outline small** (Sign in) | `1px solid #0A0A0A`, `px-4 py-2.5`, 14px. Hover inverts to a black background with white text. |
| **Ghost nav** | Cousine 13.5px, muted. Hover gives foreground colour and `bg-foreground/5`, `px-3 py-2.5`. |
| **Composer chip** | `rounded-full px-2 py-1`, 12px/600, `foreground/50`. Hover gives `bg-accent/10`. |
| **Icon button** | `size-7` (28px) round, `foreground/50`. Hover gives `bg-accent/10` and foreground. Disabled gives `opacity-40`. |
| **Send** | 32px round, `bg-primary`, white icon 12–13px. |

- **Icons** are custom inline SVGs on a 14×14 viewBox with `stroke-width 1.5–1.75`, round caps and joins, and `currentColor`. The style is very thin and geometric. The **lucide** icon set at `strokeWidth 1.5` matches it closely.

---

## 9. Motion

### Observed
- **Standard UI transition:** `150ms cubic-bezier(.4,0,.2,1)`. Used for colours, borders and backgrounds.
- **Smooth token:** `--transition-smooth: all .3s cubic-bezier(.4,0,.2,1)`.
- **Spring or overshoot for composer and popovers:** `300–400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)`, combining opacity, scale (0.95/1.05 ↔ 1), a small translate-y (4–12px) and a `blur` of 1–4px ↔ 0.
- **Message enter:** fade plus a small translate, driven by a JS motion library (inline styles).
- **Canvas** animations for the agent status (dot ring).
- **Logo marquee** on the landing page (not relevant to the app).

### Ours
- Respect `prefers-reduced-motion`: turn off the spring, blur and marquee-type motion, and keep opacity fades at ≤150ms.

---

## 10. Scrolling

### Observed
- The log has a **hidden scrollbar**. The page itself uses the native scrollbar.
- New turn pinning uses a bottom spacer, as described in §5.
- The header becomes frosted and bordered after the page scrolls.

### Ours
- The same log behaviour. Pagination loads older messages when the user scrolls to the top, preserving scroll position.

---

## 11. Responsive behaviour

### Observed (390px)
- The page header collapses to the logo plus an **"Open menu"** button. Nav and CTAs are hidden.
- The chat card is ≈330px wide with a ~24px side gutter, keeps its 12px radius, and is `80dvh` tall.
- User blocks widen to `max-width 85%`. The header subtitle is hidden below `sm`.
- The textarea uses 16px text on mobile, which prevents iOS focus zoom.

### Ours
- **< 768px:** the sidebar becomes an off-canvas drawer (hamburger in the chat header). The chat is full-bleed (no card border), and the composer is pinned to the bottom with `env(safe-area-inset-bottom)` padding.
- **≥ 768px:** a persistent sidebar (260px), collapsible to an icon rail.
- **≥ 1280px:** the chat column is capped at a reading width of about 760px and centred.
- The recording bar and call panel go full width on mobile, with touch targets ≥ 44px.

---

## 12. What NOT to do (to avoid a generic ChatGPT clone)
- No rounded message bubbles for the assistant, no avatars beside each assistant message, and no grey-bubble or white-bubble pairs.
- No sans-serif chat body. **Cousine is the chat font.** Inter is reserved for occasional long-form marketing or helper copy.
- No large radii on buttons or cards (only the composer pill and popovers are round).
- No colourful gradients except the single blue accent, used at small sizes.
- No heavy shadows. Use hairline borders.

---

## 13. Open items to verify with the video
1. The workspace sidebar: its contents, width, conversation grouping (by date?), search, and new-chat placement.
2. Whether the signed-in app shows message actions (copy, regenerate, feedback).
3. What the mic does in the real product (dictation versus a voice message).
4. Whether the real product shows model reasoning ("thinks step by step" is in the marketing copy) as a collapsible block.
5. Dark mode: the CSS has no dark variables. **Assume light-only for v1.**
6. Behaviour of document or slide output artefacts (PDF or PPTX cards appear on the landing page).
