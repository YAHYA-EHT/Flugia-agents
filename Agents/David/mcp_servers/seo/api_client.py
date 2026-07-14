"""
api_client.py — SEO Content
Même architecture qu'E-Reputation. APP_MODE=mock ou real.
"""

import os
import httpx
import json
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
            # Le token peut être dans data["access_token"] ou data["data"]["access_token"]
            token = (
                data.get("access_token") or
                data.get("token") or
                (data.get("data") or {}).get("access_token") or
                (data.get("data") or {}).get("token")
            )
            if token:
                _token = token
                print(f"[AUTH] Token renouvelé avec succès")
                return True
            else:
                print(f"[AUTH] Echec du renouvellement : {data.get('message', 'erreur inconnue')} | full: {data}")
                return False
    except Exception as e:
        print(f"[AUTH] Erreur lors du renouvellement du token : {e}")
        return False


async def _get(path: str, params: dict = None) -> dict:
    """
    GET avec auto-refresh sur 401.
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}{path}",
            headers=_get_headers(),
            params=params,
            timeout=30
        )
        if r.status_code == 401:
            print(f"[AUTH] Token expiré sur GET {path} — tentative de renouvellement...")
            refreshed = await _refresh_token()
            if refreshed:
                r = await client.get(
                    f"{BASE_URL}{path}",
                    headers=_get_headers(),
                    params=params,
                    timeout=30
                )
            else:
                return {"success": False, "error": "Token expiré et renouvellement impossible — vérifie FLUGIA_EMAIL et FLUGIA_PASSWORD dans .env"}
        r.raise_for_status()
        return r.json()


async def _post(path: str, body: dict = None) -> dict:
    """
    POST avec auto-refresh sur 401.
    """
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{BASE_URL}{path}",
            headers=_get_headers(),
            json=body or {},
            timeout=60
        )
        if r.status_code == 401:
            print(f"[AUTH] Token expiré sur POST {path} — tentative de renouvellement...")
            refreshed = await _refresh_token()
            if refreshed:
                r = await client.post(
                    f"{BASE_URL}{path}",
                    headers=_get_headers(),
                    json=body or {},
                    timeout=60
                )
            else:
                return {"success": False, "error": "Token expiré et renouvellement impossible — vérifie FLUGIA_EMAIL et FLUGIA_PASSWORD dans .env"}
        # 422 = erreur de validation (pas un vrai crash) — retourner la réponse
        if r.status_code in [400, 422, 429]:
            return r.json()
        r.raise_for_status()
        return r.json()


async def _put(path: str, body: dict = None) -> dict:
    """
    PUT avec auto-refresh sur 401.
    """
    async with httpx.AsyncClient() as client:
        r = await client.put(
            f"{BASE_URL}{path}",
            headers=_get_headers(),
            json=body or {},
            timeout=30
        )
        if r.status_code == 401:
            print(f"[AUTH] Token expiré sur PUT {path} — tentative de renouvellement...")
            refreshed = await _refresh_token()
            if refreshed:
                r = await client.put(
                    f"{BASE_URL}{path}",
                    headers=_get_headers(),
                    json=body or {},
                    timeout=30
                )
            else:
                return {"success": False, "error": "Token expiré et renouvellement impossible"}
        r.raise_for_status()
        return r.json()

# ── MOCK DATA ────────────────────────────────────────────────

MOCK_BLOG_POSTS = [
    {
        "id": 80,
        "title": "Développer ses compétences en IA en 2026 : guide pratique B2B",
        "status": "completed",
        "slug": "competences-ia-2026-guide-b2b",
        "article_url": "https://elavi.com/competences-ia-2026-guide-b2b",
        "language": "fr",
        "keywords": ["compétences IA", "formation IA B2B", "AWS certification"],
        "description": "Guide pratique pour développer ses compétences IA dans un contexte B2B.",
        "objective": "Capter les décideurs en quête de montée en compétences IA.",
        "publish_date": "2026-05-14T09:37:10.000000Z",
        "created_at": "2026-05-14T09:00:00.000000Z",
        "updated_at": "2026-05-14T09:37:10.000000Z",
        "generation": {
            "id": 45, "status": "completed",
            "suggestions_number": 4, "target_region": "be"
        },
        "uploads": [
            {"type": "image", "meta": {
                "url": "https://ai-service-testing.s3.eu-west-1.amazonaws.com/company_136/content-seo/blog_80/aef0e170.webp"
            }}
        ]
    },
    {
        "id": 121,
        "title": "Newsletter B2B : comment fidéliser votre audience professionnelle en 2026",
        "status": "completed",
        "slug": "newsletter-b2b-fideliser-audience-professionnelle-2026",
        "article_url": "https://elavi.com/newsletter-b2b-fideliser-audience-professionnelle-2026",
        "language": "fr",
        "keywords": ["newsletter B2B", "emailing professionnel", "fidélisation audience entreprise"],
        "description": "Meilleures pratiques de segmentation et personnalisation pour newsletter B2B.",
        "objective": "Capter les responsables marketing B2B cherchant à optimiser leur emailing.",
        "publish_date": "2026-06-09T00:00:00.000000Z",
        "created_at": "2026-05-29T15:22:56.000000Z",
        "updated_at": "2026-06-04T10:26:32.000000Z",
        "generation": {
            "id": 43, "status": "completed",
            "suggestions_number": 4, "target_region": "be"
        },
        "uploads": []
    },
    {
        "id": 122,
        "title": "Vidéo courte en entreprise : maîtriser le format vertical pour votre communication B2B",
        "status": "completed",
        "slug": "video-courte-entreprise-format-vertical-b2b",
        "article_url": "https://elavi.com/video-courte-entreprise-format-vertical-b2b",
        "language": "fr",
        "keywords": ["vidéo courte entreprise", "format vertical B2B", "communication vidéo 2026"],
        "description": "Analyse du phénomène vidéo courte verticale et son adoption par les entreprises B2B.",
        "objective": "Attirer les responsables marketing cherchant à moderniser leur stratégie vidéo.",
        "publish_date": "2026-06-04T00:00:00.000000Z",
        "created_at": "2026-05-29T11:34:41.000000Z",
        "updated_at": "2026-06-05T09:29:54.000000Z",
        "generation": {
            "id": 42, "status": "completed",
            "suggestions_number": 3, "target_region": "be"
        },
        "uploads": []
    },
    {
        "id": 108,
        "title": "Storytelling de marque : construire un récit authentique qui engage votre audience",
        "status": "failed",
        "slug": None,
        "article_url": None,
        "language": "fr",
        "keywords": ["storytelling marque", "récit entreprise authentique", "narratif communication"],
        "description": "Méthodologie pratique pour construire un récit de marque cohérent et émotionnel.",
        "objective": "Attirer les dirigeants en quête d'une identité de marque distinctive.",
        "publish_date": "2026-06-18T00:00:00.000000Z",
        "created_at": "2026-05-29T15:22:56.000000Z",
        "updated_at": "2026-05-29T15:38:20.000000Z",
        "generation": {
            "id": 43, "status": "completed",
            "suggestions_number": 4, "target_region": "be"
        },
        "uploads": []
    },
]

MOCK_TITLE_SUGGESTIONS = [
    {
        "id": 104,
        "title": "GEO et AEO : adapter votre stratégie SEO aux moteurs de recherche génératifs",
        "keywords": ["SEO génératif", "GEO AEO référencement", "stratégie contenu IA"],
        "description": "Comment le SEO génératif et l'AEO transforment le référencement en 2026.",
        "objective": "Capter les décideurs digitaux confrontés à l'évolution des algorithmes.",
        "status": "suggested",
        "priority": 5,
        "publish_date": "2026-06-16T00:00:00.000000Z",
        "language": "fr",
        "generation": {"id": 42, "status": "completed", "target_region": "be"},
        "blog_post": None
    },
    {
        "id": 105,
        "title": "Cybersécurité et communication de crise : protéger votre entreprise face aux menaces 2026",
        "keywords": ["cybersécurité communication", "gestion crise cyber", "menaces entreprise 2026"],
        "description": "Cadre stratégique pour anticiper, communiquer et restaurer la confiance après un incident cyber.",
        "objective": "Positionner le site sur la thématique cybersécurité appliquée à la communication.",
        "status": "suggested",
        "priority": 6,
        "publish_date": "2026-06-26T00:00:00.000000Z",
        "language": "fr",
        "generation": {"id": 42, "status": "completed", "target_region": "be"},
        "blog_post": None
    },
    {
        "id": 107,
        "title": "Newsletter B2B : comment fidéliser votre audience professionnelle en 2026",
        "keywords": ["newsletter B2B", "emailing professionnel", "fidélisation audience entreprise"],
        "description": "Meilleures pratiques pour maximiser l'engagement de votre audience B2B.",
        "objective": "Capter les responsables marketing B2B cherchant à optimiser leur emailing.",
        "status": "used",
        "priority": 8,
        "publish_date": "2026-06-09T00:00:00.000000Z",
        "language": "fr",
        "generation": {"id": 43, "status": "completed", "target_region": "be"},
        "blog_post": {"id": 121, "status": "completed", "slug": "newsletter-b2b-fideliser-audience-professionnelle-2026"}
    },
]

MOCK_SEO_AUDITS = [
    {
        "id": 9,
        "status": "completed",
        "domain": "flyer.be",
        "region": "be",
        "language": "en",
        "se_ranking_site_id": 12544481,
        "period": {"start": "2026-06-02", "end": "2026-07-02"},
        "failed_message": None,
        "timestamps": {
            "started_at": "2026-07-02T14:10:14.000000Z",
            "se_ranking_completed_at": "2026-07-02T14:18:20.000000Z",
            "audit_started_at": "2026-07-02T16:09:25.000000Z",
            "audit_completed_at": "2026-07-02T16:39:46.000000Z",
            "created_at": "2026-07-02T14:10:14.000000Z"
        },
        "report": None,
        "report_pdf_url": "https://ai-service-testing.s3.eu-west-1.amazonaws.com/seo-audits/9/report.pdf"
    },
    {
        "id": 8,
        "status": "se_ranking_failed",
        "domain": "elavi.com",
        "region": "nl",
        "language": "fr",
        "se_ranking_site_id": 12534275,
        "period": {"start": "2026-06-01", "end": "2026-07-01"},
        "failed_message": None,
        "timestamps": {
            "started_at": "2026-07-01T09:56:54.000000Z",
            "se_ranking_completed_at": "2026-07-01T10:04:00.000000Z",
            "audit_started_at": "2026-07-01T15:58:53.000000Z",
            "audit_completed_at": "2026-07-01T16:29:13.000000Z",
            "created_at": "2026-07-01T09:56:54.000000Z"
        },
        "report_pdf_url": None
    },
]

MOCK_SETTINGS = {
    "website_url": "https://elavi.com",
    "sector": "Information et communication",
    "target_region": "be",
    "language": "fr",
    "brand": {
        "primary_color": "#61CE70",
        "secondary_color": "#002e5b",
        "font_heading": "Roboto",
        "font_body": "Kumbh Sans",
    },
    "feature": {"id": 2, "name": "Seo Content", "slug": "content-seo"},
    "se_ranking_site_id": 12544481
}

# ── GET FUNCTIONS ─────────────────────────────────────────────

async def get_blog_posts(status: str = None, limit: int = 20) -> dict:
    """Liste des articles SEO. Filtre optionnel par status."""
    if MODE == "mock":
        posts = MOCK_BLOG_POSTS
        if status:
            posts = [p for p in posts if p["status"] == status]
        return {
            "success": True,
            "data": posts[:limit],
            "meta": {
                "current_page": 1, "last_page": 2,
                "per_page": 20, "total": 22
            }
        }
    params = {}
    if status:
        params["status"] = status
    if limit:
        params["per_page"] = limit
    return await _get("/api/content-seo/blog-posts", params=params)


async def get_blog_post(post_id: int) -> dict:
    """Détail d'un article SEO par ID — avec retry sur erreur intermittente."""
    if MODE == "mock":
        post = next((p for p in MOCK_BLOG_POSTS if p["id"] == post_id), None)
        if not post:
            return {"success": False, "error": "Article introuvable"}
        return {"success": True, "data": post}
    # Retry 2 fois sur erreur réseau intermittente
    last_err = None
    for attempt in range(3):
        try:
            result = await _get(f"/api/content-seo/blog-posts/{post_id}")
            if result.get("success"):
                # Normaliser le champ translations si présent
                data = result.get("data", {})
                if isinstance(data, dict) and "translations" not in data:
                    data["translations"] = []
                return result
            # Erreur API — pas la peine de retry
            return result
        except Exception as e:
            last_err = e
            if attempt < 2:
                import asyncio
                await asyncio.sleep(1.5 * (attempt + 1))
    return {"success": False, "error": f"Erreur intermittente après 3 tentatives: {str(last_err)[:80]}"}


