"""
api_client.py — Client HTTP pour l'API Flugia E-Reputation
Mode mock  : données simulées alignées sur le vrai schéma
Mode real  : appels réels vers api-dev.flugia.com
Bascule via APP_MODE dans .env
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

BASE_URL   = os.getenv("FLUGIA_API_BASE_URL", "https://api-dev.flugia.com")
TOKEN      = os.getenv("FLUGIA_API_TOKEN", "")
MODE       = os.getenv("APP_MODE", "mock")
COMPANY_ID = os.getenv("DEFAULT_COMPANY_ID", "1")

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept":        "application/json",
    "Content-Type":  "application/json",
}

# ─────────────────────────────────────────────────────────────
# WEBHOOKS N8N
# ⚠️  NE PAS ACTIVER AVANT VALIDATION — CONNECTÉS À LA PROD
# ─────────────────────────────────────────────────────────────

N8N_BASE = "https://flugia.app.n8n.cloud/webhook/app"

# N8N_GENERATE_REVIEW_RESPONSE = f"{N8N_BASE}/generate-review-response"
# → Génère une réponse IA pour un avis spécifique
# → Input  : { "review_id": int, "review_text": str, "author": str, "rating": int }
# → Output : { "response": str, "review_id": int }

# N8N_ANALYZE_REVIEWS = f"{N8N_BASE}/analyze-reviews"
# → Analyse l'ensemble des avis et retourne les insights
# → Input  : { "company_id": str } ou vide (utilise le compte connecté)
# → Output : { "insights": [...], "top_issues": [...], "recommendations": [...] }

# N8N_COLLECT_REVIEWS = f"{N8N_BASE}/collect-reviews"
# → Déclenche la collecte manuelle des avis depuis Google Business
# → Input  : { "company_id": str } ou vide
# → Output : { "collected": int, "new": int, "status": str }


# ─────────────────────────────────────────────────────────────
# ENDPOINTS POST — FLUGIA API
# ⚠️  NE PAS ACTIVER AVANT VALIDATION — CONNECTÉS À LA PROD
# ─────────────────────────────────────────────────────────────

# POST /api/e-reputation/ai-responses/retrigger
# → Relance la génération IA de réponses pour les avis sans réponse
# → Input  : {} ou { "review_ids": [int] } pour cibler des avis spécifiques
# → Output : { "triggered": int, "status": str }

# POST /api/e-reputation/bulk
# → Actions en masse sur les avis (marquer, archiver, changer statut)
# → Input  : { "review_ids": [int], "action": str, "payload": {} }
# → Output : { "updated": int, "status": str }

# POST /api/e-reputation/ai-responses/bulk
# → Génère des réponses IA en masse pour une liste d'avis
# → Input  : { "review_ids": [int] }
# → Output : { "generated": int, "responses": [...] }

# POST /api/e-reputation/{id}/ai-response/{responseId}/publish
# → Publie une réponse IA sur Google Business Profile
# → Input  : { "review_id": int, "response_id": int }
# → Output : { "published": bool, "platform_response": {} }

# POST /api/e-reputation/negative-analysis
# → Déclenche une nouvelle analyse des avis négatifs
# → Input  : {} ou { "force_refresh": bool }
# → Output : { "analysis_id": str, "status": str, "results": {} }

# POST /api/e-reputation/feature/start
# → Active la fonctionnalité E-Reputation pour un compte
# → Input  : { "company_id": str, "google_location_id": str }
# → Output : { "activated": bool, "status": str }

# POST /api/e-reputation/{id}/reply
# → Soumet une réponse rédigée par David dans le système Flugia (statut "draft")
# → La réponse apparaît dans E-Reputation → Reviews pour validation avant publication Google
# → Différent de publish_ai_response qui publie DIRECTEMENT sur Google sans validation
# → Input  : { "review_id": int, "response_text": str, "source": "david_ai" }
# → Output : { "response_id": int, "status": "draft", "review_id": int, "created_at": str }


# ─────────────────────────────────────────────────────────────
# DONNÉES MOCK — alignées sur le schéma réel Flugia / Laravel
# ─────────────────────────────────────────────────────────────
MOCK_REVIEWS = [
    {
        "id": 1,
        "company_id": 1,
        "platform": "google",
        "author": "Jean Martin",
        "rating": 2,
        "text": "Service décevant, délais non respectés. Aucun suivi après l'achat.",
        "date": "2026-06-15",
        "replied": False,
        "sentiment": "negative",
        "ai_response": None,
        "status": "pending"
    },
    {
        "id": 2,
        "company_id": 1,
        "platform": "google",
        "author": "Sarah Dupont",
        "rating": 5,
        "text": "Excellent service, équipe très réactive et professionnelle !",
        "date": "2026-06-14",
        "replied": True,
        "sentiment": "positive",
        "ai_response": "Merci Sarah pour ce retour !",
        "status": "published"
    },
    {
        "id": 3,
        "company_id": 1,
        "platform": "google",
        "author": "Marc Leblanc",
        "rating": 1,
        "text": "Produit reçu endommagé, impossible de joindre le SAV.",
        "date": "2026-06-12",
        "replied": False,
        "sentiment": "negative",
        "ai_response": None,
        "status": "pending"
    },
    {
        "id": 4,
        "company_id": 1,
        "platform": "trustpilot",
        "author": "Amina Benali",
        "rating": 4,
        "text": "Bonne expérience globale, livraison rapide.",
        "date": "2026-06-10",
        "replied": False,
        "sentiment": "positive",
        "ai_response": None,
        "status": "pending"
    },
    {
        "id": 5,
        "company_id": 1,
        "platform": "google",
        "author": "Pierre Moreau",
        "rating": 2,
        "text": "Prix trop élevé par rapport à la concurrence. Déçu.",
        "date": "2026-06-08",
        "replied": False,
        "sentiment": "negative",
        "ai_response": None,
        "status": "pending"
    },
]

MOCK_STATISTICS = {
    "global_score": 3.4,
    "total_reviews": 5,
    "positive_count": 2,
    "negative_count": 3,
    "neutral_count": 0,
    "replied_count": 1,
    "pending_replies": 4,
    "platforms": {
        "google": {"count": 4, "avg_rating": 3.0},
        "trustpilot": {"count": 1, "avg_rating": 4.0}
    },
    "trend": {
        "last_7_days": {"count": 3, "avg_rating": 2.7},
        "last_30_days": {"count": 5, "avg_rating": 3.4},
    }
}

MOCK_NEGATIVE_REVIEWS = [r for r in MOCK_REVIEWS if r["sentiment"] == "negative"]

MOCK_NEGATIVE_ANALYSIS = {
    "total_negative": 3,
    "top_issues": [
        {"issue": "Délais de livraison", "count": 1, "severity": "high"},
        {"issue": "Qualité produit",     "count": 1, "severity": "high"},
        {"issue": "Prix",                "count": 1, "severity": "medium"},
        {"issue": "SAV injoignable",     "count": 1, "severity": "high"},
    ],
    "sentiment_breakdown": {
        "very_negative": 2,
        "negative": 1,
    },
    "urgent_reviews": [r for r in MOCK_REVIEWS if r["rating"] == 1]
}

MOCK_NEGATIVE_STATS = {
    "negative_rate": 60.0,
    "avg_negative_rating": 1.67,
    "unresponded_negative": 3,
    "resolution_rate": 0.0,
    "trend": "worsening"
}

MOCK_STATUS = {
    "google_business_connected": True,
    "company_id": 1,
    "company_name": "WalidCompany",
    "last_sync": "2026-06-18T10:00:00Z",
    "sync_status": "ok",
    "locations": [
        {"id": "loc_001", "name": "WalidCompany - Paris", "connected": True}
    ]
}

MOCK_NOTIFICATIONS = [
    {
        "id": 1,
        "type": "new_negative_review",
        "message": "Nouvel avis négatif (1★) de Marc Leblanc",
        "review_id": 3,
        "read": False,
        "created_at": "2026-06-12T09:00:00Z"
    },
    {
        "id": 2,
        "type": "new_negative_review",
        "message": "Nouvel avis négatif (2★) de Pierre Moreau",
        "review_id": 5,
        "read": False,
        "created_at": "2026-06-08T14:30:00Z"
    },
    {
        "id": 3,
        "type": "reply_published",
        "message": "Réponse publiée pour Sarah Dupont",
        "review_id": 2,
        "read": True,
        "created_at": "2026-06-14T16:00:00Z"
    }
]

MOCK_NOTIFICATIONS_ACTIVITY = {
    "total": 3,
    "unread": 2,
    "activity": [
        {"date": "2026-06-18", "new_reviews": 1, "replies_sent": 0},
        {"date": "2026-06-15", "new_reviews": 1, "replies_sent": 1},
        {"date": "2026-06-12", "new_reviews": 1, "replies_sent": 0},
    ]
}

# ─────────────────────────────────────────────────────────────
# FONCTIONS D'ACCÈS — mode mock ou real selon APP_MODE
# ─────────────────────────────────────────────────────────────

async def get_reviews(
    platform: str = "all",
    rating: int = None,
    limit: int = 20,
    offset: int = 0
) -> dict:
    if MODE == "mock":
        reviews = MOCK_REVIEWS
        if platform != "all":
            reviews = [r for r in reviews if r["platform"] == platform]
        if rating is not None:
            reviews = [r for r in reviews if r["rating"] == rating]
        return {"data": reviews[:limit], "total": len(reviews)}

    params = {"limit": limit, "offset": offset}
    if platform != "all":
        params["platform"] = platform
    if rating:
        params["rating"] = rating

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/api/e-reputation",
                             headers=HEADERS, params=params, timeout=10)
        r.raise_for_status()
        return r.json()


async def get_statistics() -> dict:
    if MODE == "mock":
        return MOCK_STATISTICS

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/api/e-reputation/statistics",
                             headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()


async def get_negative_reviews() -> dict:
    if MODE == "mock":
        return {"data": MOCK_NEGATIVE_REVIEWS, "total": len(MOCK_NEGATIVE_REVIEWS)}

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/api/e-reputation/{COMPANY_ID}/negative",
                             headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()


async def get_negative_analysis() -> dict:
    if MODE == "mock":
        return MOCK_NEGATIVE_ANALYSIS

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/api/e-reputation/negative-analysis",
                             headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()


async def get_negative_analysis_stats() -> dict:
    if MODE == "mock":
        return MOCK_NEGATIVE_STATS

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/api/e-reputation/negative-analysis/stats",
                             headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()


async def get_status() -> dict:
    if MODE == "mock":
        return MOCK_STATUS

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/api/e-reputation/status",
                             headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()


async def get_notifications() -> dict:
    if MODE == "mock":
        return {"data": MOCK_NOTIFICATIONS, "unread": 2}

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/api/e-reputation/notifications",
                             headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()


async def get_notifications_activity() -> dict:
    if MODE == "mock":
        return MOCK_NOTIFICATIONS_ACTIVITY

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/api/e-reputation/notifications/activity",
                             headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()


async def mark_notification_read(notification_id: int) -> dict:
    """PATCH — marquer une notification comme lue"""
    if MODE == "mock":
        return {"success": True, "notification_id": notification_id, "status": "read"}

    async with httpx.AsyncClient() as client:
        r = await client.patch(
            f"{BASE_URL}/api/e-reputation/notifications/{notification_id}/read",
            headers=HEADERS, timeout=10
        )
        r.raise_for_status()
        return r.json()


# ─────────────────────────────────────────────────────────────
# FONCTIONS N8N — WEBHOOKS
# ⚠️  COMMENTÉES — NE PAS ACTIVER AVANT VALIDATION PROD
# ─────────────────────────────────────────────────────────────

# async def n8n_generate_review_response(
#     review_id: int,
#     review_text: str,
#     author: str,
#     rating: int
# ) -> dict:
#     """
#     Déclenche le workflow n8n de génération de réponse IA pour un avis.
#     Webhook : POST https://flugia.app.n8n.cloud/webhook/app/generate-review-response
#     """
#     async with httpx.AsyncClient() as client:
#         r = await client.post(
#             "https://flugia.app.n8n.cloud/webhook/app/generate-review-response",
#             headers=HEADERS,
#             json={
#                 "review_id": review_id,
#                 "review_text": review_text,
#                 "author": author,
#                 "rating": rating
#             },
#             timeout=30
#         )
#         r.raise_for_status()
#         return r.json()


