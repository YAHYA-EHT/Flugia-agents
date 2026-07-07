"""
test_david.py — Test de David avec Groq (modèle gratuit)
Lance ce fichier directement dans PyCharm pour valider
que David appelle les bons outils selon les questions.

Prérequis :
  pip install groq mcp fastmcp httpx python-dotenv
  Créer .env avec GROQ_API_KEY et APP_MODE=mock
"""

import asyncio
import json
import os
from groq import Groq
from dotenv import load_dotenv

# Import direct des outils (sans démarrer le serveur MCP complet)
import sys
sys.path.append(os.path.dirname(__file__))
from mcp_servers.e_reputation import api_client as api

load_dotenv()

# ─── Prompt système de David ──────────────────────────────────
with open("skills/david.md", "r", encoding="utf-8") as f:
    DAVID_SYSTEM_PROMPT = f.read()

# ─── Définition des outils pour Groq ─────────────────────────
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "fetch_reviews",
            "description": "Récupère les avis clients depuis E-Reputation Flugia.",
            "parameters": {
                "type": "object",
                "properties": {
                    "platform": {"type": "string", "enum": ["all", "google", "trustpilot"], "default": "all"},
                    "rating":   {"type": "integer", "minimum": 1, "maximum": 5},
                    "limit":    {"type": "integer", "default": 20}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_statistics",
            "description": "Retourne les statistiques globales de réputation.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_negative_reviews",
            "description": "Récupère uniquement les avis négatifs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_id": {"type": "string"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_negative_analysis",
            "description": "Analyse détaillée des avis négatifs et problèmes récurrents.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_negative_analysis_stats",
            "description": "Statistiques chiffrées sur les avis négatifs.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_status",
            "description": "Vérifie l'état de connexion Google Business Profile.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_notifications",
            "description": "Liste les notifications E-Reputation.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_notifications_activity",
            "description": "Historique d'activité des notifications.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mark_notification_read",
            "description": "Marque une notification comme lue.",
            "parameters": {
                "type": "object",
                "properties": {
                    "notification_id": {"type": "integer"}
                },
                "required": ["notification_id"]
            }
        }
    }
]

# ─── Dispatch des appels d'outils ────────────────────────────
async def execute_tool(name: str, args: dict) -> str:
    if name == "fetch_reviews":
        result = await api.get_reviews(**args)
    elif name == "get_statistics":
        result = await api.get_statistics()
    elif name == "get_negative_reviews":
        result = await api.get_negative_reviews(**args)
    elif name == "get_negative_analysis":
        result = await api.get_negative_analysis()
    elif name == "get_negative_analysis_stats":
        result = await api.get_negative_analysis_stats()
    elif name == "get_status":
        result = await api.get_status()
    elif name == "get_notifications":
        result = await api.get_notifications()
    elif name == "get_notifications_activity":
        result = await api.get_notifications_activity()
    elif name == "mark_notification_read":
        result = await api.mark_notification_read(**args)
    else:
        result = {"error": f"Outil inconnu: {name}"}
    return json.dumps(result, ensure_ascii=False)


# ─── Conversation avec David ──────────────────────────────────
async def ask_david(question: str, verbose: bool = True) -> str:
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    messages = [
        {"role": "system", "content": DAVID_SYSTEM_PROMPT},
        {"role": "user",   "content": question}
    ]

    if verbose:
        print(f"\n{'='*60}")
        print(f"👤 Question : {question}")
        print(f"{'='*60}")

    # Premier appel — David décide quel outil utiliser
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",   # ← modèle Groq gratuit
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        max_tokens=1024
    )

    message = response.choices[0].message

    # Si David veut utiliser un outil
    if message.tool_calls:
        for tool_call in message.tool_calls:
            tool_name = tool_call.function.name
            tool_args = json.loads(tool_call.function.arguments or "{}")

            if verbose:
                print(f"\n⚙️  Outil appelé : {tool_name}")
                print(f"   Paramètres   : {tool_args}")

            # Exécution de l'outil
            tool_result = await execute_tool(tool_name, tool_args)

            if verbose:
                result_preview = tool_result[:200] + "..." if len(tool_result) > 200 else tool_result
                print(f"   Résultat     : {result_preview}")

            # Ajout du résultat dans la conversation
            messages.append({"role": "assistant", "content": None, "tool_calls": message.tool_calls})
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": tool_result
            })

        # Second appel — David formule sa réponse finale
        final_response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            max_tokens=1024
        )
        answer = final_response.choices[0].message.content

    else:
        # David répond directement sans outil (question hors-scope ou simple)
        answer = message.content

    if verbose:
        print(f"\n🤖 David : {answer}\n")

    return answer


# ─── Cas de test ─────────────────────────────────────────────
async def run_tests():
    print("\n🧪 TESTS DAVID — E-Reputation MCP\n")

    tests = [
        # Tests dans le scope — doivent appeler un outil
        "Quel est mon score de réputation actuel ?",
        "Montre-moi les avis négatifs",
        "Quels sont les principaux problèmes détectés dans mes avis ?",
        "Est-ce que mon compte Google Business est bien connecté ?",
        "J'ai des notifications non lues ?",

        # Test hors-scope — David doit signaler et proposer redirection
        "Comment je peux prospecter de nouveaux clients ?",

        # Test action PATCH
        "Marque la notification numéro 1 comme lue",
    ]

    for question in tests:
        await ask_david(question)
        await asyncio.sleep(0.5)  # éviter rate limiting Groq


# ─── Mode interactif ─────────────────────────────────────────
async def chat_mode():
    print("\n💬 MODE CHAT — Parle directement à David")
    print("   (tape 'quit' pour quitter)\n")

    while True:
        question = input("Toi : ").strip()
        if question.lower() in ["quit", "exit", "q"]:
            break
        if question:
            await ask_david(question)


# ─── Point d'entrée ──────────────────────────────────────────
if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "chat":
        asyncio.run(chat_mode())
    else:
        asyncio.run(run_tests())