async def get_title_suggestions(status: str = None) -> dict:
    """Suggestions de titres générées par l'IA."""
    if MODE == "mock":
        suggestions = MOCK_TITLE_SUGGESTIONS
        if status:
            suggestions = [s for s in suggestions if s["status"] == status]
        return {
            "success": True,
            "data": suggestions,
            "meta": {"total": len(suggestions)}
        }
    params = {}
    if status:
        params["status"] = status
    return await _get("/api/content-seo/title-suggestions", params=params)


async def get_seo_audits(limit: int = 20) -> dict:
    """Liste des audits SEO."""
    if MODE == "mock":
        return {
            "success": True,
            "data": MOCK_SEO_AUDITS[:limit],
            "meta": {"total": len(MOCK_SEO_AUDITS)}
        }
    return await _get("/api/content-seo/seo-audit", params={"per_page": limit})


async def get_seo_audit(audit_id: int) -> dict:
    """Détail complet d'un audit SEO."""
    if MODE == "mock":
        audit = next((a for a in MOCK_SEO_AUDITS if a["id"] == audit_id), None)
        if not audit:
            return {"success": False, "error": "Audit introuvable"}
        return {"success": True, "data": audit}
    return await _get(f"/api/content-seo/seo-audit/{audit_id}")


async def get_seo_audit_status(audit_id: int) -> dict:
    """Statut d'un audit SEO en cours."""
    if MODE == "mock":
        audit = next((a for a in MOCK_SEO_AUDITS if a["id"] == audit_id), None)
        if not audit:
            return {"success": False, "error": "Audit introuvable"}
        return {"success": True, "data": {"id": audit_id, "status": audit["status"]}}
    return await _get(f"/api/content-seo/seo-audit/{audit_id}/status")