# async def n8n_analyze_reviews(company_id: str = COMPANY_ID) -> dict:
#     """
#     Déclenche le workflow n8n d'analyse des avis.
#     Webhook : POST https://flugia.app.n8n.cloud/webhook/app/analyze-reviews
#     """
#     async with httpx.AsyncClient() as client:
#         r = await client.post(
#             "https://flugia.app.n8n.cloud/webhook/app/analyze-reviews",
#             headers=HEADERS,
#             json={"company_id": company_id},
#             timeout=30
#         )
#         r.raise_for_status()
#         return r.json()


# async def n8n_collect_reviews(company_id: str = COMPANY_ID) -> dict:
#     """
#     Déclenche la collecte manuelle des avis depuis Google Business via n8n.
#     Webhook : POST https://flugia.app.n8n.cloud/webhook/app/collect-reviews
#     """
#     async with httpx.AsyncClient() as client:
#         r = await client.post(
#             "https://flugia.app.n8n.cloud/webhook/app/collect-reviews",
#             headers=HEADERS,
#             json={"company_id": company_id},
#             timeout=30
#         )
#         r.raise_for_status()
#         return r.json()


# ─────────────────────────────────────────────────────────────
# FONCTIONS POST — FLUGIA API
# ⚠️  COMMENTÉES — NE PAS ACTIVER AVANT VALIDATION PROD
# ─────────────────────────────────────────────────────────────

