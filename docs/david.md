# David — AI Marketing Manager

David est l'agent Marketing de Flugia. Il couvre trois domaines : **E-Réputation**, **SEO Content** et **LinkedIn**.

- **Port** : 8000
- **Fichier** : `Agents/David/chat_server.py`
- **System prompt** : `Agents/David/skills/david.md`
- **Modèles** : Haiku 4.5 (salutations) / Sonnet 4.6 (tout le reste)

---

## Contextes disponibles

| Contexte | Route frontend | Description |
|----------|---------------|-------------|
| `david` | `/dashboard/marketing` | Chat principal — accès à tous les outils |
| `e_reputation` | `/dashboard/marketing/e-reputation` | Focus E-Réputation |
| `seo` | `/dashboard/marketing/seo` | Focus SEO Content |
| `linkedin` | `/dashboard/marketing/linkedin` | Focus LinkedIn |

Les sections peuvent rediriger vers Emily ou John mais ne génèrent pas de brief élaboré — 1 phrase + `handoff_to_agent` immédiat.

---

## Modules API

### E-Réputation (`mcp_servers/e_reputation/api_client.py`)

| Fonction | Endpoint | Description |
|----------|---------|-------------|
| `get_reviews()` | `GET /api/e-reputation/reviews` | Tous les avis avec filtres |
| `get_statistics()` | `GET /api/e-reputation/statistics` | Score global, répartition, tendances |
| `get_negative_reviews()` | `GET /api/e-reputation/negative-reviews` | Avis négatifs uniquement |
| `get_negative_analysis()` | `GET /api/e-reputation/negative-analysis` | Causes des avis négatifs |
| `get_negative_analysis_stats()` | `GET /api/e-reputation/negative-analysis/stats` | Statistiques négatives |
| `get_status()` | `GET /api/e-reputation/status` | État connexion Google Business |
| `get_notifications()` | `GET /api/e-reputation/notifications` | Notifications récentes |
| `get_notifications_activity()` | `GET /api/e-reputation/notifications/activity` | Historique activité |
| `mark_notification_read(id)` | `PATCH /api/e-reputation/notifications/{id}` | Marquer comme lue |

Auto-refresh token sur 401 — réauthentification via `POST /api/login`.

### SEO Content (`mcp_servers/seo/api_client.py`)

| Fonction | Endpoint | Description |
|----------|---------|-------------|
| `get_blog_posts(status?, limit?)` | `GET /api/content-seo/blog-posts` | Articles générés |
| `get_blog_post(post_id)` | `GET /api/content-seo/blog-posts/{id}` | Détail article + translations[] |
| `get_title_suggestions(status?)` | `GET /api/content-seo/title-suggestions` | Suggestions de titres |
| `get_seo_audits(limit?)` | `GET /api/content-seo/seo-audits` | Liste audits |
| `get_seo_audit(audit_id)` | `GET /api/content-seo/seo-audits/{id}` | Détail audit + PDF |
| `get_seo_audit_status(audit_id)` | `GET /api/content-seo/seo-audits/{id}/status` | Statut audit en cours |
| `get_seo_settings()` | `GET /api/content-seo/feature/settings` | Config SEO compte |
| `n8n_generate_blog_post(...)` | n8n webhook | Génère un article (async) |
| `n8n_generate_seo_audit(...)` | n8n webhook | Lance un audit (10-30 min) |
| `n8n_generate_title_suggestions(...)` | n8n webhook | Génère des suggestions |
| `n8n_regenerate_blog_post(post_id)` | n8n webhook | Relance un article failed |
| `publish_blog_post(post_id)` | `POST /api/content-seo/blog-posts/{id}/publish` | Publie sur WordPress |
| `unpublish_blog_post(post_id)` | `POST /api/content-seo/blog-posts/{id}/unpublish` | Dépublie |
| `update_blog_post(post_id, ...)` | `PUT /api/content-seo/blog-posts/{id}` | Modifie un article |
| `reject_title_suggestion(id)` | `DELETE /api/content-seo/title-suggestions/{id}` | Rejette une suggestion |

**Retry automatique** : `get_blog_post` fait 3 tentatives avec backoff (1.5s, 3s) sur erreur réseau.

