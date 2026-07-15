"""
api_client.py — LinkedIn (David)
Même architecture que SEO/E-Reputation. APP_MODE=mock ou real.

Premier passage : outils de lecture seulement (settings, style guide, posts,
idées de contenu, analyses KPI). Les actions d'écriture (publier, planifier,
générer un post) seront ajoutées dans un second passage.
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

MODE     = os.getenv("APP_MODE", "mock")
BASE_URL = os.getenv("FLUGIA_API_BASE_URL", "https://api-dev.flugia.com")

# ── Token management avec auto-refresh ───────────────────────
_token = os.getenv("FLUGIA_API_TOKEN", "")
_email = os.getenv("FLUGIA_EMAIL", "")
_password = os.getenv("FLUGIA_PASSWORD", "")


def _get_headers() -> dict:
    return {
        "Authorization": f"Bearer {_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


async def _refresh_token() -> bool:
    """
    Renouvelle le token via POST /api/login.
    Retourne True si succès, False sinon.
    """
    global _token
    if not _email or not _password:
        print("[AUTH] FLUGIA_EMAIL ou FLUGIA_PASSWORD manquant dans .env — impossible de renouveler le token")
        return False
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{BASE_URL}/api/login",
                json={"email": _email, "password": _password},
                timeout=15
            )
            data = r.json()
            token = (
                data.get("access_token") or
                data.get("token") or
                (data.get("data") or {}).get("access_token") or
                (data.get("data") or {}).get("token")
            )
            if token:
                _token = token
                print("[AUTH] Token renouvelé avec succès")
                return True
            else:
                print(f"[AUTH] Echec du renouvellement : {data.get('message', 'erreur inconnue')} | full: {data}")
                return False
    except Exception as e:
        print(f"[AUTH] Erreur lors du renouvellement du token : {e}")
        return False


async def _get(path: str, params: dict = None) -> dict:
    """GET avec auto-refresh sur 401."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}{path}", headers=_get_headers(), params=params, timeout=30
        )
        if r.status_code == 401:
            print(f"[AUTH] Token expiré sur GET {path} — tentative de renouvellement...")
            refreshed = await _refresh_token()
            if refreshed:
                r = await client.get(
                    f"{BASE_URL}{path}", headers=_get_headers(), params=params, timeout=30
                )
            else:
                return {"success": False, "error": "Token expiré et renouvellement impossible — vérifie FLUGIA_EMAIL et FLUGIA_PASSWORD dans .env"}
        r.raise_for_status()
        return r.json()


async def _post(path: str, body: dict = None) -> dict:
    """POST avec auto-refresh sur 401."""
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{BASE_URL}{path}", headers=_get_headers(), json=body or {}, timeout=60
        )
        if r.status_code == 401:
            print(f"[AUTH] Token expiré sur POST {path} — tentative de renouvellement...")
            refreshed = await _refresh_token()
            if refreshed:
                r = await client.post(
                    f"{BASE_URL}{path}", headers=_get_headers(), json=body or {}, timeout=60
                )
            else:
                return {"success": False, "error": "Token expiré et renouvellement impossible — vérifie FLUGIA_EMAIL et FLUGIA_PASSWORD dans .env"}
        # 422 = erreur de validation (pas un vrai crash) — retourner la réponse
        if r.status_code in [400, 422, 429]:
            return r.json()
        r.raise_for_status()
        return r.json()


async def _patch(path: str, body: dict = None) -> dict:
    """PATCH avec auto-refresh sur 401."""
    async with httpx.AsyncClient() as client:
        r = await client.patch(
            f"{BASE_URL}{path}", headers=_get_headers(), json=body or {}, timeout=60
        )
        if r.status_code == 401:
            print(f"[AUTH] Token expiré sur PATCH {path} — tentative de renouvellement...")
            refreshed = await _refresh_token()
            if refreshed:
                r = await client.patch(
                    f"{BASE_URL}{path}", headers=_get_headers(), json=body or {}, timeout=60
                )
            else:
                return {"success": False, "error": "Token expiré et renouvellement impossible — vérifie FLUGIA_EMAIL et FLUGIA_PASSWORD dans .env"}
        if r.status_code in [400, 422, 429]:
            return r.json()
        r.raise_for_status()
        return r.json()