# async def retrigger_ai_responses(review_ids: list = None) -> dict:
#     """
#     POST /api/e-reputation/ai-responses/retrigger
#     Relance la génération IA pour les avis sans réponse.
#     """
#     async with httpx.AsyncClient() as client:
#         body = {}
#         if review_ids:
#             body["review_ids"] = review_ids
#         r = await client.post(
#             f"{BASE_URL}/api/e-reputation/ai-responses/retrigger",
#             headers=HEADERS, json=body, timeout=30
#         )
#         r.raise_for_status()
#         return r.json()


# async def bulk_action_reviews(review_ids: list, action: str, payload: dict = None) -> dict:
#     """
#     POST /api/e-reputation/bulk
#     Actions en masse sur les avis (marquer, archiver, changer statut).
#     """
#     async with httpx.AsyncClient() as client:
#         r = await client.post(
#             f"{BASE_URL}/api/e-reputation/bulk",
#             headers=HEADERS,
#             json={"review_ids": review_ids, "action": action, "payload": payload or {}},
#             timeout=30
#         )
#         r.raise_for_status()
#         return r.json()


# async def bulk_generate_ai_responses(review_ids: list) -> dict:
#     """
#     POST /api/e-reputation/ai-responses/bulk
#     Génère des réponses IA en masse pour une liste d'avis.
#     """
#     async with httpx.AsyncClient() as client:
#         r = await client.post(
#             f"{BASE_URL}/api/e-reputation/ai-responses/bulk",
#             headers=HEADERS,
#             json={"review_ids": review_ids},
#             timeout=30
#         )
#         r.raise_for_status()
#         return r.json()