async def get_seo_settings() -> dict:
    """Configuration SEO du compte (site, secteur, langue, brand styles)."""
    if MODE == "mock":
        return {"success": True, "data": MOCK_SETTINGS}
    return await _get("/api/content-seo/feature/settings")


# ── WORKFLOWS N8N — commentés, activer après validation ──────

async def n8n_generate_blog_post(title: str, keywords: list, language: str = "fr", title_suggestion_id: int = None, target_region: str = "be") -> dict:
    """
    POST /api/content-seo/blog/generate
    Crée un article et déclenche le workflow de génération n8n.
    Body requis : title (str), keywords (list), language (str), target_region (str)
    Body optionnel : title_suggestion_id (int) — lie l'article à une suggestion existante
    Retourne immédiatement avec status=processing — le contenu arrive via webhook n8n.
    """
    if MODE == "mock":
        return {
            "success": True,
            "message": "Blog generation workflow triggered successfully",
            "data": {
                "id": 999, "status": "processing",
                "title": title, "keywords": keywords, "language": language,
                "target_region": target_region,
                "title_suggestion_id": title_suggestion_id,
                "slug": None, "article_url": None, "content": None,
                "created_at": "2026-07-03T12:00:00.000000Z"
            }
        }
    body = {
        "title": title,
        "keywords": keywords,
        "language": language,
        "target_region": target_region
    }
    if title_suggestion_id:
        body["title_suggestion_id"] = title_suggestion_id
    return await _post("/api/content-seo/blog/generate", body=body)


