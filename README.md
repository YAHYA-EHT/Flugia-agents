# Flugia — Multi-Agent AI Platform

Flugia is a multi-agent AI platform where each department has its own dedicated AI agent. Each agent runs as an independent FastAPI backend with its own chat interface in the shared Next.js frontend.

Agents can hand off conversations to one another with full context — if you ask Emily something that belongs to Sales, she generates a rich brief and offers to redirect you to John, who picks up exactly where she left off without you having to retype anything.

---

## Agents

| Agent | Department | Backend | Port | Frontend route |
|-------|-----------|---------|------|---------------|
| **David** | Marketing — E-Réputation, SEO Content, LinkedIn | `Agents/David/chat_server.py` | 8000 | `/dashboard/marketing` |
| **Emily** | Support — Chatbot IA, Agent Call | `Agents/Emily/emily.py` | 8001 | `/dashboard/support` |
| **John** | Sales — Prospecting, Campaigns | `Agents/John/john.py` | 8003 | `/dashboard/sales` |
| **Roger** | Direction Générale — orchestrateur global | `Agents/Roger/roger.py` | 8002 | `/dashboard/global` |
| **Aria** | Executive Assistant | frontend-integrated | — | `/dashboard/bureau/executive-assistant` |

---

## Architecture

```
Client (Next.js)
      │
      ├── David (8000)   ← E-Rep API, SEO API, LinkedIn n8n
      ├── Emily (8001)   ← Chatbot API, Agent Call API
      ├── John  (8003)   ← Prospecting API, Campaigns API
      └── Roger (8002)   ← orchestre David + Emily + John en parallèle
```

**Roger** is the only agent that calls the others. He queries David, Emily, and John simultaneously via HTTP, synthesizes their responses, and presents a unified view to the client. All other inter-agent communication is done through handoffs with context briefs stored in `localStorage`.

---

## Cross-agent handoff system

When an agent detects that a client's request belongs to another agent's domain, it:

1. Calls `handoff_to_agent()` — generates a structured brief with the client's request and relevant context data
2. Emits a `handoff` SSE event to the frontend
3. The frontend stores the brief in `localStorage` and opens the `HandoffPanel`
4. The client clicks "Go to [Agent]" — the target agent reads the brief and starts the conversation with full context

Brief format received by the target agent:
```
[CONTEXTE ROGER]         ← or DAVID, EMILY, JOHN
Demande du client : ...
Données récupérées : ...
Action immédiate : ...
```

The receiving agent always opens with: *"Roger m'a transmis le contexte de votre échange."*

---

## Tech stack

**Backend**
- Python 3.12, FastAPI, uvicorn
- OpenRouter (Claude Haiku 4.5 for simple responses, Claude Sonnet 4.6 for complex tasks)
- `reportlab` for PDF report generation
- `httpx` for inter-agent HTTP calls (Roger → David/Emily/John)
- Circuit breaker + retry logic in Roger for production reliability

**Frontend**
- Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- XHR (not fetch) for real-time SSE streaming — avoids Next.js dev buffering
- `localStorage` for conversation persistence (no database)
- `useRef` for all XHR callback state (avoids stale closure bugs)

**Data**
- Live Flugia REST API for business data (leads, campaigns, reviews, SEO, chatbots, calls)
- Auto token refresh on expiry (email + password re-authentication)
- ReportLab PDF generation served via `/reports/` static mount

---

## Project structure