async def _delete(path: str) -> dict:
    """DELETE avec auto-refresh sur 401."""
    async with httpx.AsyncClient() as client:
        r = await client.delete(
            f"{BASE_URL}{path}", headers=_get_headers(), timeout=30
        )
        if r.status_code == 401:
            print(f"[AUTH] Token expiré sur DELETE {path} — tentative de renouvellement...")
            refreshed = await _refresh_token()
            if refreshed:
                r = await client.delete(
                    f"{BASE_URL}{path}", headers=_get_headers(), timeout=30
                )
            else:
                return {"success": False, "error": "Token expiré et renouvellement impossible — vérifie FLUGIA_EMAIL et FLUGIA_PASSWORD dans .env"}
        if r.status_code in [400, 422, 429]:
            return r.json()
        r.raise_for_status()
        return r.json()


# ── MOCK DATA ────────────────────────────────────────────────

MOCK_SETTINGS = {
    "page_name": "Flugia Demo",
    "linkedin_url": "https://linkedin.com/company/flugia-demo",
    "country": "FR",
    "language": "fr",
    "website_url": "https://flugia-demo.com",
    "style_preferences": "Ton direct, pas de jargon, phrases courtes",
}

MOCK_STYLE_GUIDE = {
    "tone": "Direct, professionnel mais accessible",
    "themes": ["Innovation produit", "Retours clients", "Coulisses de l'équipe"],
    "avoid": ["Jargon corporate excessif", "Emojis en excès"],
    "generated_at": "2026-06-15T10:00:00.000000Z",
}

MOCK_POSTS = [
    {
        "id": 12, "personalized_post": "Cette semaine on a lancé une fonctionnalité qui change la donne pour nos clients retail...",
        "status": "completed", "created_at": "2026-07-10T09:00:00.000000Z", "scheduled_at": None,
    },
    {
        "id": 11, "personalized_post": "3 leçons qu'on a apprises en scalant notre plateforme à 50 000 utilisateurs...",
        "status": "published", "created_at": "2026-07-05T09:00:00.000000Z", "scheduled_at": None,
    },
    {
        "id": 10, "personalized_post": "Pourquoi la majorité des projets IA échouent avant même de démarrer...",
        "status": "scheduled", "created_at": "2026-07-01T09:00:00.000000Z", "scheduled_at": "2026-07-20T08:00:00.000000Z",
    },
]

MOCK_CONTENT_SESSIONS = [
    {
        "session_id": "a1b2c3d4-0000-0000-0000-000000000001",
        "sector": "SaaS B2B", "created_at": "2026-07-08T14:00:00.000000Z",
        "ideas": [
            {"id": 101, "titre": "Le vrai coût d'un mauvais onboarding client", "hook_ouverture": "80% du churn se joue dans les 30 premiers jours..."},
            {"id": 102, "titre": "Comment on a réduit notre temps de réponse support de 40%", "hook_ouverture": "Un client qui attend est un client qui part..."},
        ],
    },
]

import uuid as _uuid
from datetime import datetime as _datetime


# ── FONCTIONS ─────────────────────────────────────────────────

async def get_linkedin_settings() -> dict:
    """Paramètres d'onboarding LinkedIn de la société (URL, pays, langue, préférences de style)."""
    if MODE == "mock":
        return {"success": True, "data": MOCK_SETTINGS}
    return await _get("/api/linkedin/settings")


async def get_style_guide() -> dict:
    """Guide de style d'écriture LinkedIn généré pour la société."""
    if MODE == "mock":
        return {"success": True, "data": MOCK_STYLE_GUIDE}
    return await _get("/api/linkedin/style-guide")


async def get_linkedin_posts() -> dict:
    """Liste tous les posts LinkedIn (générés, publiés, planifiés)."""
    if MODE == "mock":
        return {"success": True, "data": MOCK_POSTS}
    return await _get("/api/linkedin/posts")


