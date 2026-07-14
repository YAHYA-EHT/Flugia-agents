"""
Roger MCP Server — David (Marketing)
Expose David comme outil MCP pour Roger.
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

DAVID_URL = os.getenv("DAVID_URL", "http://localhost:8000")

mcp = FastMCP(
    "roger-david",
    description="Accès à David, AI Marketing Manager — E-Réputation, SEO Content, LinkedIn",
)

# ── Helper streaming ──────────────────────────────────────────
async def _call_david(message: str, context: str) -> str:
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
                "POST", f"{DAVID_URL}/chat",
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
                                # Préserver les liens de téléchargement
                                accumulated += f"\n[PDF disponible: {DAVID_URL}{evt['data']['download_url']}]"
                            elif t == "error":
                                accumulated += f"\n[Erreur David: {evt.get('message','?')}]"
                        except Exception:
                            pass
    except Exception as e:
        return f"[David non disponible: {str(e)[:120]}]"
    return accumulated.strip() or "[David n'a pas répondu]"


# ── Outils MCP ────────────────────────────────────────────────

@mcp.tool()
async def david_general(question: str) -> str:
    """
    Pose une question générale à David (Marketing).
    Utiliser quand la question couvre plusieurs features Marketing
    ou quand le contexte n'est pas précis.

    Args:
        question: Question ou demande marketing
    """
    return await _call_david(question, "david")


@mcp.tool()
async def david_e_reputation(question: str) -> str:
    """
    Consulte David sur l'E-Réputation.
    Couvre : score Google, avis clients positifs/négatifs,
    réponses aux avis, analyse de sentiment, synchronisation GBP,
    alertes et notifications.

    Args:
        question: Question e-réputation
    """
    return await _call_david(question, "e_reputation")


@mcp.tool()
async def david_seo(question: str) -> str:
    """
    Consulte David sur le SEO Content.
    Couvre : articles publiés/en cours/échoués, audit SEO,
    suggestions de titres, génération d'articles, référencement,
    configuration du site, publication WordPress.

    Args:
        question: Question SEO
    """
    return await _call_david(question, "seo")


@mcp.tool()
async def david_linkedin(question: str) -> str:
    """
    Consulte David sur LinkedIn.
    Couvre : création de posts, planification de contenu,
    stratégie LinkedIn, publication sur le compte de la marque.

    Args:
        question: Question LinkedIn
    """
    return await _call_david(question, "linkedin")


@mcp.tool()
async def david_health() -> dict:
    """Vérifie si David est disponible et opérationnel."""
    try:
        async with httpx.AsyncClient(timeout=5) as http:
            r = await http.get(f"{DAVID_URL}/health")
            data = r.json()
            return {"status": "online", "agent": data.get("agent", "David"), "port": data.get("port", 8000)}
    except Exception as e:
        return {"status": "offline", "error": str(e)[:80]}


if __name__ == "__main__":
    mcp.run()