async def n8n_generate_title_suggestions(suggestions_number: int = 3, target_region: str = "be", language: str = "fr") -> dict:
    """
    POST /api/content-seo/title-suggestions/generate
    Déclenche la génération IA de nouvelles suggestions de titres.
    Body : { suggestions_number (requis), target_region, language }
    Retourne status=processing + generation.id — suggestions disponibles via get_title_suggestions() après quelques minutes.
    Shape réponse réelle : data.id, data.status, data.suggestions_number, data.target_region,
    data.website, data.domain, data.sector, data.title_suggestions (vide au départ)
    """
    if MODE == "mock":
        return {
            "success": True,
            "message": "Title suggestions generation triggered successfully",
            "data": {
                "id": 75, "status": "processing",
                "suggestions_number": suggestions_number,
                "target_region": target_region,
                "domain": "elavi.com",
                "title_suggestions": []
            }
        }
    return await _post("/api/content-seo/title-suggestions/generate", body={
        "suggestions_number": suggestions_number,
        "target_region": target_region,
        "language": language
    })


async def n8n_generate_seo_audit(domain: str, region: str = "be", language: str = "fr") -> dict:
    """
    POST /api/content-seo/seo-audit/generate
    Déclenche un nouvel audit SEO via SE Ranking + n8n.
    Limite : 1 audit par 30 jours par domaine.
    Si déjà généré récemment : retourne success=false + next_available_at.
    Workflow long (10-30 min) — nécessite Google Search Console connecté.
    """
    if MODE == "mock":
        return {
            "success": True,
            "message": "SEO audit generation triggered successfully",
            "data": {"id": 99, "status": "processing", "domain": domain, "region": region, "language": language}
        }
    return await _post("/api/content-seo/seo-audit/generate",
                        body={"domain": domain, "region": region, "language": language})


