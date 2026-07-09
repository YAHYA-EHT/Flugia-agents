"""
api_client.py — Sales (Prospecting + Campaigns)
Même architecture que SEO/E-Reputation. APP_MODE=mock ou real.

Endpoints réels utilisés (voir /api/documentation) :
  - GET  /api/prospecting/lists                — listes de leads
  - GET  /api/prospecting/lists/{id}            — détail d'une liste + leads
  - GET  /api/prospecting/leads                 — tous les leads enrichis de la société
  - GET  /api/prospecting/status                — statut de la feature Prospecting
  - GET  /api/campaigns                         — campagnes d'outreach
  - GET  /api/campaigns/{id}                    — détail d'une campagne + contacts
  - GET  /api/campaigns/statistics              — stats agrégées des campagnes
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

MODE     = os.getenv("APP_MODE", "mock")
BASE_URL = os.getenv("FLUGIA_API_BASE_URL", "https://api-dev.flugia.com")

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
    """Renouvelle le token via POST /api/login. Retourne True si succès."""
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
            print(f"[AUTH] Echec du renouvellement : {data.get('message', 'erreur inconnue')}")
            return False
    except Exception as e:
        print(f"[AUTH] Erreur lors du renouvellement du token : {e}")
        return False


async def _get(path: str, params: dict = None) -> dict:
    """GET avec auto-refresh sur 401."""
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}{path}", headers=_get_headers(), params=params, timeout=30)
        if r.status_code == 401:
            print(f"[AUTH] Token expiré sur GET {path} — tentative de renouvellement...")
            if await _refresh_token():
                r = await client.get(f"{BASE_URL}{path}", headers=_get_headers(), params=params, timeout=30)
            else:
                return {"success": False, "error": "Token expiré et renouvellement impossible — vérifie FLUGIA_EMAIL et FLUGIA_PASSWORD dans .env"}
        r.raise_for_status()
        return r.json()


# ── MOCK DATA ────────────────────────────────────────────────

MOCK_LEAD_LISTS = [
    {"id": 3, "name": "Hot prospects Q3", "leads_count": 24, "created_at": "2026-06-18T09:00:00.000000Z"},
    {"id": 4, "name": "SaaS decision makers - Benelux", "leads_count": 41, "created_at": "2026-06-25T14:30:00.000000Z"},
    {"id": 5, "name": "Webinar attendees - juin 2026", "leads_count": 12, "created_at": "2026-07-01T10:15:00.000000Z"},
]

MOCK_LEADS = [
    {
        "person_id": "6007c1e1fd5dd20001794882", "first_name": "Alexis", "last_name": "Descampe",
        "email": "alexis@farmstore.be", "email_status": "Safe to Send", "company_name": "färm.coop",
        "title": "CEO and Co-founder", "industry": "retail", "location": "Belgium, Brussels",
        "company_size": 51, "source": "workflow",
    },
    {
        "person_id": "5f1b2c3d4e5f6a7b8c9d0e1f", "first_name": "Marie", "last_name": "Dupont",
        "email": "marie@acme.com", "email_status": "Safe to Send", "company_name": "Acme Corp",
        "title": "VP Marketing", "industry": "SaaS", "location": "France, Paris",
        "company_size": 120, "source": "csv_import",
    },
    {
        "person_id": "66fc3c54e7579f00017e6074", "first_name": "Javier", "last_name": "Garcia",
        "email": "javier@walmart.com", "email_status": "Safe to Send", "company_name": "Walmart",
        "title": "VP Operations", "industry": "retail", "location": "United States",
        "company_size": 10000, "source": "workflow",
    },
]

MOCK_CAMPAIGNS = [
    {
        "id": 42, "name": "Outreach SaaS Benelux Q3", "mode": "review", "status": "active",
        "sender_mailbox_mode": "single", "sequence_mode": "hyper_personalized",
        "created_at": "2026-06-20T08:00:00.000000Z",
        "statistics": {"total_contacts": 41, "total_emails_sent": 63},
    },
    {
        "id": 41, "name": "Relance webinaire juin", "mode": "auto", "status": "completed",
        "sender_mailbox_mode": "single", "sequence_mode": "standard",
        "created_at": "2026-06-05T08:00:00.000000Z",
        "statistics": {"total_contacts": 12, "total_emails_sent": 24},
    },
    {
        "id": 40, "name": "Cold outreach retail FR", "mode": "review", "status": "paused",
        "sender_mailbox_mode": "round_robin", "sequence_mode": "hyper_personalized",
        "created_at": "2026-05-15T08:00:00.000000Z",
        "statistics": {"total_contacts": 30, "total_emails_sent": 30},
    },
]

MOCK_CAMPAIGN_STATS = {
    "total_campaigns": 3,
    "total_active_campaigns": 1,
    "total_contacts": 83,
    "total_emails_sent": 117,
    "total_replies": 9,
}


# ── FONCTIONS ─────────────────────────────────────────────────

async def get_lead_lists() -> dict:
    """Liste toutes les listes de leads de la société."""
    if MODE == "mock":
        return {"success": True, "total": len(MOCK_LEAD_LISTS), "data": MOCK_LEAD_LISTS}
    return await _get("/api/prospecting/lists")


async def get_lead_list_details(list_id: int) -> dict:
    """Détail d'une liste de leads avec ses leads."""
    if MODE == "mock":
        lst = next((l for l in MOCK_LEAD_LISTS if l["id"] == list_id), None)
        if not lst:
            return {"success": False, "error": "Liste introuvable"}
        return {"success": True, "data": {**lst, "leads": MOCK_LEADS}}
    return await _get(f"/api/prospecting/lists/{list_id}")


