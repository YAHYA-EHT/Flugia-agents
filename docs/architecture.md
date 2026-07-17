# Architecture

## Vue d'ensemble

```
Client (Next.js)
      │
      ├── David  (8000) ← E-Rep API, SEO API, LinkedIn API
      ├── Emily  (8001) ← Chatbot API, Agent Call API
      ├── John   (8003) ← Prospecting API, Campaigns API
      └── Roger  (8002) ← orchestre David + Emily + John en parallèle
```

## Stack technique

**Backend**
- Python 3.12, FastAPI, uvicorn
- OpenRouter — Claude Haiku 4.5 (réponses simples) / Claude Sonnet 4.6 (tâches complexes)
- ReportLab pour la génération PDF
- SQLite pour la persistance des conversations (David uniquement)
- httpx pour les appels API Flugia et les appels inter-agents (Roger)

**Frontend**
- Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- XHR (pas fetch) pour le streaming SSE en temps réel
- localStorage pour la persistance des conversations (Emily, John, Roger)
- useRef pour tous les callbacks XHR (évite les closures périmées)

## Routing modèle

Chaque agent route automatiquement entre deux modèles :

| Trigger | Modèle | Max tokens |
|---------|--------|-----------|
| Salutations simples ("bonjour", "merci", "ok") | Haiku 4.5 | 300-400 |
| Toute autre requête | Sonnet 4.6 | 1024-1500 |

## Sécurité des rapports PDF

John utilise des liens signés HMAC pour servir les PDFs :
- Chaque lien contient une expiration (`exp`) et une signature (`sig`)
- TTL : 1 heure
- L'endpoint `/reports/{file_name}` vérifie la signature avant de servir le fichier
- Variable d'environnement : `REPORT_SIGNING_SECRET` (généré aléatoirement si absent)

## Sanitizer contexte LLM

Tous les agents appliquent `sanitize_result()` avant d'injecter les résultats d'outils dans le contexte LLM :

- Champs binaires supprimés : `recording_url`, `audio`, `audio_base64`, `file_content`
- Strings tronquées à 2000 caractères
- Listes limitées à 15 items
- Total plafonné à 80 000 caractères

Évite les erreurs de dépassement de contexte (ex : transcriptions d'appels avec audio base64).

## Persistance des conversations

| Agent | Mécanisme | Clé |
|-------|-----------|-----|
| David | SQLite (`sessions.db`) | `conv_id` UUID |
| Emily | localStorage | `flugia_emily_conversations_v1` |
| John | localStorage | `flugia_conversations_sales_v1` |
| Roger | localStorage | `flugia_roger_conversations_v1` |

David compacte automatiquement l'historique au-delà de 6000 tokens (résumé LLM + garde les 4 derniers messages intacts).