async def get_linkedin_post(post_id: int) -> dict:
    """Détail d'un post LinkedIn spécifique."""
    if MODE == "mock":
        post = next((p for p in MOCK_POSTS if p["id"] == post_id), None)
        if not post:
            return {"success": False, "error": "Post introuvable"}
        return {"success": True, "data": post}
    return await _get(f"/api/linkedin/posts/{post_id}")


async def get_content_ideas() -> dict:
    """Liste toutes les sessions de scraping de contenu et leurs idées de posts."""
    if MODE == "mock":
        return {"success": True, "data": MOCK_CONTENT_SESSIONS}
    return await _get("/api/linkedin/content/ideas")


async def get_content_idea_session(session_id: str) -> dict:
    """Détail d'une session de scraping de contenu (idées générées)."""
    if MODE == "mock":
        session = next((s for s in MOCK_CONTENT_SESSIONS if s["session_id"] == session_id), None)
        if not session:
            return {"success": False, "error": "Session introuvable"}
        return {"success": True, "data": session}
    return await _get(f"/api/linkedin/content/ideas/{session_id}")


async def get_kpi_analyses() -> dict:
    """Liste tous les rapports d'analyse KPI LinkedIn déjà générés."""
    if MODE == "mock":
        return {"success": True, "data": [
            {"id": 3, "start_date": "2026-06-01", "end_date": "2026-06-30", "status": "completed"}
        ]}
    return await _get("/api/linkedin/analysis")


async def get_kpi_analysis(analysis_id: int) -> dict:
    """Détail d'un rapport d'analyse KPI LinkedIn (impressions, engagement, croissance)."""
    if MODE == "mock":
        return {"success": True, "data": {
            "id": analysis_id, "start_date": "2026-06-01", "end_date": "2026-06-30",
            "impressions": 24500, "engagement_rate": 4.2, "followers_gained": 87,
            "top_post_id": 11,
        }}
    return await _get(f"/api/linkedin/analysis/{analysis_id}")


# ── ACTIONS (écriture) ──────────────────────────────────────────

async def trigger_content_scrape(sector: str, number_of_posts: int, language: str,
                                  client_preferences: str = None) -> dict:
    """Lance une session de scraping de contenu LinkedIn pour trouver des idées de posts dans le secteur."""
    if MODE == "mock":
        session_id = str(_uuid.uuid4())
        return {"success": True, "data": {"session_id": session_id, "status": "processing"},
                "message": f"Scraping lancé pour le secteur '{sector}' — {number_of_posts} idées en préparation."}
    body = {"sector": sector, "number_of_posts": number_of_posts, "language": language}
    if client_preferences:
        body["client_preferences"] = client_preferences
    return await _post("/api/linkedin/content/scrape", body=body)


async def generate_posts_from_ideas(idea_ids: list) -> dict:
    """Génère des posts LinkedIn personnalisés à partir d'idées déjà scrapées."""
    if MODE == "mock":
        new_posts = []
        for iid in idea_ids:
            new_id = max([p["id"] for p in MOCK_POSTS], default=0) + 1
            post = {"id": new_id, "personalized_post": f"[Post généré à partir de l'idée #{iid}]",
                    "status": "completed", "created_at": _datetime.now().isoformat(), "scheduled_at": None}
            MOCK_POSTS.append(post)
            new_posts.append(post)
        return {"success": True, "data": new_posts,
                "message": f"{len(new_posts)} post(s) généré(s) à partir des idées sélectionnées."}
    return await _post("/api/linkedin/posts/generate", body={"idea_ids": idea_ids})


async def generate_manual_post(titre: str, description: str, language: str,
                                hook_ouverture: str = None, structure_suggeree: str = None,
                                cta: str = None, hashtags: str = None) -> dict:
    """Crée un post LinkedIn à partir d'un sujet fourni manuellement, sans passer par le scraper."""
    if MODE == "mock":
        new_id = max([p["id"] for p in MOCK_POSTS], default=0) + 1
        post = {"id": new_id, "personalized_post": f"{hook_ouverture or titre}\n\n{description}",
                "status": "completed", "created_at": _datetime.now().isoformat(), "scheduled_at": None}
        MOCK_POSTS.append(post)
        return {"success": True, "data": post, "message": f"Post '{titre}' généré."}
    body = {"titre": titre, "description": description, "language": language}
    if hook_ouverture: body["hook_ouverture"] = hook_ouverture
    if structure_suggeree: body["structure_suggeree"] = structure_suggeree
    if cta: body["cta"] = cta
    if hashtags: body["hashtags"] = hashtags
    return await _post("/api/linkedin/posts/generate-manual", body=body)


