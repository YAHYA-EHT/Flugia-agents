# Contribuer

## Règles Git

- **Ne jamais pousser directement sur `main`**
- Toujours créer une branche feature :

```bash
git checkout main && git pull
git checkout -b feature/votre-fonctionnalite
# ... commits ...
git push -u origin feature/votre-fonctionnalite
# Ouvrir une PR sur GitHub contre main
```

## Ajouter un nouvel agent

1. Créer `Agents/NouvelAgent/` avec `server.py`, `api_client.py`, `skills/agent.md`
2. Ajouter l'agent dans `roger.py` :
   ```python
   AGENTS["nouvel_agent"] = os.getenv("NOUVEL_AGENT_URL", "http://localhost:800X")
   NOUVEL_AGENT_KW = ["mot-clé1", "mot-clé2"]
   # Ajouter consult_nouvel_agent dans TOOLS et execute_tool
   ```
3. Ajouter la carte dans `RogerOverview.tsx`
4. Créer `components/nouvel_agent/` dans le frontend
5. Ajouter la route dans `HomeApp.tsx`
6. Mettre à jour `HandoffPanel.tsx` avec les patterns de redirection

## Ne jamais commiter

- Fichiers `.env`
- PDFs générés (`reports/*.pdf`)
- Base de données SQLite (`sessions.db`)
- `__pycache__/`

Vérifier `.gitignore` avant chaque commit :
```bash
git status  # vérifier ce qui va être commité
```

## Structure d'un agent

Chaque agent suit la même architecture :

```python
# 1. Chargement du system prompt
with open("skills/agent.md") as f:
    BASE_PROMPT = f.read()

# 2. Routing Haiku/Sonnet
def route_model(message: str) -> str:
    # Haiku pour les salutations simples
    # Sonnet pour tout le reste

# 3. Boucle agentique (MAX 5 rounds)
while round_count < MAX_ROUNDS:
    response = await llm.create(tools=tools, messages=messages)
    if not response.tool_calls:
        break  # Réponse texte finale
    # Exécuter les outils, ajouter à messages, continuer

# 4. Sanitizer contexte LLM
# sanitize_result() appliqué sur tous les résultats d'outils

# 5. Event handoff SSE
if result.get("handoff"):
    yield f"data: {json.dumps({'type':'handoff', 'agent':..., 'brief':...})}\n"

# 6. Endpoint /health obligatoire
@app.get("/health")
async def health():
    return {"status": "ok", "agent": "NomAgent", "port": 800X}
```

## Tests manuels

Avant chaque PR, tester :

```bash
# Health check
curl http://localhost:800X/health

# Question simple (doit utiliser Haiku)
curl -X POST http://localhost:800X/chat \
  -d '{"message":"bonjour"}' | grep "model_selected"

# Question avec outil (doit utiliser Sonnet)
curl -X POST http://localhost:800X/chat \
  -d '{"message":"montre-moi les données"}' | grep "tool_start"

# Handoff (doit émettre event handoff)
curl -X POST http://localhost:800X/chat \
  -d '{"message":"question hors périmètre"}' | grep "handoff"
```