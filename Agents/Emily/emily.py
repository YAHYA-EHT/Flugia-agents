"""
Emily Server — AI Support Manager
Port: 8001
Features: Chatbot + Agent Call
"""
import os, json, uuid
from typing import AsyncGenerator, Optional
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import AsyncOpenAI
from dotenv import load_dotenv

from api_client import EmilyApiClient

load_dotenv()

app = FastAPI(title="Emily — AI Support Manager")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Clients ───────────────────────────────────────────────────
client = AsyncOpenAI(
    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    api_key=os.getenv("OPENROUTER_API_KEY"),
)
api = EmilyApiClient()

MODEL_FAST    = "anthropic/claude-haiku-4-5"    # réponses rapides
MODEL_COMPLEX = "anthropic/claude-sonnet-4-6"   # tâches complexes

# ── Contextes ─────────────────────────────────────────────────
CONTEXT_PROMPTS = {
    "emily":       "",
    "chatbot":     "\n\n[FOCUS: Tu es dans l'espace Chatbot. Concentre-toi sur la gestion des chatbots, leurs statistiques, historiques et configurations.]",
    "agent_call":  "\n\n[FOCUS: Tu es dans l'espace Agent Call. Concentre-toi sur les agents vocaux, les appels, analytics, transcriptions et balance.]",
}

# ── System prompt ─────────────────────────────────────────────
EMILY_SYSTEM = """Tu es Emily, l'AI Support Manager de Flugia.

Tu gères deux features principales :
1. **Chatbot** — Chatbots IA pour le support client en ligne
2. **Agent Call** — Agents vocaux IA pour les appels entrants et sortants

TON RÔLE :
- Présenter les données de support de façon claire et actionnables
- Analyser les performances (taux de résolution, satisfaction, durée des appels)
- Identifier les problèmes et proposer des améliorations
- Gérer les tâches et notifications
- Répondre aux questions sur les réunions bookées

RÈGLES :
1. Toujours appeler les outils pour avoir des données réelles avant de répondre
2. Présenter les chiffres de façon claire avec contexte
3. Signaler les anomalies (taux de résolution bas, appels manqués, notifications urgentes)
4. Ne jamais inventer de données
5. Langue : français par défaut

Tu es efficace, précise et orientée résultats."""

# ── Tools ─────────────────────────────────────────────────────
TOOLS_CHATBOT = [
    {"type": "function", "function": {"name": "get_chatbots", "description": "Liste tous les chatbots du compte", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_chatbot", "description": "Détails d'un chatbot", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}}},
    {"type": "function", "function": {"name": "get_chatbot_statistics", "description": "Statistiques d'un chatbot (conversations, résolution, satisfaction)", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}}},
    {"type": "function", "function": {"name": "get_chatbot_history", "description": "Historique des conversations d'un chatbot", "parameters": {"type": "object", "properties": {"public_token": {"type": "string"}}, "required": ["public_token"]}}},
    {"type": "function", "function": {"name": "get_chatbot_script", "description": "Script/prompt d'un chatbot", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}}},
    {"type": "function", "function": {"name": "get_chatbot_files", "description": "Fichiers de connaissance d'un chatbot", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}}},
    {"type": "function", "function": {"name": "get_chatbot_notifications", "description": "Notifications des chatbots", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "mark_chatbot_notification_read", "description": "Marque une notification chatbot comme lue", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}}},
]