### LinkedIn (`mcp_servers/linkedin/api_client.py`)

**Lecture**

| Fonction | Endpoint |
|----------|---------|
| `get_linkedin_settings()` | `GET /api/linkedin/settings` |
| `get_style_guide()` | `GET /api/linkedin/style-guide` |
| `get_linkedin_posts()` | `GET /api/linkedin/posts` |
| `get_linkedin_post(post_id)` | `GET /api/linkedin/posts/{id}` |
| `get_content_ideas()` | `GET /api/linkedin/content/ideas` |
| `get_content_idea_session(session_id)` | `GET /api/linkedin/content/ideas/{id}` |
| `get_kpi_analyses()` | `GET /api/linkedin/analysis` |
| `get_kpi_analysis(analysis_id)` | `GET /api/linkedin/analysis/{id}` |

**Actions**

| Fonction | Endpoint | Confirmation requise |
|----------|---------|---------------------|
| `trigger_content_scrape(sector, number_of_posts, language)` | `POST /api/linkedin/content/scrape` | Non |
| `generate_posts_from_ideas(idea_ids)` | `POST /api/linkedin/posts/generate` | Non |
| `generate_manual_post(titre, description, language, ...)` | `POST /api/linkedin/posts/generate-manual` | Non |
| `edit_linkedin_post(post_id, ...)` | `PATCH /api/linkedin/posts/{id}` | Non |
| `regenerate_linkedin_post(post_id, feedback, previous_post)` | `POST /api/linkedin/posts/{id}/regenerate` | Non |
| `publish_linkedin_post(post_id)` | `POST /api/linkedin/posts/{id}/publish` | **Oui — irréversible** |
| `schedule_linkedin_post(post_id, scheduled_at)` | `POST /api/linkedin/posts/{id}/schedule` | **Oui — texte + date** |
| `cancel_scheduled_post(post_id)` | `DELETE /api/linkedin/posts/{id}/schedule` | Non |

---

## Statuts des articles SEO

| Statut | Signification |
|--------|--------------|
| `draft` | Génération en cours via n8n |
| `completed` | Généré et publié sur le site (article_url disponible) |
| `failed` | Génération échouée — relançable via n8n_regenerate_blog_post |
| `published` | Publié via la plateforme Flugia |

---

## Règles critiques

- **Confirmation write obligatoire** : publication LinkedIn, publication article, dépublication → présenter d'abord, exécuter après confirmation explicite
- **Translations** : `get_blog_post()` retourne `translations[]` — toujours mentionner les langues disponibles
- **Région/langue** : demander avant tout audit ou génération de suggestions si non précisé
- **Vérification auto 90s** : après génération article ou suggestions, David vérifie une fois automatiquement avant de demander au client de revérifier
- **Comptage strict** : jamais d'approximation — le chiffre vient de l'outil
- **Email en 2 temps** : vérifier/demander l'adresse, confirmer, puis `send_email()`

---

## Endpoints REST

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/chat` | Streaming SSE — conversation principale |
| `GET` | `/health` | Statut de l'agent |
| `GET` | `/dashboard` | Vue d'ensemble E-Rep |
| `GET` | `/context/seo` | Contexte SEO proactif au démarrage |
| `GET` | `/conversations/{user_id}` | Liste des conversations |
| `GET` | `/conversations/{user_id}/{conv_id}/messages` | Messages d'une conversation |
| `DELETE` | `/conversations/{user_id}/{conv_id}` | Supprimer une conversation |
| `POST` | `/conversations/{user_id}/new` | Nouvelle conversation |
| `GET` | `/reports/{filename}` | Téléchargement PDF (StaticFiles) |

---

## Génération PDF

David génère des PDFs pour :
- Rapport E-Réputation (`rapport_e_reputation_{id}.pdf`)
- Rapport Marketing combiné (`rapport_marketing_complet_{id}.pdf`)
- Détail article SEO (`article_seo_{id}_{hash}.pdf`)
- Détail audit SEO (`audit_seo_{id}_{hash}.pdf`)
- Conversation / contenu libre (`document_{hash}.pdf`)

Tous les PDFs sont servis via `/reports/` (StaticFiles mount).