async def edit_linkedin_post(post_id: int, personalized_post: str = None,
                              generated_image_url: str = None) -> dict:
    """Modifie le contenu texte ou l'image d'un post LinkedIn existant."""
    if MODE == "mock":
        post = next((p for p in MOCK_POSTS if p["id"] == post_id), None)
        if not post:
            return {"success": False, "error": "Post introuvable"}
        if personalized_post:
            post["personalized_post"] = personalized_post
        return {"success": True, "data": post, "message": "Post mis à jour."}
    body = {}
    if personalized_post: body["personalized_post"] = personalized_post
    if generated_image_url: body["generated_image_url"] = generated_image_url
    return await _patch(f"/api/linkedin/posts/{post_id}", body=body)


async def regenerate_linkedin_post(post_id: int, feedback: str, previous_post: str) -> dict:
    """Régénère un post LinkedIn en tenant compte d'un retour du client."""
    if MODE == "mock":
        post = next((p for p in MOCK_POSTS if p["id"] == post_id), None)
        if not post:
            return {"success": False, "error": "Post introuvable"}
        post["personalized_post"] = f"[Régénéré suite au retour '{feedback}'] {previous_post[:80]}..."
        return {"success": True, "data": post, "message": "Post régénéré."}
    return await _post(f"/api/linkedin/posts/{post_id}/regenerate",
                       body={"feedback": feedback, "previous_post": previous_post})


async def publish_linkedin_post(post_id: int) -> dict:
    """Publie immédiatement un post LinkedIn complété. Action irréversible — confirmer avant d'appeler."""
    if MODE == "mock":
        post = next((p for p in MOCK_POSTS if p["id"] == post_id), None)
        if not post:
            return {"success": False, "error": "Post introuvable"}
        if post["status"] not in ("completed", "scheduled"):
            return {"success": False, "error": f"Le post est en statut '{post['status']}' — seuls les posts complétés ou planifiés peuvent être publiés."}
        post["status"] = "published"
        return {"success": True, "data": post, "message": "Post publié sur LinkedIn."}
    return await _post(f"/api/linkedin/posts/{post_id}/publish")


async def schedule_linkedin_post(post_id: int, scheduled_at: str) -> dict:
    """Planifie la publication future d'un post LinkedIn complété. Confirmer la date avant d'appeler."""
    if MODE == "mock":
        post = next((p for p in MOCK_POSTS if p["id"] == post_id), None)
        if not post:
            return {"success": False, "error": "Post introuvable"}
        if post["status"] != "completed":
            return {"success": False, "error": f"Le post est en statut '{post['status']}' — seuls les posts complétés peuvent être planifiés."}
        post["status"] = "scheduled"
        post["scheduled_at"] = scheduled_at
        return {"success": True, "data": post, "message": f"Post planifié pour le {scheduled_at}."}
    return await _post(f"/api/linkedin/posts/{post_id}/schedule", body={"scheduled_at": scheduled_at})


async def cancel_scheduled_post(post_id: int) -> dict:
    """Annule la planification d'un post LinkedIn — repasse en statut complété, non publié."""
    if MODE == "mock":
        post = next((p for p in MOCK_POSTS if p["id"] == post_id), None)
        if not post:
            return {"success": False, "error": "Post introuvable"}
        if post["status"] != "scheduled":
            return {"success": False, "error": "Ce post n'est pas planifié."}
        post["status"] = "completed"
        post["scheduled_at"] = None
        return {"success": True, "data": post, "message": "Planification annulée."}
    return await _delete(f"/api/linkedin/posts/{post_id}/schedule")