async def get_leads(search: str = None, industry: str = None, min_score: float = None,
                     sort_by: str = None, sort_dir: str = None, per_page: int = 20) -> dict:
    """Tous les leads enrichis de la société, avec filtres optionnels."""
    if MODE == "mock":
        leads = MOCK_LEADS
        if search:
            s = search.lower()
            leads = [l for l in leads if s in l["company_name"].lower() or s in l["email"].lower()
                     or s in l["first_name"].lower() or s in l["last_name"].lower()]
        if industry:
            leads = [l for l in leads if industry.lower() in l["industry"].lower()]
        return {"success": True, "data": leads[:per_page], "meta": {"total": len(leads), "current_page": 1, "per_page": per_page}}
    params = {"per_page": per_page}
    if search:
        params["search"] = search
    if industry:
        params["industry"] = industry
    if min_score is not None:
        params["min_score"] = min_score
    if sort_by:
        params["sort_by"] = sort_by
    if sort_dir:
        params["sort_dir"] = sort_dir
    return await _get("/api/prospecting/leads", params=params)


async def get_prospecting_status() -> dict:
    """Statut de la feature Prospecting pour la société (active, en attente, etc.)."""
    if MODE == "mock":
        return {"success": True, "data": {
            "feature_name": "Prospecting", "status": "done", "is_done": True, "is_active": True
        }}
    return await _get("/api/prospecting/status")


async def get_campaigns(status: str = None, per_page: int = 15) -> dict:
    """Liste les campagnes d'outreach. Filtre optionnel par statut (draft/active/paused/completed/archived)."""
    if MODE == "mock":
        camps = MOCK_CAMPAIGNS
        if status:
            camps = [c for c in camps if c["status"] == status]
        return {"success": True, "data": camps[:per_page]}
    params = {"per_page": per_page}
    if status:
        params["status"] = status
    return await _get("/api/campaigns", params=params)


async def get_campaign(campaign_id: int) -> dict:
    """Détail d'une campagne avec ses contacts et statistiques."""
    if MODE == "mock":
        camp = next((c for c in MOCK_CAMPAIGNS if c["id"] == campaign_id), None)
        if not camp:
            return {"success": False, "error": "Campagne introuvable"}
        return {"success": True, "data": camp}
    return await _get(f"/api/campaigns/{campaign_id}")


async def get_campaign_statistics() -> dict:
    """Statistiques agrégées de toutes les campagnes (total, actives, contacts, emails envoyés, réponses)."""
    if MODE == "mock":
        return {"success": True, "data": MOCK_CAMPAIGN_STATS}
    return await _get("/api/campaigns/statistics")