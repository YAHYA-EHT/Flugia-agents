# Emily — AI Support Manager

Emily gère le **Chatbot IA** et l'**Agent Call** (agent vocal).

- **Port** : 8001
- **Fichier** : `Agents/Emily/emily.py`
- **Client API** : `Agents/Emily/api_client.py`
- **System prompt** : `Agents/Emily/skills/emily.md`

---

## Contextes disponibles

| Contexte | Route frontend | Outils |
|----------|---------------|--------|
| `emily` | `/dashboard/support` | Tous les outils Support |
| `chatbot` | `/dashboard/support/chatbot` | TOOLS_CHATBOT |
| `agent_call` | `/dashboard/support/agent-call` | TOOLS_AGENT_CALL |

---

## Outils disponibles

### Chatbot

| Outil | Description | Confirmation |
|-------|-------------|-------------|
| `get_chatbots()` | Liste tous les chatbots | Non |
| `get_chatbot(id)` | Détail d'un chatbot | Non |
| `get_chatbot_statistics()` | Stats globales chatbot | Non |
| `get_chatbot_history(public_token)` | Historique conversations | Non |

> **Important** : `get_chatbot_history` nécessite le `public_token` du chatbot.
> Toujours appeler `get_chatbots()` d'abord pour extraire le champ `public_token`.

### Agent Call

| Outil | Description | Confirmation |
|-------|-------------|-------------|
| `get_agents()` | Liste les agents vocaux | Non |
| `get_agent(id)` | Détail d'un agent | Non |
| `get_call_dashboard()` | Vue d'ensemble appels | Non |
| `get_call_dashboard_calls()` | Liste des appels récents | Non |
| `get_call_dashboard_ratings()` | Notes de satisfaction | Non |
| `get_call_transcripts()` | Liste des transcriptions | Non |
| `get_call_transcript(id)` | Transcription complète | Non |
| `get_booked_meetings()` | Réunions bookées | Non |
| `get_agent_tasks()` | Tâches agents | Non |
| `create_agent_task(...)` | Créer une tâche | Non |
| `update_agent(id, data)` | Modifier un agent vocal | **Oui** |

### Commun

| Outil | Description |
|-------|-------------|
| `get_customer_feedback()` | Feedbacks clients |
| `get_balance_transactions()` | Transactions de balance minutes |
| `generate_chatbot_report()` | PDF rapport chatbot |
| `generate_call_report()` | PDF rapport appels |
| `generate_support_report()` | PDF rapport support complet |
| `generate_conversation_pdf(title, content)` | PDF contenu libre |
| `send_email(to, subject, body, file_names?)` | Email avec pièces jointes |
| `handoff_to_agent(agent, ...)` | Redirection vers David/John/Roger |

---

## Modifier un agent vocal

```python
# Champs modifiables via PUT /api/agents/{id}
update_agent(
    id=92,
    data={
        "agent_name": "Salma - Support FR",
        "language": "fr",
        "greeting_message": "Bonjour, je suis Salma...",
        "specific_instructions": "...",
        "duration_limit": 10,
        "timezone": "Africa/Casablanca"
    }
)
```

> **Toujours récupérer l'ID réel** via `get_agents()` avant toute modification — ne pas supposer que l'ID est 1.

---

## Sanitizer appels

Les appels peuvent contenir de l'audio base64 qui dépasse les limites de contexte LLM.
`_sanitize_call()` est appliqué automatiquement sur `get_call_dashboard_calls()` :

- Champs supprimés : `recording_url`, `audio`, `audio_base64`, `media_url`
- Transcriptions tronquées à 1500 caractères
- Maximum 10 appels retournés dans le contexte

---

## Règles critiques

- **get_chatbot_history** : toujours appeler `get_chatbots()` d'abord pour extraire `public_token`
- **update_agent** : confirmation obligatoire — action live sur un vrai agent vocal
- **Multi-rapport email** : générer tous les PDFs d'abord, puis UN SEUL `send_email(file_names=[...])`
- **Email en 2 temps** : vérifier/demander adresse → confirmer → `send_email()`
- **Redirection sections** : `chatbot` et `agent_call` redirigent en 1 phrase + handoff immédiat si hors périmètre

---

## Endpoints REST

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/chat` | Streaming SSE |
| `GET` | `/health` | Statut de l'agent |
| `GET` | `/reports/{filename}` | PDFs générés |