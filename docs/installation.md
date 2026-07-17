# Installation

## Prérequis

- Python 3.12+
- Node.js 18+
- Compte OpenRouter avec clé API
- Compte Flugia avec accès API

## 1. Cloner le dépôt

```bash
git clone https://github.com/YAHYA-EHT/Flugia-agents
cd Flugia-agents
```

## 2. Environnement Python

```bash
python -m venv venv
source venv/bin/activate          # Linux/macOS
venv\Scripts\activate             # Windows

pip install fastapi uvicorn openai reportlab httpx python-dotenv tiktoken mcp
```

## 3. Variables d'environnement

Créer un fichier `.env` dans chaque dossier agent (`Agents/David/`, `Agents/Emily/`, `Agents/John/`, `Agents/Roger/`) :

```env
# OpenRouter (obligatoire)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Flugia API (obligatoire pour les données réelles)
FLUGIA_API_BASE_URL=https://api-dev.flugia.com
FLUGIA_EMAIL=votre@email.com
FLUGIA_PASSWORD=votre_mot_de_passe

# Mode (mock = démo sans API, real = données réelles)
APP_MODE=real

# SMTP (obligatoire pour l'envoi d'emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre@email.com
SMTP_PASSWORD=votre_app_password_gmail
SMTP_FROM=David — Flugia <votre@email.com>

# Roger uniquement — URLs des agents
DAVID_URL=http://localhost:8000
EMILY_URL=http://localhost:8001
JOHN_URL=http://localhost:8003

# John uniquement — sécurité des liens PDF
REPORT_SIGNING_SECRET=une_chaine_aleatoire_fixe_32_chars
```

> **Gmail** : utiliser un App Password (pas le mot de passe du compte).
> Générer sur : myaccount.google.com → Sécurité → Validation en 2 étapes → Mots de passe des applications

## 4. Lancer les backends

```bash
# Terminal 1 — David
cd Agents/David
uvicorn chat_server:app --reload --port 8000

# Terminal 2 — Emily
cd Agents/Emily
uvicorn emily:app --reload --port 8001

# Terminal 3 — John
cd Agents/John
uvicorn john:app --reload --port 8003

# Terminal 4 — Roger
cd Agents/Roger
uvicorn roger:app --reload --port 8002
```

## 5. Lancer le frontend

```bash
cd david-frontend
npm install
npm run dev
```

Ouvrir `http://localhost:3000/dashboard`.

## 6. Vérifier que tout tourne

```bash
curl http://localhost:8000/health  # {"status":"ok","agent":"David"}
curl http://localhost:8001/health  # {"status":"ok","agent":"Emily"}
curl http://localhost:8003/health  # {"status":"ok","agent":"John"}
curl http://localhost:8002/health  # {"status":"ok","agent":"Roger"}
```

## Structure des dossiers

```
Flugia-agents/
├── Agents/
│   ├── David/
│   │   ├── chat_server.py          # Serveur FastAPI — port 8000
│   │   ├── skills/david.md         # System prompt (700+ lignes)
│   │   ├── mcp_servers/
│   │   │   ├── e_reputation/       # Client API E-Réputation
│   │   │   ├── seo/                # Client API SEO
│   │   │   └── linkedin/           # Client API LinkedIn
│   │   └── reports/                # PDFs générés
│   ├── Emily/
│   │   ├── emily.py                # Serveur FastAPI — port 8001
│   │   ├── api_client.py           # Client API Support
│   │   ├── skills/emily.md         # System prompt
│   │   └── reports/
│   ├── John/
│   │   ├── john.py                 # Serveur FastAPI — port 8003
│   │   ├── api_client.py           # Client API Sales
│   │   ├── skills/john.md          # System prompt
│   │   └── reports/
│   └── Roger/
│       ├── roger.py                # Serveur FastAPI — port 8002
│       ├── skills/roger.md         # System prompt
│       └── reports/
├── david-frontend/                 # Next.js — tous les UIs
│   ├── app/HomeApp.tsx             # Routing principal
│   ├── components/
│   │   ├── david/
│   │   ├── emily/
│   │   ├── john/
│   │   ├── roger/
│   │   └── shared/HandoffPanel.tsx # Panel de redirection inter-agents
│   └── lib/aria/routes.ts
└── README.md
```