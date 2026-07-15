"""
John API Client — Flugia
Gère l'auth auto-refresh et tous les endpoints Sales (Prospecting + Campaigns).
Garde le mode mock (contrairement à EmilyApiClient) pour permettre les démos
et tests hors-ligne sans dépendre de l'API réelle.
"""
import os
import uuid
import httpx
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

API_BASE = os.getenv("FLUGIA_API_BASE_URL", "https://api-dev.flugia.com")
EMAIL    = os.getenv("FLUGIA_EMAIL")
PASSWORD = os.getenv("FLUGIA_PASSWORD")
MODE     = os.getenv("APP_MODE", "mock")


# ── Données mock ────────────────────────────────────────────────

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

MOCK_SEARCH_RESULTS = [
    {
        "person_id": "apollo_mock_001", "first_name": "Sophie", "last_name": "Martin",
        "title": "VP Sales", "company_name": "TechFlow SA", "industry": "SaaS",
        "location": "Lyon, France", "company_size": 85, "email_status": "verified",
    },
    {
        "person_id": "apollo_mock_002", "first_name": "Karim", "last_name": "Benali",
        "title": "Directeur Commercial", "company_name": "Atlas Digital", "industry": "Marketing",
        "location": "Casablanca, Maroc", "company_size": 40, "email_status": "verified",
    },
    {
        "person_id": "apollo_mock_003", "first_name": "Laura", "last_name": "Fontaine",
        "title": "Head of Growth", "company_name": "NovaCommerce", "industry": "E-commerce",
        "location": "Bruxelles, Belgique", "company_size": 120, "email_status": "verified",
    },
]


