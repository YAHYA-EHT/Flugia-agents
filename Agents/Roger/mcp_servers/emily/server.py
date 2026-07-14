"""
Roger MCP Server — Emily (Support)
Expose Emily comme outil MCP pour Roger.
"""
import json
import os
import pathlib

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

# ── .env ─────────────────────────────────────────────────────
for _ep in [
    pathlib.Path(__file__).parent.parent.parent / ".env",
    pathlib.Path(__file__).parent.parent / ".env",
    pathlib.Path(".env"),
]:
    if _ep.exists():
        load_dotenv(dotenv_path=str(_ep))
        break
else:
    load_dotenv()

EMILY_URL = os.getenv("EMILY_URL", "http://localhost:8001")

mcp = FastMCP(
    "roger-emily",
    description="Accès à Emily, AI Support Manager — Chatbot, Agent Call",
)

# ── Helper streaming ──────────────────────────────────────────
async def _call_emily(message: str, context: str) -> str:
    payload = {
        "message": message,
        "context": context,
        "history": [],
        "user_id": "roger_mcp",
    }
    accumulated = ""
    try:
        async with httpx.AsyncClient(timeout=90) as http:
            async with http.stream(
                "POST", f"{EMILY_URL}/chat",
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as resp:
                buffer = ""
                async for chunk in resp.aiter_text():
                    buffer += chunk
                    lines = buffer.split("\n")
                    buffer = lines.pop()
                    for line in lines:
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw:
                            continue
                        try:
                            evt = json.loads(raw)
                            t = evt.get("type", "")
                            if t in ("token", "delta"):
                                accumulated += evt.get("text", evt.get("content", ""))
                            elif t == "tool_end" and evt.get("data", {}).get("download_url"):
                                accumulated += f"\n[PDF disponible: {EMILY_URL}{evt['data']['download_url']}]"
                            elif t == "error":
                                accumulated += f"\n[Erreur Emily: {evt.get('message','?')}]"
                        except Exception:
                            pass
    except Exception as e:
        return f"[Emily non disponible: {str(e)[:120]}]"
    return accumulated.strip() or "[Emily n'a pas répondu]"


# ── Outils MCP ────────────────────────────────────────────────

@mcp.tool()
async def emily_general(question: str) -> str:
    """
    Pose une question générale à Emily (Support).
    Utiliser quand la question couvre Chatbot ET Agent Call
    ou quand le contexte n'est pas précis.

    Args:
        question: Question ou demande support
    """
    return await _call_emily(question, "emily")


@mcp.tool()
async def emily_chatbot(question: str) -> str:
    """
    Consulte Emily sur les Chatbots IA.
    Couvre : liste des chatbots, statistiques (résolution, satisfaction,
    escalades), historique des conversations, configuration,
    fichiers de connaissance, relance d'un chatbot en erreur.

    Args:
        question: Question chatbot
    """
    return await _call_emily(question, "chatbot")


@mcp.tool()
async def emily_agent_call(question: str) -> str:
    """
    Consulte Emily sur l'Agent Call.
    Couvre : dashboard appels, appels manqués, transcriptions complètes,
    satisfaction post-appel, balance de minutes, tâches agents,
    réunions bookées, numéros de téléphone, bases de connaissance.

    Args:
        question: Question agent call
    """
    return await _call_emily(question, "agent_call")


@mcp.tool()
async def emily_health() -> dict:
    """Vérifie si Emily est disponible et opérationnelle."""
    try:
        async with httpx.AsyncClient(timeout=5) as http:
            r = await http.get(f"{EMILY_URL}/health")
            data = r.json()
            return {"status": "online", "agent": data.get("agent", "Emily"), "port": data.get("port", 8001)}
    except Exception as e:
        return {"status": "offline", "error": str(e)[:80]}


if __name__ == "__main__":
    mcp.run()