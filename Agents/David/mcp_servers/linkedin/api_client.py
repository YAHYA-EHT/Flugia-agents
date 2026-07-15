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