class JohnApiClient:
    def __init__(self):
        self._token: str | None = os.getenv("FLUGIA_API_TOKEN")
        self._client = httpx.AsyncClient(base_url=API_BASE, timeout=30)

    # ── Auth ──────────────────────────────────────────────────
    async def _refresh_token(self) -> str:
        r = await self._client.post("/api/login", json={"email": EMAIL, "password": PASSWORD})
        r.raise_for_status()
        data = r.json()
        self._token = data.get("data", {}).get("access_token") or data.get("access_token") or data.get("token")
        if not self._token:
            raise ValueError(f"Token introuvable dans la réponse login: {list(data.keys())}")
        return self._token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}

    async def _get(self, path: str, params: dict = None) -> dict:
        r = await self._client.get(path, headers=self._headers(), params=params)
        if r.status_code == 401:
            await self._refresh_token()
            r = await self._client.get(path, headers=self._headers(), params=params)
        return r.json()

    async def _post(self, path: str, body: dict = None) -> dict:
        r = await self._client.post(path, headers=self._headers(), json=body or {})
        if r.status_code == 401:
            await self._refresh_token()
            r = await self._client.post(path, headers=self._headers(), json=body or {})
        return r.json()

    async def _patch(self, path: str, body: dict = None) -> dict:
        r = await self._client.patch(path, headers=self._headers(), json=body or {})
        if r.status_code == 401:
            await self._refresh_token()
            r = await self._client.patch(path, headers=self._headers(), json=body or {})
        return r.json()

    # ════════════════════════════════════════════════════════
    # PROSPECTING (leads)
    # ════════════════════════════════════════════════════════

    async def get_lead_lists(self) -> dict:
        if MODE == "mock":
            return {"success": True, "total": len(MOCK_LEAD_LISTS), "data": MOCK_LEAD_LISTS}
        return await self._get("/api/prospecting/lists")

    async def get_lead_list_details(self, list_id: int) -> dict:
        if MODE == "mock":
            lst = next((l for l in MOCK_LEAD_LISTS if l["id"] == list_id), None)
            if not lst:
                return {"success": False, "error": "Liste introuvable"}
            return {"success": True, "data": {**lst, "leads": MOCK_LEADS}}
        return await self._get(f"/api/prospecting/lists/{list_id}")

    async def get_leads(self, search: str = None, industry: str = None, min_score: float = None,
                         sort_by: str = None, sort_dir: str = None, per_page: int = 20) -> dict:
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
        if search: params["search"] = search
        if industry: params["industry"] = industry
        if min_score is not None: params["min_score"] = min_score
        if sort_by: params["sort_by"] = sort_by
        if sort_dir: params["sort_dir"] = sort_dir
        return await self._get("/api/prospecting/leads", params=params)

    async def get_prospecting_status(self) -> dict:
        if MODE == "mock":
            return {"success": True, "data": {
                "feature_name": "Prospecting", "status": "done", "is_done": True, "is_active": True
            }}
        return await self._get("/api/prospecting/status")

    async def trigger_lead_enrichment(self, person_ids: list) -> dict:
        if MODE == "mock":
            return {
                "success": True,
                "message": f"Enrichissement lancé pour {len(person_ids)} lead(s).",
                "data": {"person_ids": person_ids, "status": "processing"}
            }
        return await self._post("/api/prospecting/deep-enrichment", body={"person_ids": person_ids})

    # ════════════════════════════════════════════════════════
    # CAMPAIGNS
    # ════════════════════════════════════════════════════════

    async def get_campaigns(self, status: str = None, per_page: int = 15) -> dict:
        if MODE == "mock":
            camps = MOCK_CAMPAIGNS
            if status:
                camps = [c for c in camps if c["status"] == status]
            return {"success": True, "data": camps[:per_page]}
        params = {"per_page": per_page}
        if status: params["status"] = status
        return await self._get("/api/campaigns", params=params)

    async def get_campaign(self, campaign_id: int) -> dict:
        if MODE == "mock":
            camp = next((c for c in MOCK_CAMPAIGNS if c["id"] == campaign_id), None)
            if not camp:
                return {"success": False, "error": "Campagne introuvable"}
            return {"success": True, "data": camp}
        return await self._get(f"/api/campaigns/{campaign_id}")

    async def get_campaign_statistics(self) -> dict:
        if MODE == "mock":
            return {"success": True, "data": MOCK_CAMPAIGN_STATS}
        return await self._get("/api/campaigns/statistics")

    async def update_campaign_status(self, campaign_id: int, status: str) -> dict:
        if MODE == "mock":
            camp = next((c for c in MOCK_CAMPAIGNS if c["id"] == campaign_id), None)
            if not camp:
                return {"success": False, "error": "Campagne introuvable"}
            camp["status"] = status
            return {
                "success": True,
                "message": f"Campagne '{camp['name']}' mise à jour : {status}.",
                "data": {"campaign": camp, "send": {"sent_count": 3, "skipped_count": 0, "error_count": 0} if status == "active" else None}
            }
        return await self._patch(f"/api/campaigns/{campaign_id}/status", body={"status": status})

    # ════════════════════════════════════════════════════════
    # PROSPECTING — recherche, listes, import (nouveaux)
    # ════════════════════════════════════════════════════════

    async def search_prospects(self, organization_industries: list = None, person_titles: list = None,
                                person_locations: list = None, organization_locations: list = None,
                                organization_num_employees_ranges: list = None, q_keywords: str = None,
                                per_page: int = 10) -> dict:
        if MODE == "mock":
            return {"success": True, "data": MOCK_SEARCH_RESULTS[:per_page]}
        body = {"per_page": per_page}
        if organization_industries: body["organization_industries"] = organization_industries
        if person_titles: body["person_titles"] = person_titles
        if person_locations: body["person_locations"] = person_locations
        if organization_locations: body["organization_locations"] = organization_locations
        if organization_num_employees_ranges: body["organization_num_employees_ranges"] = organization_num_employees_ranges
        if q_keywords: body["q_keywords"] = q_keywords
        return await self._post("/api/prospecting/people-search", body=body)

    async def create_lead_list(self, name: str) -> dict:
        if MODE == "mock":
            new_id = max([l["id"] for l in MOCK_LEAD_LISTS], default=0) + 1
            new_list = {"id": new_id, "name": name, "leads_count": 0,
                        "created_at": datetime.now().isoformat()}
            MOCK_LEAD_LISTS.append(new_list)
            return {"success": True, "data": new_list}
        return await self._post("/api/prospecting/lists", body={"name": name})

    async def add_leads_to_list(self, list_id: int, person_ids: list) -> dict:
        if MODE == "mock":
            lst = next((l for l in MOCK_LEAD_LISTS if l["id"] == list_id), None)
            if not lst:
                return {"success": False, "error": "Liste introuvable"}
            lst["leads_count"] = lst.get("leads_count", 0) + len(person_ids)
            return {"success": True, "message": f"{len(person_ids)} lead(s) ajouté(s) à '{lst['name']}'."}
        return await self._post(f"/api/prospecting/lists/{list_id}/leads", body={"person_ids": person_ids})

    async def import_leads(self, leads: list) -> dict:
        if MODE == "mock":
            return {"success": True, "data": {"imported": len(leads), "updated": 0, "skipped": []}}
        return await self._post("/api/prospecting/leads/import", body={"leads": leads})

    # ════════════════════════════════════════════════════════
    # CAMPAIGNS — création, contacts, conversations (nouveaux)
    # ════════════════════════════════════════════════════════

    async def create_campaign(self, name: str, mode: str, objective: str, offer: str, cta: str,
                               tone: str = None, language: str = None) -> dict:
        if MODE == "mock":
            new_id = max([c["id"] for c in MOCK_CAMPAIGNS], default=0) + 1
            new_camp = {
                "id": new_id, "name": name, "mode": mode, "status": "draft",
                "sender_mailbox_mode": "single", "sequence_mode": "hyper_personalized",
                "created_at": datetime.now().isoformat(),
                "statistics": {"total_contacts": 0, "total_emails_sent": 0},
            }
            MOCK_CAMPAIGNS.append(new_camp)
            return {"success": True, "data": new_camp,
                    "message": f"Campagne '{name}' créée en brouillon (draft)."}
        strategy = {"objective": objective, "offer": offer, "cta": cta}
        if tone: strategy["tone"] = tone
        if language: strategy["language"] = language
        return await self._post("/api/campaigns", body={"name": name, "mode": mode, "strategy": strategy})

    async def add_contacts_to_campaign(self, campaign_id: int, person_ids: list) -> dict:
        if MODE == "mock":
            camp = next((c for c in MOCK_CAMPAIGNS if c["id"] == campaign_id), None)
            if not camp:
                return {"success": False, "error": "Campagne introuvable"}
            camp["statistics"]["total_contacts"] = camp["statistics"].get("total_contacts", 0) + len(person_ids)
            return {"success": True, "message": f"{len(person_ids)} contact(s) ajouté(s) à '{camp['name']}'."}
        return await self._post(f"/api/campaigns/{campaign_id}/contacts/from-leads", body={"person_ids": person_ids})

    async def check_campaign_replies(self, campaign_id: int) -> dict:
        if MODE == "mock":
            camp = next((c for c in MOCK_CAMPAIGNS if c["id"] == campaign_id), None)
            if not camp:
                return {"success": False, "error": "Campagne introuvable"}
            return {"success": True, "data": {
                "mailbox": "sales@flugia.com", "checked_count": 5, "replied_count": 1, "error_count": 0
            }}
        return await self._post(f"/api/campaigns/{campaign_id}/check-replies")

    async def get_contact_conversation(self, campaign_id: int, contact_id: int) -> dict:
        if MODE == "mock":
            return {"success": True, "data": {
                "mailbox": "sales@flugia.com",
                "contact": {"id": contact_id, "name": "Alexis Descampe", "email": "alexis@farmstore.be",
                           "sequence_status": "replied"},
                "messages": [
                    {"direction": "outbound", "author": "John", "text": "Bonjour Alexis, ...",
                     "sent_at": datetime.now().isoformat()},
                    {"direction": "inbound", "author": "Alexis Descampe", "text": "Merci, ça m'intéresse !",
                     "sent_at": datetime.now().isoformat()},
                ],
            }}
        return await self._get(f"/api/campaigns/{campaign_id}/contacts/{contact_id}/conversation")

    async def reply_to_contact(self, campaign_id: int, contact_id: int, body: str) -> dict:
        if MODE == "mock":
            return {"success": True, "message": "Réponse envoyée (mock).",
                    "data": {"to": "contact@example.com", "sent_at": datetime.now().isoformat()}}
        return await self._post(f"/api/campaigns/{campaign_id}/contacts/{contact_id}/reply", body={"body": body})