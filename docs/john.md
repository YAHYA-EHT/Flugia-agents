# John — AI Sales Manager

John gère la **Prospection** et les **Campagnes** d'outreach B2B.

- **Port** : 8003
- **Fichier** : `Agents/John/john.py`
- **Client API** : `Agents/John/api_client.py`
- **System prompt** : `Agents/John/skills/john.md`

---

## Contextes disponibles

| Contexte | Route frontend | Outils |
|----------|---------------|--------|
| `john` | `/dashboard/sales` | Tous les outils Sales |
| `prospecting` | `/dashboard/sales/prospecting` | TOOLS_PROSPECTING |
| `campaigns` | `/dashboard/sales/campaigns` | TOOLS_CAMPAIGNS |

---

## Outils Prospecting

| Outil | Description | Confirmation |
|-------|-------------|-------------|
| `get_lead_lists()` | Liste toutes les listes de leads | Non |
| `get_lead_list_details(list_id)` | Leads d'une liste avec scores | Non |
| `get_leads(filtres?)` | Leads enrichis avec filtres | Non |
| `get_prospecting_status()` | Statut feature Prospecting | Non |
| `search_prospects(critères)` | Recherche Apollo (nouveaux prospects) | Non |
| `create_lead_list(name)` | Créer une liste vide | Non |
| `add_leads_to_list(list_id, person_ids)` | Ajouter des leads à une liste | Non |
| `import_leads(leads)` | Importer une liste fournie | **Oui — confirmer source** |
| `trigger_lead_enrichment(person_ids)` | Enrichissement approfondi | **Oui** |
| `generate_leads_report()` | PDF rapport leads | Non |

## Outils Campaigns

| Outil | Description | Confirmation |
|-------|-------------|-------------|
| `get_campaigns(status?)` | Liste les campagnes | Non |
| `get_campaign(campaign_id)` | Détail + stats campagne | Non |
| `get_campaign_statistics()` | Bilan global | Non |
| `create_campaign(name, mode, objective, offer, cta)` | Créer en **draft** | Non |
| `add_contacts_to_campaign(campaign_id, person_ids)` | Ajouter des contacts | Non |
| `update_campaign_status(campaign_id, "active")` | Activer — envoi réel | **Oui — mécanisme à 2 temps** |
| `update_campaign_status(campaign_id, "paused")` | Mettre en pause | Non |
| `check_campaign_replies(campaign_id)` | Scanner les réponses Gmail | Non |
| `get_contact_conversation(campaign_id, contact_id)` | Historique échange | Non |
| `reply_to_contact(campaign_id, contact_id, body)` | Répondre à un contact | **Oui — vrai email** |
| `generate_campaigns_report()` | PDF rapport campagnes | Non |

---

## Mécanisme de confirmation à 2 temps pour l'activation

L'activation d'une campagne envoie de vrais emails. Un simple "oui" dans le prompt ne suffit pas — un vrai aller-retour est forcé :

**Étape 1 — Premier appel (sans `confirm`)**
```python
update_campaign_status(campaign_id=42, status="active")
# → Retourne un aperçu de la campagne + confirmation_token
# → NE déclenche PAS l'envoi
```

**Étape 2 — Deuxième appel (après accord explicite du client)**
```python
update_campaign_status(
    campaign_id=42,
    status="active",
    confirm=True,
    confirmation_token="le_token_reçu_à_l_étape_1"
)
# → Déclenche l'envoi réel
```

Contraintes du token :
- TTL : 15 minutes
- Délai minimum entre les 2 appels : 2 secondes (force un vrai aller-retour)
- Usage unique — supprimé après consommation

---

## Liens PDF signés

John sert les PDFs via des liens HMAC signés (pas de StaticFiles ouvert) :

```
GET /reports/{file_name}?exp=1234567890&sig=abc123...
```

- `exp` : timestamp d'expiration (TTL 1h)
- `sig` : HMAC-SHA256 tronqué à 32 chars
- Traversée de répertoire bloquée (`..`, `/`, `\`)

Configurer `REPORT_SIGNING_SECRET` dans `.env` pour que les liens restent valides après redémarrage.

---

## Statuts des campagnes

| Statut | Description |
|--------|-------------|
| `draft` | Brouillon — jamais activé directement à la création |
| `active` | En cours d'envoi — activation déclenche les emails |
| `paused` | En pause — reprend à l'activation |
| `completed` | Terminée |
| `archived` | Archivée |

---

## search_prospects — filtres Apollo

```python
search_prospects(
    organization_industries=["SaaS", "Marketing"],
    person_titles=["CEO", "VP Sales"],
    person_locations=["France"],
    organization_num_employees_ranges=["11,50", "51,200"],
    q_keywords="growth hacking",
    per_page=10
)
```

---

## Règles critiques

- **Campagne en draft** : `create_campaign` crée toujours en brouillon — jamais actif immédiatement
- **Activation = 2 appels** : mécanisme technique forcé, pas juste une règle de prompt
- **reply_to_contact** : montrer le texte exact au client et attendre confirmation — c'est un vrai email au prospect
- **import_leads** : confirmer le nombre et la source avant d'importer
- **Multi-rapport email** : générer tous les PDFs d'abord, puis UN SEUL `send_email(file_names=[...])`
- **Sections** : `prospecting` et `campaigns` redirigent en 1 phrase si hors périmètre Sales

---

## Endpoints REST

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/chat` | Streaming SSE |
| `GET` | `/health` | `{"status":"ok","agent":"John","port":8003}` |
| `GET` | `/dashboard/sales` | Vue d'ensemble (listes + campagnes + stats) |
| `GET` | `/reports/{file_name}?exp=...&sig=...` | PDF signé |