# async def publish_ai_response(review_id: int, response_id: int) -> dict:
#     """
#     POST /api/e-reputation/{id}/ai-response/{responseId}/publish
#     Publie une réponse IA sur Google Business Profile.
#     ⚠️  Action irréversible — publie directement sur Google.
#     """
#     async with httpx.AsyncClient() as client:
#         r = await client.post(
#             f"{BASE_URL}/api/e-reputation/{review_id}/ai-response/{response_id}/publish",
#             headers=HEADERS,
#             json={},
#             timeout=30
#         )
#         r.raise_for_status()
#         return r.json()


# async def trigger_negative_analysis(force_refresh: bool = False) -> dict:
#     """
#     POST /api/e-reputation/negative-analysis
#     Déclenche une nouvelle analyse des avis négatifs.
#     """
#     async with httpx.AsyncClient() as client:
#         r = await client.post(
#             f"{BASE_URL}/api/e-reputation/negative-analysis",
#             headers=HEADERS,
#             json={"force_refresh": force_refresh},
#             timeout=30
#         )
#         r.raise_for_status()
#         return r.json()


# async def start_feature(company_id: str, google_location_id: str) -> dict:
#     """
#     POST /api/e-reputation/feature/start
#     Active la fonctionnalité E-Reputation pour un compte.
#     ⚠️  Action d'activation — irréversible sans désactivation manuelle.
#     """
#     async with httpx.AsyncClient() as client:
#         r = await client.post(
#             f"{BASE_URL}/api/e-reputation/feature/start",
#             headers=HEADERS,
#             json={"company_id": company_id, "google_location_id": google_location_id},
#             timeout=30
#         )
#         r.raise_for_status()
#         return r.json()


# async def submit_reply(review_id: int, response_text: str) -> dict:
#     """
#     POST /api/e-reputation/{id}/reply
#     Soumet une réponse dans Flugia avec statut "draft" — attend validation avant publication Google.
#     Étape intermédiaire entre génération et publication.
#     ⚠️  À créer côté Laravel avant de décommenter.
#     """
#     if MODE == "mock":
#         return {
#             "response_id": 99,
#             "status": "draft",
#             "review_id": review_id,
#             "response_text": response_text,
#             "source": "david_ai",
#             "created_at": "2026-06-24T00:00:00Z"
#         }
#     async with httpx.AsyncClient() as client:
#         r = await client.post(
#             f"{BASE_URL}/api/e-reputation/{review_id}/reply",
#             headers=HEADERS,
#             json={"review_id": review_id, "response_text": response_text, "source": "david_ai"},
#             timeout=30
#         )
#         r.raise_for_status()
#         return r.json()