async def n8n_regenerate_blog_post(post_id: int, target_region: str = "be") -> dict:
    """
    POST /api/content-seo/regenerate
    Régénère un article existant dont le status est failed.
    Body : { blog_post_id: int, target_region: str }
    target_region est obligatoire pour le workflow n8n — défaut "be".
    Retourne status=processing — résultat asynchrone via n8n.
    """
    if MODE == "mock":
        return {
            "success": True,
            "message": "Blog post regeneration triggered successfully",
            "data": {"id": post_id, "status": "processing", "target_region": target_region,
                     "slug": None, "article_url": None}
        }
    return await _post("/api/content-seo/regenerate", body={
        "blog_post_id": post_id,
        "target_region": target_region
    })


# ── À DÉCOMMENTER APRÈS VALIDATION ────────────────────────────

async def publish_blog_post(post_id: int) -> dict:
    """Publie un article SEO sur WordPress."""
    if MODE == "mock":
        return {"success": True, "message": f"Article {post_id} publié (mock)"}
    return await _post(f"/api/content-seo/blog-posts/{post_id}/publish", {})

async def unpublish_blog_post(post_id: int) -> dict:
    """Dépublie un article SEO (remet en draft)."""
    if MODE == "mock":
        return {"success": True, "message": f"Article {post_id} dépublié (mock)"}
    return await _post(f"/api/content-seo/blog-posts/{post_id}/unpublish", {})
#     """
#     POST /api/content-seo/blog-posts/{id}/publish
#     Publie un article sur la plateforme liée.
#     ⚠️ Action irréversible — publier sur le site client.
#     """
#     async with httpx.AsyncClient() as client:
#         r = await client.post(
#             f"{BASE_URL}/api/content-seo/blog-posts/{post_id}/publish",
#             headers=HEADERS, timeout=30
#         )
#         r.raise_for_status()
#         return r.json()


async def update_blog_post(post_id: int, **kwargs) -> dict:
    """
    PUT /api/content-seo/blog-posts/{id}
    Modifie un article avant publication (titre, mots-clés, description, etc.)
    """
    if MODE == "mock":
        return {"success": True, "message": "Blog post updated successfully",
                "data": {"id": post_id, "status": "completed", **kwargs}}
    return await _put(f"/api/content-seo/blog-posts/{post_id}", body=kwargs)


async def reject_title_suggestion(suggestion_id: int) -> dict:
    """
    POST /api/content-seo/title-suggestions/{id}/reject
    Rejette une suggestion de titre — elle ne sera plus proposée.
    """
    if MODE == "mock":
        return {"success": True, "message": "Title suggestion rejected",
                "data": {"id": suggestion_id, "status": "rejected"}}
    return await _post(f"/api/content-seo/title-suggestions/{suggestion_id}/reject")