```
Flugia-agents/
├── Agents/
│   ├── David/
│   │   ├── chat_server.py        # FastAPI server — port 8000
│   │   ├── skills/david.md       # System prompt — 700+ lines
│   │   ├── mcp_servers/
│   │   │   ├── e_reputation/     # MCP server for E-Rep API
│   │   │   └── seo/              # MCP server for SEO API (api_client.py)
│   │   └── reports/              # Generated PDFs
│   ├── Emily/
│   │   ├── emily.py              # FastAPI server — port 8001
│   │   ├── api_client.py         # Flugia Support API client
│   │   ├── skills/emily.md       # System prompt — 667+ lines
│   │   └── reports/
│   ├── John/
│   │   ├── john.py               # FastAPI server — port 8003
│   │   ├── api_client.py         # Flugia Sales API client
│   │   ├── skills/john.md        # System prompt — 390+ lines
│   │   └── reports/
│   └── Roger/
│       ├── roger.py              # FastAPI server — port 8002
│       ├── skills/roger.md       # System prompt — 536+ lines
│       ├── mcp_servers/
│       │   ├── david/server.py   # MCP wrapper for David (external use)
│       │   └── emily/server.py   # MCP wrapper for Emily (external use)
│       └── reports/
├── david-frontend/               # Next.js app — all agents' UIs
│   ├── app/
│   │   └── HomeApp.tsx           # Main routing (agent selection)
│   ├── components/
│   │   ├── david/                # DavidChatScreen, DavidOverview, DavidFeatureScreen
│   │   ├── emily/                # EmilyChatScreen, EmilyOverview, EmilyFeatureScreen
│   │   ├── john/                 # JohnChatScreen, JohnOverview, JohnFeatureScreen
│   │   ├── roger/                # RogerChatScreen, RogerOverview
│   │   ├── flugia/               # FlugiaShell, FlugiaSidebar, FlugiaMainDashboard
│   │   └── shared/
│   │       └── HandoffPanel.tsx  # Cross-agent redirect panel
│   └── lib/aria/routes.ts        # Route parsing helpers
└── flugia_mcp_server.py          # Centralized MCP server (external integrations)
```

---

## Getting started

### Prerequisites

- Python 3.12+
- Node.js 18+
- A virtual environment at the repo root

### 1. Install Python dependencies

```bash
python -m venv venv
source venv/bin/activate          # Linux/macOS
venv\Scripts\activate             # Windows

pip install fastapi uvicorn openai reportlab httpx python-dotenv mcp
```

### 2. Configure environment variables

Each agent needs its own `.env` file. Copy and fill in your credentials:

```bash
cp Agents/David/.env.example  Agents/David/.env
cp Agents/Emily/.env.example  Agents/Emily/.env
cp Agents/John/.env.example   Agents/John/.env
cp Agents/Roger/.env.example  Agents/Roger/.env
```

Required variables per agent:

```env
# OpenRouter (required for all agents)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Flugia API (required for live data)
FLUGIA_API_BASE_URL=https://api-dev.flugia.com
FLUGIA_EMAIL=your@email.com
FLUGIA_PASSWORD=yourpassword

# SMTP (required for email sending)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASSWORD=your-app-password   # Gmail App Password (not your account password)
SMTP_FROM=David — Flugia <your@email.com>

# Roger only — agent URLs
DAVID_URL=http://localhost:8000
EMILY_URL=http://localhost:8001
JOHN_URL=http://localhost:8003
```

> **Gmail users**: generate an App Password at myaccount.google.com → Security → 2-Step Verification → App passwords. Use that 16-character password as `SMTP_PASSWORD`.

### 3. Start the backends

Open four terminals:

```bash
# Terminal 1 — David
cd Agents/David && uvicorn chat_server:app --reload --port 8000

# Terminal 2 — Emily
cd Agents/Emily && uvicorn emily:app --reload --port 8001

# Terminal 3 — John
cd Agents/John && uvicorn john:app --reload --port 8003

# Terminal 4 — Roger
cd Agents/Roger && uvicorn roger:app --reload --port 8002
```

### 4. Start the frontend

```bash
cd david-frontend
npm install
npm run dev
```

Open `http://localhost:3000/dashboard`.

---

## PDF reports

Every agent can generate PDF reports on demand:

| Agent | Reports |
|-------|---------|
| David | E-Réputation, SEO, Marketing complet, conversation |
| Emily | Chatbots, Agent Call, Support complet, conversation |
| John | Leads, Campagnes, conversation |
| Roger | Rapport global (David + Emily + John), conversation |

PDFs are served statically from each agent's `reports/` folder and can be downloaded directly or sent by email with multiple attachments in a single call.

---

## Contributing

**Never push directly to `main`.** Always use a feature branch:

```bash
git checkout main && git pull
git checkout -b feature/your-feature-name
# make changes, commit
git push -u origin feature/your-feature-name
# open a PR on GitHub against main
```

**Rules:**
- Each agent's code stays self-contained in `Agents/<Name>/` — no shared monolithic backend files
- Never commit `.env` files, generated PDFs (`reports/*.pdf`), or `__pycache__`
- Run `git status` before every commit and double-check `.gitignore`
- Test locally with all 4 agents running before opening a PR
- If you add a new agent, wire it into `Roger` (`AGENTS` dict + `consult_<name>` tool) and into `HomeApp.tsx`
