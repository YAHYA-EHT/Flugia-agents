"""
Emily API Client — Flugia
Gère l'auth auto-refresh et tous les endpoints Support (Chatbot + Agent Call).
"""
import os
import httpx
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

API_BASE   = os.getenv("FLUGIA_API_BASE_URL", "https://api-dev.flugia.com")
EMAIL      = os.getenv("FLUGIA_EMAIL")
PASSWORD   = os.getenv("FLUGIA_PASSWORD")
MODE       = os.getenv("APP_MODE", "mock")

class EmilyApiClient:
    def __init__(self):
        self._token: str | None = os.getenv("FLUGIA_API_TOKEN")
        self._client = httpx.AsyncClient(base_url=API_BASE, timeout=30)

    # ── Auth ──────────────────────────────────────────────────
    async def _refresh_token(self) -> str:
        r = await self._client.post("/api/login", json={"email": EMAIL, "password": PASSWORD})
        r.raise_for_status()
        self._token = r.json()["token"]
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

    async def _put(self, path: str, body: dict = None) -> dict:
        r = await self._client.put(path, headers=self._headers(), json=body or {})
        if r.status_code == 401:
            await self._refresh_token()
            r = await self._client.put(path, headers=self._headers(), json=body or {})
        return r.json()

    async def _patch(self, path: str, body: dict = None) -> dict:
        r = await self._client.patch(path, headers=self._headers(), json=body or {})
        if r.status_code == 401:
            await self._refresh_token()
            r = await self._client.patch(path, headers=self._headers(), json=body or {})
        return r.json()

    async def _delete(self, path: str) -> dict:
        r = await self._client.delete(path, headers=self._headers())
        if r.status_code == 401:
            await self._refresh_token()
            r = await self._client.delete(path, headers=self._headers())
        return r.json()

    # ════════════════════════════════════════════════════════
    # CHATBOT
    # ════════════════════════════════════════════════════════

    async def get_chatbots(self) -> dict:
        return await self._get("/api/chatbots")

    async def get_chatbot(self, id: int) -> dict:
        return await self._get(f"/api/chatbots/{id}")

    async def create_chatbot(self, data: dict) -> dict:
        return await self._post("/api/chatbots", data)

    async def update_chatbot(self, id: int, data: dict) -> dict:
        return await self._put(f"/api/chatbots/{id}", data)

    async def delete_chatbot(self, id: int) -> dict:
        return await self._delete(f"/api/chatbots/{id}")

    async def get_chatbot_files(self, id: int) -> dict:
        return await self._get(f"/api/chatbots/{id}/files")

    async def add_chatbot_file(self, id: int, data: dict) -> dict:
        return await self._post(f"/api/chatbots/{id}/files/add", data)

    async def delete_chatbot_files(self, id: int) -> dict:
        return await self._delete(f"/api/chatbots/{id}/files")

    async def get_chatbot_script(self, id: int) -> dict:
        return await self._get(f"/api/chatbots/{id}/script")

    async def get_chatbot_statistics(self, id: int) -> dict:
        return await self._get(f"/api/chatbots/{id}/statistics")

    async def get_chatbot_history(self, public_token: str) -> dict:
        return await self._get(f"/api/chatbots/{public_token}/history")

    async def retry_chatbot(self, id: int) -> dict:
        return await self._post(f"/api/chatbots/{id}/retry")

    async def retry_chatbot_scraping(self, id: int) -> dict:
        return await self._post(f"/api/chatbots/{id}/retry-website-scraping")

    async def start_chatbot_feature(self, data: dict) -> dict:
        return await self._post("/api/chatbot/feature/start", data)

    async def update_workflow_settings(self, data: dict) -> dict:
        return await self._put("/api/chatbot/workflow-settings", data)

    async def get_chatbot_notifications(self) -> dict:
        return await self._get("/api/chatbots/notifications")

    async def get_chatbot_notifications_activity(self) -> dict:
        return await self._get("/api/chatbots/notifications/activity")

    async def mark_chatbot_notification_read(self, id: int) -> dict:
        return await self._patch(f"/api/chatbots/notifications/{id}/read")

    # ════════════════════════════════════════════════════════
    # AGENT CALL
    # ════════════════════════════════════════════════════════

    async def get_agents(self) -> dict:
        return await self._get("/api/agents")

    async def get_agent(self, id: int) -> dict:
        return await self._get(f"/api/agents/{id}")

    async def update_agent(self, id: int, data: dict) -> dict:
        return await self._put(f"/api/agents/{id}", data)

    async def delete_agent(self, id: int) -> dict:
        return await self._delete(f"/api/agents/{id}")

    async def create_inbound_agent(self, data: dict) -> dict:
        return await self._post("/api/agents/inbound", data)

    async def create_outbound_agent(self, data: dict) -> dict:
        return await self._post("/api/agents/outbound", data)

    async def update_agent_customer_number(self, id: int, data: dict) -> dict:
        return await self._patch(f"/api/agents/{id}/customer-number", data)

    async def toggle_customer_number_link(self, id: int) -> dict:
        return await self._patch(f"/api/agents/{id}/toggle-customer-number-link")

    async def retry_agent(self, id: int) -> dict:
        return await self._post(f"/api/agents/{id}/retry")

    async def get_call_dashboard(self) -> dict:
        return await self._get("/api/agent-call/dashboard")

    async def get_call_dashboard_ratings(self) -> dict:
        return await self._get("/api/agent-call/dashboard/ratings")

    async def get_call_dashboard_calls(self) -> dict:
        return await self._get("/api/agent-call/dashboard/calls")

    async def get_call_dashboard_call(self, id: int) -> dict:
        return await self._get(f"/api/agent-call/dashboard/calls/{id}")

    async def get_balance_transactions(self) -> dict:
        return await self._get("/api/agent-call/balance/transactions")

    async def topup_balance(self, data: dict) -> dict:
        return await self._post("/api/agent-call/balance/top-up", data)

    async def add_minutes(self, data: dict) -> dict:
        return await self._post("/api/agent-call/balance/add-minutes", data)

    async def get_agent_call_notifications(self) -> dict:
        return await self._get("/api/agent-call/notifications")

    async def get_agent_call_notifications_activity(self) -> dict:
        return await self._get("/api/agent-call/notifications/activity")

    async def mark_agent_call_notification_read(self, id: int) -> dict:
        return await self._patch(f"/api/agent-call/notifications/{id}/read")

    # ════════════════════════════════════════════════════════
    # PHONE NUMBERS
    # ════════════════════════════════════════════════════════

    async def get_available_phone_numbers(self) -> dict:
        return await self._get("/api/phone-numbers/available")

    async def get_phone_numbers(self) -> dict:
        return await self._get("/api/phone-numbers")

    async def get_phone_number(self, id: int) -> dict:
        return await self._get(f"/api/phone-numbers/{id}")

    async def create_phone_number(self, data: dict) -> dict:
        return await self._post("/api/phone-numbers", data)

    async def update_phone_number(self, id: int, data: dict) -> dict:
        return await self._put(f"/api/phone-numbers/{id}", data)

    async def delete_phone_number(self, id: int) -> dict:
        return await self._delete(f"/api/phone-numbers/{id}")

    # ════════════════════════════════════════════════════════
    # KNOWLEDGE BASES
    # ════════════════════════════════════════════════════════

    async def get_knowledge_bases(self) -> dict:
        return await self._get("/api/knowledge-bases")

    async def get_knowledge_base(self, id: int) -> dict:
        return await self._get(f"/api/knowledge-bases/{id}")

    # ════════════════════════════════════════════════════════
    # AGENT TASKS
    # ════════════════════════════════════════════════════════

    async def get_agent_tasks(self) -> dict:
        return await self._get("/api/agent-tasks")

    async def get_agent_task(self, id: int) -> dict:
        return await self._get(f"/api/agent-tasks/{id}")

    async def create_agent_task(self, data: dict) -> dict:
        return await self._post("/api/agent-tasks", data)

    async def update_agent_task(self, id: int, data: dict) -> dict:
        return await self._put(f"/api/agent-tasks/{id}", data)

    async def delete_agent_task(self, id: int) -> dict:
        return await self._delete(f"/api/agent-tasks/{id}")

    async def mark_agent_task_read(self, id: int) -> dict:
        return await self._patch(f"/api/agent-tasks/{id}/read")

    # ════════════════════════════════════════════════════════
    # BOOKED MEETINGS
    # ════════════════════════════════════════════════════════

    async def get_booked_meetings(self) -> dict:
        return await self._get("/api/booked-meetings")

    async def get_booked_meeting(self, id: int) -> dict:
        return await self._get(f"/api/booked-meetings/{id}")

    async def create_booked_meeting(self, data: dict) -> dict:
        return await self._post("/api/booked-meetings", data)

    async def update_booked_meeting(self, id: int, data: dict) -> dict:
        return await self._put(f"/api/booked-meetings/{id}", data)

    async def delete_booked_meeting(self, id: int) -> dict:
        return await self._delete(f"/api/booked-meetings/{id}")

    async def create_meet_link(self, id: int) -> dict:
        return await self._post(f"/api/booked-meetings/{id}/create-meet")

    async def create_calendar_event(self, id: int) -> dict:
        return await self._post(f"/api/booked-meetings/{id}/create-calendar")

    async def check_availability(self, data: dict) -> dict:
        return await self._post("/api/booked-meetings/check-availability", data)

    # ════════════════════════════════════════════════════════
    # ANALYTICS & TRANSCRIPTS
    # ════════════════════════════════════════════════════════

    async def get_call_analytics(self) -> dict:
        return await self._get("/api/call-analytics")

    async def get_call_analytic(self, id: int) -> dict:
        return await self._get(f"/api/call-analytics/{id}")

    async def get_call_transcripts(self) -> dict:
        return await self._get("/api/call-transcripts")

    async def get_call_transcript(self, id: int) -> dict:
        return await self._get(f"/api/call-transcripts/{id}")

    async def get_customer_feedback(self) -> dict:
        return await self._get("/api/customer-feedback")

    async def get_customer_feedback_item(self, id: int) -> dict:
        return await self._get(f"/api/customer-feedback/{id}")