# AAILEF — Arabic AI Linguistic Evaluation Framework

> أداة تقييم المخرجات اللغوية العربية للذكاء الاصطناعي
> *(Arabic README: [README.ar.md](./README.ar.md))*

AAILEF is a browser-based tool that scores **AI-generated Arabic text** across **10 weighted linguistic axes** using Claude, then produces an overall quality score, a radar chart, axis-by-axis reasoning, detected error types, and actionable recommendations. It was built to support reproducible, rubric-based evaluation of Arabic NLP/LLM output — for research, theses, and practical QA.

It is a **bring-your-own-key** static web app: each user supplies their own Anthropic API key, which is stored **only in their browser** and sent **directly** to the Anthropic API. There is no backend and no shared secret, so the app can be hosted for free on GitHub Pages (or any static host) and used by anyone in the world.

---

## ✨ Features

- **10-axis weighted rubric** (A1–A10) with a Language-Quality (LQ) / Task-Quality (TQ) split.
- **Schema-enforced scoring** via Claude *Structured Outputs* — the model returns valid JSON every time, so results never fail to parse.
- **Claude Opus 4.8** for the most accurate Arabic linguistic judgement, with an optional *deep reasoning* (adaptive thinking) toggle.
- **Radar chart + per-axis bars + reasoning + error taxonomy.**
- **Evaluation history** (last 50, persisted in the browser) and a **comparison view** across systems.
- **Export** a single result as JSON or the full history as CSV (UTF-8 with BOM, opens cleanly in Excel) — ready for thesis data tables.
- Fully **right-to-left Arabic UI**.

---

## 🧮 The framework

| Axis | Name | English | Weight |
|------|------|---------|:------:|
| A1 | سلامة الكتابة | Orthographic Integrity | ×1.0 |
| A2 | التشكيل والغموض | Diacritics & Ambiguity | ×1.5 |
| A3 | الاتساق الصرفي | Morphological Consistency | ×1.5 |
| A4 | المطابقة النحوية | Grammatical Agreement | ×1.0 |
| A5 | سلامة التركيب | Syntactic Well-formedness | ×1.0 |
| A6 | وضوح المعنى | Semantic Clarity | ×1.5 |
| A7 | الحساسية للسياق | Context Sensitivity | ×2.0 |
| A8 | ثبات السجل اللغوي | Register & Dialect Control | ×1.5 |
| A9 | دقة المصطلح | Terminological Accuracy | ×2.0 |
| A10 | جودة أداء المهمة | Task Performance Quality | ×2.0 |

**Scoring:**

- `LQ` (Language Quality) = weighted average of **A1–A9**, on a 1–5 scale.
- `TQ` (Task Quality) = the **A10** score directly.
- **Overall** = `0.7 · LQ + 0.3 · TQ`.

Each axis is scored 1–5 with a short evidence-based reason and an error code (E1–E9, or "no error"). The full definitions live in [`src/aailef.js`](./src/aailef.js) — the single source of truth that drives both the UI and the model prompt.

---

## 🚀 Run locally

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev
```

Open the printed URL (default <http://localhost:5173>), go to **⚙️ الإعدادات (Settings)**, paste your Anthropic API key, then evaluate.

> Get a key at <https://console.anthropic.com/settings/keys>.

Build a production bundle:

```bash
npm run build      # outputs to dist/
npm run preview    # serve the built bundle locally
```

---

## 🌍 Deploy (free) on GitHub Pages

This repo is published on GitHub Pages from a **`gh-pages` branch** that holds the
built site (`dist/`). To update the live site after changing the code:

```bash
npm run build
npx gh-pages -d dist        # or push the dist/ folder to the gh-pages branch
```

Then enable it once under **Settings → Pages → Source: Deploy from a branch →
`gh-pages` / root**. Your tool goes live at `https://<username>.github.io/<repo>/`.

### Optional: auto-deploy on every push (GitHub Actions)

A ready-made workflow lives at [`docs/deploy.yml`](./docs/deploy.yml). To use it,
move it to `.github/workflows/deploy.yml`, then set **Settings → Pages → Source:
GitHub Actions**. (Pushing files under `.github/workflows/` requires a token with
the `workflow` scope.)

The build uses a relative base path (`base: "./"` in `vite.config.js`), so it also
works as-is on Netlify, Vercel, Cloudflare Pages, or any static host — no
configuration needed.

---

## 🔐 Privacy & security

- Your API key is stored with `localStorage` **in your own browser** and is never sent anywhere except `api.anthropic.com`.
- The app calls the Anthropic API directly from the browser using the
  `anthropic-dangerous-direct-browser-access` header. This is safe **because each user uses their own key** — there is no shared/server key to leak.
- Evaluated texts are sent to Anthropic for scoring (as with any Claude API call). Do not paste content you are not permitted to share with a third-party model.
- No analytics, no tracking, no backend.

---

## 🛠️ Tech & structure

- **React 18 + Vite** (single-page app, no backend).
- `src/aailef.js` — framework data + scoring math (the source of truth).
- `src/api.js` — Claude client: prompt construction, JSON-Schema structured output, error handling.
- `src/App.jsx` — UI (evaluate / history / guide / settings tabs).
- `docs/deploy.yml` — optional GitHub Actions auto-deploy workflow (see Deploy section).

Model: `claude-opus-4-8`. To change it, edit `MODEL` in `src/aailef.js`.

---

## 📄 License

MIT — see [LICENSE](./LICENSE). Free to use, adapt, and build upon, including for academic work. An acknowledgement is appreciated.
