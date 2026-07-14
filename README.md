# Flugia

Flugia is a multi-agent AI platform. Each department has its own dedicated AI agent, and each agent runs as an independent backend service with its own chat interface in the frontend.

## Agents

| Agent | Department | Backend | Port | Frontend route |
|---|---|---|---|---|
| **David** | Marketing (E-Reputation, SEO Content, LinkedIn) | `Agents/David/chat_server.py` | 8000 | `/dashboard/marketing` |
| **Emily** | Support (Chatbot, Agent Call) | `Agents/Emily/emily.py` | 8001 | `/dashboard/support` |
| **John** | Sales (Prospecting, Campaigns) | `Agents/John/john.py` | 8002 | `/dashboard/sales` |
| **Aria** | Executive Assistant | frontend-integrated | — | `/dashboard/bureau/executive-assistant` |

Agents can hand off a conversation to one another — if you ask David a question that's really about Sales, he'll offer to redirect you to John (and vice versa), carrying your question over so you don't have to retype it.

## Tech stack

- **Backend**: Python, FastAPI, OpenAI-compatible client via OpenRouter (Claude models), `reportlab` for PDF report generation
- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Data**: SQLite for conversation persistence (per agent), real Flugia REST API for live business data (leads, campaigns, reviews, SEO, etc.)

## Project structure

```
Flugia-agents/
├── Agents/
│   ├── David/          # Marketing agent — backend, skills, own mcp_servers, reports
│   ├── Emily/          # Support agent — backend, skills, reports
│   └── John/           # Sales agent — backend, skills, reports
├── david-frontend/     # Next.js app — all agents' chat UIs live here
│   ├── app/            # Routing (HomeApp.tsx drives agent selection)
│   ├── components/
│   │   ├── david/
│   │   ├── emily/
│   │   ├── john/
│   │   ├── aria/
│   │   └── shared/     # Cross-agent components (e.g. HandoffPanel)
│   └── lib/aria/       # Routing helpers, state, API client
└── reports/            # Legacy shared reports folder (each agent now has its own)
```

## Getting started

### 1. Backend — each agent runs independently

Each agent needs its own `.env` file (same content works for all three — copy your credentials into each folder):

```
Agents/David/.env
Agents/Emily/.env
Agents/John/.env
```

Required variables: `OPENROUTER_API_KEY` (needed to talk to Claude), plus `FLUGIA_API_BASE_URL`, `FLUGIA_EMAIL`, `FLUGIA_PASSWORD`, `SMTP_*` if you want live data / real email sending instead of `APP_MODE=mock`.

Set up a virtual environment once at the repo root:

```bash
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
pip install openai reportlab tiktoken httpx python-dotenv
```

Then, in three separate terminals:

```bash
cd Agents/David && uvicorn chat_server:app --reload --port 8000
cd Agents/Emily && uvicorn emily:app --reload --port 8001
cd Agents/John  && uvicorn john:app --reload --port 8002
```

### 2. Frontend

```bash
cd david-frontend
npm install
npm run dev
```

Open `http://localhost:8080/dashboard`.

## Contributing

- **Never push directly to `main`.** Create a feature branch, push it, and open a pull request:
  ```bash
  git checkout main
  git pull
  git checkout -b feature/your-feature-name
  # ... make changes, commit ...
  git push -u origin feature/your-feature-name
  ```
  Then open a PR on GitHub against `main`.
- Keep each agent's code self-contained inside its own `Agents/<Name>/` folder — avoid reintroducing shared/monolithic backend files.
- Don't commit `.env` files, generated PDF reports, or `sessions.db` — these are local/runtime artifacts (already covered by `.gitignore`, but double-check `git status` before committing).
