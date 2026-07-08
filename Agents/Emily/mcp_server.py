"""
Emily MCP Server — Support (Chatbot + Agent Call)
Expose les outils qu'Emily peut utiliser via le LLM.
"""
from mcp.server.fastmcp import FastMCP
from api_client import EmilyApiClient

mcp = FastMCP("emily-support")
api = EmilyApiClient()

# ════════════════════════════════════════════════════════
# CHATBOT TOOLS
# ════════════════════════════════════════════════════════

@mcp.tool()
async def get_chatbots() -> dict:
    """Liste tous les chatbots du compte."""
    return await api.get_chatbots()

@mcp.tool()
async def get_chatbot(id: int) -> dict:
    """Détails d'un chatbot spécifique."""
    return await api.get_chatbot(id)

@mcp.tool()
async def get_chatbot_statistics(id: int) -> dict:
    """Statistiques d'un chatbot (conversations, taux de résolution, etc.)."""
    return await api.get_chatbot_statistics(id)

@mcp.tool()
async def get_chatbot_history(public_token: str) -> dict:
    """Historique des conversations d'un chatbot."""
    return await api.get_chatbot_history(public_token)

@mcp.tool()
async def get_chatbot_script(id: int) -> dict:
    """Script/prompt d'un chatbot."""
    return await api.get_chatbot_script(id)

@mcp.tool()
async def get_chatbot_files(id: int) -> dict:
    """Fichiers de connaissance attachés à un chatbot."""
    return await api.get_chatbot_files(id)

@mcp.tool()
async def update_chatbot(id: int, name: str = None, description: str = None,
                          language: str = None, tone: str = None) -> dict:
    """Met à jour la configuration d'un chatbot."""
    data = {k: v for k, v in {"name": name, "description": description,
                                "language": language, "tone": tone}.items() if v is not None}
    return await api.update_chatbot(id, data)

@mcp.tool()
async def get_chatbot_notifications() -> dict:
    """Notifications des chatbots (nouvelles conversations, escalades, etc.)."""
    return await api.get_chatbot_notifications()

@mcp.tool()
async def mark_chatbot_notification_read(id: int) -> dict:
    """Marque une notification chatbot comme lue."""
    return await api.mark_chatbot_notification_read(id)

# ════════════════════════════════════════════════════════
# AGENT CALL TOOLS
# ════════════════════════════════════════════════════════

@mcp.tool()
async def get_agents() -> dict:
    """Liste tous les agents vocaux (inbound et outbound)."""
    return await api.get_agents()

@mcp.tool()
async def get_agent(id: int) -> dict:
    """Détails d'un agent vocal spécifique."""
    return await api.get_agent(id)

@mcp.tool()
async def get_call_dashboard() -> dict:
    """Dashboard principal des appels : stats globales, appels récents, balance."""
    return await api.get_call_dashboard()

@mcp.tool()
async def get_call_dashboard_ratings() -> dict:
    """Ratings et satisfaction client des appels."""
    return await api.get_call_dashboard_ratings()

@mcp.tool()
async def get_call_dashboard_calls() -> dict:
    """Liste des appels récents avec statuts."""
    return await api.get_call_dashboard_calls()

@mcp.tool()
async def get_call_dashboard_call(id: int) -> dict:
    """Détails d'un appel spécifique."""
    return await api.get_call_dashboard_call(id)

@mcp.tool()
async def get_call_analytics() -> dict:
    """Analytics détaillées des appels (durée, taux de décroché, etc.)."""
    return await api.get_call_analytics()

@mcp.tool()
async def get_call_transcripts() -> dict:
    """Liste des transcriptions d'appels."""
    return await api.get_call_transcripts()

@mcp.tool()
async def get_call_transcript(id: int) -> dict:
    """Transcription complète d'un appel spécifique."""
    return await api.get_call_transcript(id)

@mcp.tool()
async def get_customer_feedback() -> dict:
    """Retours clients post-appel."""
    return await api.get_customer_feedback()

@mcp.tool()
async def get_balance_transactions() -> dict:
    """Historique des transactions de balance (minutes utilisées, recharges)."""
    return await api.get_balance_transactions()

@mcp.tool()
async def get_phone_numbers() -> dict:
    """Numéros de téléphone actifs du compte."""
    return await api.get_phone_numbers()

@mcp.tool()
async def get_available_phone_numbers() -> dict:
    """Numéros de téléphone disponibles à l'achat."""
    return await api.get_available_phone_numbers()

@mcp.tool()
async def get_knowledge_bases() -> dict:
    """Bases de connaissances disponibles pour les agents."""
    return await api.get_knowledge_bases()

# ════════════════════════════════════════════════════════
# AGENT TASKS
# ════════════════════════════════════════════════════════

@mcp.tool()
async def get_agent_tasks() -> dict:
    """Liste des tâches assignées aux agents (follow-ups, callbacks, etc.)."""
    return await api.get_agent_tasks()

@mcp.tool()
async def get_agent_task(id: int) -> dict:
    """Détails d'une tâche agent."""
    return await api.get_agent_task(id)

@mcp.tool()
async def create_agent_task(title: str, description: str, agent_id: int,
                             due_date: str = None, priority: str = "medium") -> dict:
    """Crée une nouvelle tâche pour un agent."""
    data = {"title": title, "description": description, "agent_id": agent_id,
            "priority": priority}
    if due_date: data["due_date"] = due_date
    return await api.create_agent_task(data)

@mcp.tool()
async def mark_agent_task_read(id: int) -> dict:
    """Marque une tâche agent comme lue/traitée."""
    return await api.mark_agent_task_read(id)

# ════════════════════════════════════════════════════════
# BOOKED MEETINGS
# ════════════════════════════════════════════════════════

@mcp.tool()
async def get_booked_meetings() -> dict:
    """Liste des réunions bookées via les agents."""
    return await api.get_booked_meetings()

@mcp.tool()
async def get_booked_meeting(id: int) -> dict:
    """Détails d'une réunion bookée."""
    return await api.get_booked_meeting(id)

@mcp.tool()
async def check_availability(date: str, duration_minutes: int = 30) -> dict:
    """Vérifie la disponibilité pour un créneau de réunion."""
    return await api.check_availability({"date": date, "duration": duration_minutes})

@mcp.tool()
async def get_agent_call_notifications() -> dict:
    """Notifications des agents vocaux (appels manqués, tâches, alertes)."""
    return await api.get_agent_call_notifications()

@mcp.tool()
async def mark_agent_call_notification_read(id: int) -> dict:
    """Marque une notification agent call comme lue."""
    return await api.mark_agent_call_notification_read(id)

if __name__ == "__main__":
    mcp.run()