# Roger — Global Director

Roger est l'orchestrateur global. Il consulte David, Emily et John en parallèle et synthétise leurs réponses.

- **Port** : 8002
- **Fichier** : `Agents/Roger/roger.py`
- **System prompt** : `Agents/Roger/skills/roger.md`
- **Modèle** : Claude Sonnet 4.6 uniquement (pas de Haiku)

---

## Architecture

```
Client
  │
  └── Roger (8002)
        ├── consult_david  → David  (8000)
        ├── consult_emily  → Emily  (8001)
        ├── consult_john   → John   (8003)
        └── consult_all    → Parallèle (David + Emily + John)
```

---

## Outils de consultation

| Outil | Description |
|-------|-------------|
| `consult_david(question)` | Interroge David sur le Marketing |
| `consult_emily(question)` | Interroge Emily sur le Support |
| `consult_john(question)` | Interroge John sur le Sales |
| `consult_all(question)` | Consulte les 3 en parallèle |
| `generate_global_report()` | PDF rapport global (Marketing + Support + Sales) |
| `generate_conversation_pdf(title, content)` | PDF contenu libre |
| `send_email(to, subject, body, file_names?)` | Email avec PDFs |
| `handoff_to_agent(agent, ...)` | Redirection avec brief complet |

---

## Circuit Breaker

Roger protège les appels inter-agents avec un circuit breaker par agent :

| État | Condition | Comportement |
|------|-----------|-------------|
| `CLOSED` | Normal | Appels autorisés |
| `OPEN` | 3 échecs consécutifs | Appels bloqués, réponse de fallback |
| `HALF_OPEN` | Après 30s en OPEN | Test d'un appel pour vérifier la récupération |

Les agents indisponibles sont exclus de `consult_all` et `generate_global_report` automatiquement.

---

## Processus handoff depuis Roger

Quand Roger détecte qu'une demande est spécifique à un agent :

**Étape 1** — Consulter l'agent cible pour obtenir les données réelles :
```python
consult_david("articles SEO existants, config du site, suggestions disponibles")
```

**Étape 2** — Générer un brief riche et rediriger :
```python
handoff_to_agent(
    agent="david",
    client_request="générer un article SEO sur l'IA",
    context_from_agent="[données réelles récupérées par Roger]",
    action_required="proposer 3 angles non encore couverts et lancer la génération"
)
```

L'event SSE `handoff` est émis → le frontend stocke le brief dans localStorage → HandoffPanel s'ouvre.

---

## Rapport global

`generate_global_report()` consulte tous les agents disponibles avec la question :

> "Fais un résumé structuré en texte simple (pas de markdown) : KPIs principaux, alertes actives, points d'attention, état général. Maximum 300 mots."

Le PDF est structuré en 3 sections : Marketing — David, Support — Emily, Sales — John.
Le Markdown est nettoyé avant génération (suppression `##`, `**`, backticks).

---

## Routing des requêtes

Roger détecte automatiquement l'agent pertinent via des mots-clés :

| Domaine | Mots-clés | Agent |
|---------|-----------|-------|
| Marketing | réputation, avis, seo, article, linkedin, blog, audit | David |
| Support | chatbot, appel, call, transcript, satisfaction, balance | Emily |
| Sales | lead, prospect, pipeline, campagne, outreach, closing, crm | John |
| Global | bilan, vue d'ensemble, performance globale, tous | consult_all |

---

## Endpoints REST

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/chat` | Streaming SSE |
| `GET` | `/health` | Statut Roger |
| `GET` | `/reports/{filename}` | PDFs générés |