TOOLS_AGENT_CALL = [
    {"type": "function", "function": {"name": "get_agents", "description": "Liste tous les agents vocaux", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_agent", "description": "Détails d'un agent vocal", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}}},
    {"type": "function", "function": {"name": "get_call_dashboard", "description": "Dashboard des appels : stats globales, balance, appels récents", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_call_dashboard_ratings", "description": "Ratings et satisfaction client des appels", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_call_dashboard_calls", "description": "Liste des appels récents", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_call_dashboard_call", "description": "Détails d'un appel spécifique", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}}},
    {"type": "function", "function": {"name": "get_call_analytics", "description": "Analytics détaillées des appels", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_call_transcripts", "description": "Liste des transcriptions d'appels", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_call_transcript", "description": "Transcription complète d'un appel", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}}},
    {"type": "function", "function": {"name": "get_customer_feedback", "description": "Retours clients post-appel", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_balance_transactions", "description": "Historique des transactions de balance", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_phone_numbers", "description": "Numéros de téléphone actifs", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_knowledge_bases", "description": "Bases de connaissances disponibles", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_agent_tasks", "description": "Tâches des agents (follow-ups, callbacks)", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_booked_meetings", "description": "Réunions bookées via les agents", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_agent_call_notifications", "description": "Notifications des agents vocaux", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "mark_agent_call_notification_read", "description": "Marque une notification agent call comme lue", "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}}},
    {"type": "function", "function": {"name": "check_availability", "description": "Vérifie la disponibilité pour une réunion", "parameters": {"type": "object", "properties": {"date": {"type": "string", "description": "Date ISO8601"}, "duration_minutes": {"type": "integer", "default": 30}}}}},
]

TOOLS_BY_CONTEXT = {
    "emily":      TOOLS_CHATBOT + TOOLS_AGENT_CALL,
    "chatbot":    TOOLS_CHATBOT,
    "agent_call": TOOLS_AGENT_CALL,
}

# ── Tool executor ─────────────────────────────────────────────
async def execute_tool(name: str, args: dict) -> dict:
    try:
        # Chatbot tools
        if name == "get_chatbots":              return await api.get_chatbots()
        elif name == "get_chatbot":             return await api.get_chatbot(args["id"])
        elif name == "get_chatbot_statistics":  return await api.get_chatbot_statistics(args["id"])
        elif name == "get_chatbot_history":     return await api.get_chatbot_history(args["public_token"])
        elif name == "get_chatbot_script":      return await api.get_chatbot_script(args["id"])
        elif name == "get_chatbot_files":       return await api.get_chatbot_files(args["id"])
        elif name == "get_chatbot_notifications": return await api.get_chatbot_notifications()
        elif name == "mark_chatbot_notification_read": return await api.mark_chatbot_notification_read(args["id"])
        # Agent call tools
        elif name == "get_agents":              return await api.get_agents()
        elif name == "get_agent":               return await api.get_agent(args["id"])
        elif name == "get_call_dashboard":      return await api.get_call_dashboard()
        elif name == "get_call_dashboard_ratings": return await api.get_call_dashboard_ratings()
        elif name == "get_call_dashboard_calls": return await api.get_call_dashboard_calls()
        elif name == "get_call_dashboard_call": return await api.get_call_dashboard_call(args["id"])
        elif name == "get_call_analytics":      return await api.get_call_analytics()
        elif name == "get_call_transcripts":    return await api.get_call_transcripts()
        elif name == "get_call_transcript":     return await api.get_call_transcript(args["id"])
        elif name == "get_customer_feedback":   return await api.get_customer_feedback()
        elif name == "get_balance_transactions": return await api.get_balance_transactions()
        elif name == "get_phone_numbers":       return await api.get_phone_numbers()
        elif name == "get_knowledge_bases":     return await api.get_knowledge_bases()
        elif name == "get_agent_tasks":         return await api.get_agent_tasks()
        elif name == "get_booked_meetings":     return await api.get_booked_meetings()
        elif name == "get_agent_call_notifications": return await api.get_agent_call_notifications()
        elif name == "mark_agent_call_notification_read": return await api.mark_agent_call_notification_read(args["id"])
        elif name == "check_availability":      return await api.check_availability(args)
        else:
            return {"error": f"Outil inconnu: {name}"}
    except Exception as e:
        return {"error": str(e)}

# ── Request model ──────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    history: list = []
    context: str = "emily"
    user_id: str = "default_user"
    conv_id: Optional[str] = None

# ── SSE endpoint ───────────────────────────────────────────────
@app.post("/chat")
async def chat(req: ChatRequest):
    async def generate() -> AsyncGenerator[str, None]:
        context = req.context if req.context in CONTEXT_PROMPTS else "emily"
        tools   = TOOLS_BY_CONTEXT.get(context, TOOLS_BY_CONTEXT["emily"])
        system  = EMILY_SYSTEM + CONTEXT_PROMPTS[context]

        messages = [{"role": "system", "content": system}]
        for h in req.history[-12:]:
            if h.get("role") in ("user", "assistant") and h.get("content"):
                messages.append({"role": h["role"], "content": h["content"]})
        messages.append({"role": "user", "content": req.message})

        # Choisir le modèle selon la complexité
        model = MODEL_COMPLEX if any(kw in req.message.lower() for kw in
            ["analyse", "rapport", "transcription", "détail", "complet", "résumé"]) else MODEL_FAST

        yield f"data: {json.dumps({'type': 'model_selected', 'model': model})}\n"

        # Boucle agentique
        for _ in range(8):
            response = await client.chat.completions.create(
                model=model, messages=messages, tools=tools,
                tool_choice="auto", stream=False
            )
            message = response.choices[0].message

            if not message.tool_calls:
                # Streaming de la réponse finale
                stream = await client.chat.completions.create(
                    model=model,
                    messages=messages + [{"role": "assistant", "content": message.content or ""}],
                    stream=True
                )
                async for chunk in stream:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield f"data: {json.dumps({'type': 'token', 'text': delta.content})}\n"
                yield f"data: {json.dumps({'type': 'done'})}\n"
                return

            # Exécuter les outils
            messages.append({"role": "assistant", "content": message.content,
                             "tool_calls": [tc.model_dump() for tc in message.tool_calls]})

            for tc in message.tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments)
                except Exception:
                    args = {}

                yield f"data: {json.dumps({'type': 'tool_start', 'tool': name})}\n"
                result = await execute_tool(name, args)
                yield f"data: {json.dumps({'type': 'tool_end', 'tool': name})}\n"

                messages.append({"role": "tool", "tool_call_id": tc.id,
                                  "content": json.dumps(result)})

        yield f"data: {json.dumps({'type': 'error', 'message': 'Trop d itérations'})}\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ── Dashboard endpoints ────────────────────────────────────────
@app.get("/dashboard/chatbot")
async def dashboard_chatbot():
    try:
        chatbots = await api.get_chatbots()
        notifs   = await api.get_chatbot_notifications()
        return {"success": True, "chatbots": chatbots.get("data", []),
                "notifications": notifs.get("data", [])}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/dashboard/agent-call")
async def dashboard_agent_call():
    try:
        dash    = await api.get_call_dashboard()
        ratings = await api.get_call_dashboard_ratings()
        calls   = await api.get_call_dashboard_calls()
        return {"success": True, "dashboard": dash.get("data", {}),
                "ratings": ratings.get("data", {}),
                "recent_calls": (calls.get("data", []) or [])[:5]}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/health")
async def health():
    return {"status": "ok", "agent": "Emily", "port": 8001}