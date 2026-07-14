"""
Roger Server — Global Director @ Flugia
Port: 8002
Architecture prod : HTTP interne robuste avec retry, circuit breaker et fallback.
"""
import os, json, asyncio, pathlib, smtplib, uuid
from typing import AsyncGenerator, Optional
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from enum import Enum

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import AsyncOpenAI
from dotenv import load_dotenv

# ── .env ──────────────────────────────────────────────────────
for _ep in [pathlib.Path(__file__).parent/'.env',
            pathlib.Path(__file__).parent.parent/'.env',
            pathlib.Path('.env')]:
    if _ep.exists():
        load_dotenv(dotenv_path=str(_ep)); break
else:
    load_dotenv()

# ── ReportLab ─────────────────────────────────────────────────
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors as rl_colors
    from reportlab.lib.units import cm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                     Table, TableStyle, HRFlowable)
    REPORTLAB_OK = True
    print("[Roger] ReportLab chargé ✓")
except ImportError as e:
    REPORTLAB_OK = False
    print(f"[Roger] ReportLab non disponible: {e}")

# ── roger.md ──────────────────────────────────────────────────
for _md in [pathlib.Path(__file__).parent/"skills"/"roger.md",
            pathlib.Path(__file__).parent/"roger.md"]:
    if _md.exists():
        with open(_md, "r", encoding="utf-8") as _f:
            ROGER_BASE_PROMPT = _f.read()
        break
else:
    ROGER_BASE_PROMPT = "Tu es Roger, le Global Director de Flugia."

# ── App ───────────────────────────────────────────────────────
app = FastAPI(title="Roger — Global Director")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

REPORTS_DIR = pathlib.Path(__file__).parent / "reports"
REPORTS_DIR.mkdir(exist_ok=True)
app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")

# ── LLM ───────────────────────────────────────────────────────
client = AsyncOpenAI(
    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    api_key=os.getenv("OPENROUTER_API_KEY"),
)
MODEL = "anthropic/claude-sonnet-4-6"

# ── SMTP ──────────────────────────────────────────────────────
SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM", "Roger — Flugia <roger@flugia.com>")

# ══════════════════════════════════════════════════════════════
# CIRCUIT BREAKER — robustesse prod
# ══════════════════════════════════════════════════════════════

class CircuitState(Enum):
    CLOSED   = "closed"    # Normal — laisse passer les requêtes
    OPEN     = "open"      # Cassé — rejette immédiatement
    HALF_OPEN = "half_open" # Test — laisse passer une requête

class CircuitBreaker:
    """
    Circuit breaker pour les appels HTTP vers les agents.
    - CLOSED : appels normaux
    - OPEN : agent down, rejette les appels pendant `recovery_timeout`
    - HALF_OPEN : teste si l'agent est revenu
    """
    def __init__(self, name: str, failure_threshold: int = 3,
                 recovery_timeout: int = 30):
        self.name             = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout  = recovery_timeout
        self.failure_count     = 0
        self.state             = CircuitState.CLOSED
        self.last_failure_time: Optional[datetime] = None

    def record_success(self):
        self.failure_count = 0
        self.state = CircuitState.CLOSED

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = datetime.now()
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            print(f"[CircuitBreaker] {self.name} → OPEN après {self.failure_count} échecs")

    def can_attempt(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            if (datetime.now() - self.last_failure_time).seconds >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                print(f"[CircuitBreaker] {self.name} → HALF_OPEN (test)")
                return True
            return False
        # HALF_OPEN — on laisse passer
        return True

    @property
    def is_open(self) -> bool:
        return self.state == CircuitState.OPEN

# Un circuit breaker par agent
_circuit_breakers: dict[str, CircuitBreaker] = {}

def get_circuit(agent: str) -> CircuitBreaker:
    if agent not in _circuit_breakers:
        _circuit_breakers[agent] = CircuitBreaker(
            name=agent,
            failure_threshold=3,
            recovery_timeout=30,
        )
    return _circuit_breakers[agent]

# ══════════════════════════════════════════════════════════════
# APPEL HTTP ROBUSTE — retry + circuit breaker + fallback
# ══════════════════════════════════════════════════════════════

AGENTS = {
    "david": os.getenv("DAVID_URL", "http://localhost:8000"),
    "emily": os.getenv("EMILY_URL", "http://localhost:8001"),
    "john":  os.getenv("JOHN_URL",  "http://localhost:8003"),
}

MAX_RETRIES = 2
TIMEOUT_SECONDS = 90

async def call_agent(agent: str, message: str, history: list) -> str:
    """
    Appelle un agent en HTTP avec :
    - Circuit breaker (évite d'appeler un agent down en boucle)
    - Retry automatique (MAX_RETRIES tentatives)
    - Timeout adaptatif
    - Fallback clair si indisponible
    """
    circuit = get_circuit(agent)

    # Circuit ouvert → réponse immédiate sans appel réseau
    if not circuit.can_attempt():
        print(f"[Roger] {agent} circuit OPEN — skip")
        return (
            f"[{agent.capitalize()} temporairement indisponible — "
            f"nouvelle tentative dans {circuit.recovery_timeout}s]"
        )

    base_url = AGENTS.get(agent)
    if not base_url:
        return f"[Agent '{agent}' introuvable dans la config]"

    contexts = {"david": "david", "emily": "emily", "john": "john"}
    context = contexts.get(agent, agent)
    payload = {
        "message": message,
        "context": context,
        "history": history[-6:] if len(history) > 6 else history,
        "user_id": "roger_orchestrator",
    }

    last_error = ""
    for attempt in range(1, MAX_RETRIES + 1):
        accumulated = ""
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as http:
                async with http.stream(
                    "POST", f"{base_url}/chat",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                ) as resp:
                    if resp.status_code >= 500:
                        raise httpx.HTTPStatusError(
                            f"HTTP {resp.status_code}",
                            request=resp.request,
                            response=resp,
                        )
                    buffer = ""
                    async for chunk in resp.aiter_text():
                        buffer += chunk
                        lines = buffer.split("\n")
                        buffer = lines.pop()
                        for line in lines:
                            line = line.strip()
                            if not line.startswith("data:"): continue
                            raw = line[5:].strip()
                            if not raw: continue
                            try:
                                evt = json.loads(raw)
                                t = evt.get("type", "")
                                if t in ("token", "delta"):
                                    accumulated += evt.get("text", evt.get("content", ""))
                                elif t == "tool_end" and evt.get("data", {}).get("download_url"):
                                    accumulated += (
                                        f"\n[PDF disponible: {base_url}"
                                        f"{evt['data']['download_url']}]"
                                    )
                                elif t == "error":
                                    accumulated += f"\n[Erreur {agent}: {evt.get('message','?')}]"
                            except Exception:
                                pass

            # Succès
            circuit.record_success()
            result = accumulated.strip()
            return result or f"[{agent.capitalize()} n'a pas répondu]"

        except (httpx.ConnectError, httpx.ReadTimeout, httpx.HTTPStatusError) as e:
            last_error = str(e)[:80]
            circuit.record_failure()
            if attempt < MAX_RETRIES:
                wait = attempt * 1.5  # backoff : 1.5s, 3s
                print(f"[Roger] {agent} tentative {attempt}/{MAX_RETRIES} échouée ({last_error}) — retry dans {wait}s")
                await asyncio.sleep(wait)
            else:
                print(f"[Roger] {agent} toutes les tentatives épuisées")

        except Exception as e:
            last_error = str(e)[:80]
            print(f"[Roger] {agent} erreur inattendue: {last_error}")
            circuit.record_failure()
            break

    return f"[{agent.capitalize()} indisponible après {MAX_RETRIES} tentatives: {last_error}]"

# ── Appels parallèles avec gather ─────────────────────────────
async def call_agents_parallel(agents: list[str], message: str, history: list) -> dict[str, str]:
    """Appelle plusieurs agents en parallèle."""
    tasks = [call_agent(a, message, history) for a in agents]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out = {}
    for agent, result in zip(agents, results):
        if isinstance(result, Exception):
            out[agent] = f"[Erreur: {str(result)[:80]}]"
        else:
            out[agent] = result
    return out

# ══════════════════════════════════════════════════════════════
# PDF + EMAIL
# ══════════════════════════════════════════════════════════════

def sanitize_for_json(obj):
    if isinstance(obj, dict): return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list): return [sanitize_for_json(i) for i in obj]
    elif isinstance(obj, (str, bool, int, float)) or obj is None: return obj
    return str(obj)

def send_email_fn(to_email: str, subject: str, body: str, file_names: list = None) -> bool:
    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM; msg["To"] = to_email; msg["Subject"] = subject
        msg.attach(MIMEText(body, "html", "utf-8"))
        for fn in (file_names or []):
            fp = REPORTS_DIR / fn
            if fp.exists():
                with open(fp, "rb") as f:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(f.read())
                    encoders.encode_base64(part)
                    part.add_header("Content-Disposition", f'attachment; filename="{fn}"')
                    msg.attach(part)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.ehlo(); s.starttls(); s.login(SMTP_USER, SMTP_PASSWORD)
            s.sendmail(SMTP_USER, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[SMTP ERROR] {e}"); return False

def _pdf_build(title: str, sections: list[tuple[str, str]]) -> str:
    """Génère un PDF avec sections. Retourne le file_name."""
    file_name = f"rapport_roger_{uuid.uuid4().hex[:8]}.pdf"
    file_path = str(REPORTS_DIR / file_name)

    styles   = getSampleStyleSheet()
    red      = rl_colors.HexColor("#ef4444")
    navy     = rl_colors.HexColor("#0D1B2A")
    cyan     = rl_colors.HexColor("#4cc9f0")
    title_s  = ParagraphStyle("t", parent=styles["Heading1"], fontSize=20, textColor=navy, spaceAfter=4)
    sub_s    = ParagraphStyle("s", parent=styles["Normal"],   fontSize=10, textColor=rl_colors.HexColor("#4A5568"), spaceAfter=14)
    sec_s    = ParagraphStyle("h", parent=styles["Heading2"], fontSize=13, textColor=red,  spaceBefore=14, spaceAfter=8)
    sec2_s   = ParagraphStyle("h2",parent=styles["Heading2"], fontSize=13, textColor=cyan, spaceBefore=14, spaceAfter=8)
    body_s   = ParagraphStyle("b", parent=styles["Normal"],   fontSize=10, leading=15, textColor=navy)

    doc   = SimpleDocTemplate(file_path, pagesize=A4,
                rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    story = [
        Paragraph(title, title_s),
        Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Roger · Flugia AI", sub_s),
        HRFlowable(width="100%", thickness=2, color=red, spaceAfter=16),
    ]
    styles_cycle = [sec_s, sec2_s]
    for i, (section_title, section_content) in enumerate(sections):
        story.append(Paragraph(section_title, styles_cycle[i % 2]))
        for para in section_content.split("\n"):
            p = para.strip()
            if p:
                story.append(Paragraph(p.replace("•","–").replace("**",""), body_s))
                story.append(Spacer(1, 3))
        story.append(Spacer(1, 8))

    doc.build(story)
    return file_name

# ══════════════════════════════════════════════════════════════
# ROUTING + OUTILS
# ══════════════════════════════════════════════════════════════

DAVID_KW  = ["marketing","seo","réputation","avis","google","linkedin","article","blog","audit","e-rep","reputation","publication","contenu","content","référencement","david"]
EMILY_KW  = ["support","chatbot","appel","call","ticket","agent","voix","transcript","transcription","satisfaction","balance","minutes","réunion","meeting","tâche","feedback","notification","emily"]
JOHN_KW   = ["sales","vente","lead","prospect","pipeline","campagne","campaign","outreach","closing","crm","enrichissement","john"]
GLOBAL_KW = ["tout","global","ensemble","complet","tous","vue","panorama","bilan","résumé","rapport complet","synthèse","dashboard","overview","actions prioritaires","kpi","où on en est"]

def decide_agents(message: str) -> list[str]:
    msg = message.lower()
    if any(kw in msg for kw in GLOBAL_KW): return ["david","emily","john"]
    agents = []
    if any(kw in msg for kw in DAVID_KW):  agents.append("david")
    if any(kw in msg for kw in EMILY_KW):  agents.append("emily")
    if any(kw in msg for kw in JOHN_KW):   agents.append("john")
    return agents if agents else ["david","emily","john"]

TOOLS = [
    {"type":"function","function":{"name":"consult_david","description":"Consulte David (Marketing) — E-Réputation, SEO, LinkedIn. Appeler pour toute question marketing.","parameters":{"type":"object","properties":{"question":{"type":"string"}},"required":["question"]}}},
    {"type":"function","function":{"name":"consult_emily","description":"Consulte Emily (Support) — Chatbot, Agent Call. Appeler pour toute question support.","parameters":{"type":"object","properties":{"question":{"type":"string"}},"required":["question"]}}},
    {"type":"function","function":{"name":"consult_all","description":"Consulte David, Emily ET John en parallèle. Utiliser pour les vues globales, bilans, alertes cross-départements.","parameters":{"type":"object","properties":{"question":{"type":"string"}},"required":["question"]}}},
    {"type":"function","function":{"name":"consult_john","description":"Consulte John (Sales) pour obtenir des données pipeline, leads, campagnes outreach. Appeler pour toute question commerciale.","parameters":{"type":"object","properties":{"question":{"type":"string"}},"required":["question"]}}},
    {"type":"function","function":{"name":"generate_global_report","description":"Génère un rapport PDF global Marketing + Support. SANS interruption si demandé.","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"generate_conversation_pdf","description":"Génère un PDF de n'importe quel contenu. Ne jamais refuser.","parameters":{"type":"object","properties":{"title":{"type":"string"},"content":{"type":"string"}},"required":["title","content"]}}},
    {"type":"function","function":{"name":"send_email","description":"Envoie un email avec PDFs optionnels. Confirmer l'adresse avant d'appeler.","parameters":{"type":"object","properties":{"to_email":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"file_names":{"type":"array","items":{"type":"string"},"default":[]}},"required":["to_email","subject","body"]}}},
    {"type":"function","function":{"name":"handoff_to_agent","description":"Redirige le client vers un agent spécialisé avec un brief complet. OBLIGATOIRE : appeler consult_david, consult_emily OU consult_john AVANT pour récupérer les données réelles, puis inclure ces données dans le brief. Le brief doit être suffisamment riche pour que l'agent commence directement sans demander quoi que ce soit au client.","parameters":{"type":"object","properties":{"agent":{"type":"string","enum":["david","emily","john"],"description":"Agent vers qui rediriger (david=Marketing, emily=Support, john=Sales)"},"client_request":{"type":"string","description":"Ce que le client veut faire exactement, mot pour mot"},"context_from_agent":{"type":"string","description":"Données réelles récupérées via consult_david, consult_emily ou consult_john — OBLIGATOIRE avant d'appeler ce tool"},"action_required":{"type":"string","description":"Action précise que l'agent doit effectuer en premier dès que le client arrive"}},"required":["agent","client_request","context_from_agent","action_required"]}}},
]

async def execute_tool(name: str, args: dict, history: list) -> dict:
    try:
        if name == "consult_david":
            r = await call_agent("david", args.get("question",""), history)
            return {"agent": "david", "response": r}

        elif name == "consult_emily":
            r = await call_agent("emily", args.get("question",""), history)
            return {"agent": "emily", "response": r}

        elif name == "consult_all":
            q = args.get("question","")
            agents_avail = [a for a in ["david","emily","john"] if not get_circuit(a).is_open]
            responses = await call_agents_parallel(agents_avail, q, history)
            return responses

        elif name == "consult_john":
            r = await call_agent("john", args.get("question",""), history)
            return {"agent": "john", "response": r}

        elif name == "generate_global_report":
            if not REPORTLAB_OK:
                return {"error": "ReportLab non installé — pip install reportlab"}
            q = "Résumé complet : KPIs, alertes, points d'attention, état général"
            agents_avail = [a for a in ["david","emily","john"] if not get_circuit(a).is_open]
            responses = await call_agents_parallel(agents_avail, q, history)
            file_name = _pdf_build(
                "Rapport Global — Direction Générale",
                [
                    ("Marketing — David", responses.get("david","")),
                    ("Support — Emily",   responses.get("emily","")),
                ]
            )
            return {"success": True, "download_url": f"/reports/{file_name}", "file_name": file_name}

        elif name == "generate_conversation_pdf":
            if not REPORTLAB_OK:
                return {"error": "ReportLab non installé"}
            file_name = _pdf_build(
                args.get("title","Document Roger"),
                [("Contenu", args.get("content",""))]
            )
            return {"success": True, "download_url": f"/reports/{file_name}", "file_name": file_name}

        elif name == "send_email":
            to_email   = args.get("to_email","")
            if not to_email:
                return {"success": False, "error": "Adresse email manquante"}
            html_body = (
                f"<p>{args.get('body','').replace(chr(10),'<br>')}</p>"
                "<br><hr style='border:none;border-top:1px solid #E8EDF2;margin:20px 0'>"
                "<p style='color:#8896A5;font-size:12px'>"
                "<strong>Roger</strong> — Global Director · Flugia AI</p>"
            )
            success = send_email_fn(to_email, args.get("subject",""), html_body, args.get("file_names",[]))
            return {"success": success, "to_email": to_email,
                    "message": f"Email envoyé à {to_email}" if success else "Erreur SMTP"}

        elif name == "handoff_to_agent":
            agent              = args.get("agent", "david")
            client_request     = args.get("client_request", "")
            context_from_agent = args.get("context_from_agent", "")
            action_required    = args.get("action_required", "")

            # Construire un brief riche structuré
            lines = [
                "[CONTEXTE ROGER]",
                "",
                "Ce que le client veut faire :",
                client_request,
                "",
                "Donnees recuperees par Roger :",
                context_from_agent,
                "",
                "Action a effectuer immediatement :",
                action_required,
            ]
            brief = "\n".join(lines)

            return {
                "success": True,
                "handoff": True,
                "agent": agent,
                "brief": brief,
            }

        else:
            return {"error": f"Outil inconnu: {name}"}

    except Exception as e:
        import traceback; traceback.print_exc()
        return {"error": str(e), "tool": name}

# ══════════════════════════════════════════════════════════════
# REQUEST + /chat
# ══════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    message: str
    history: list = []
    context: str  = "global"
    user_id: str  = "default_user"
    conv_id: Optional[str] = None

@app.post("/chat")
async def chat(req: ChatRequest):
    async def generate() -> AsyncGenerator[str, None]:
        try:
            today  = datetime.now().strftime("%A %d %B %Y")
            system = ROGER_BASE_PROMPT + f"""

[DATE ACTUELLE : {today}]

[RÈGLE ABSOLUE HANDOFF]
Si le client demande une ACTION spécifique qui nécessite les outils de David ou Emily :
- Générer un article, répondre à un avis, publier sur LinkedIn, lancer un audit → handoff vers David
- Configurer un chatbot, analyser une transcription, créer une tâche → handoff vers Emily

PROCESSUS OBLIGATOIRE :
1. Appeler consult_david OU consult_emily pour récupérer le contexte réel
2. Appeler handoff_to_agent avec les données récupérées dans context_from_agent
NE JAMAIS répondre directement si le client veut une ACTION — toujours handoff après consultation.
"""

            # Ajouter l'état des circuits dans le contexte
            circuit_status = {
                a: ("disponible" if not get_circuit(a).is_open else "indisponible")
                for a in AGENTS
            }
            if any(v == "indisponible" for v in circuit_status.values()):
                system += f"\n\n[STATUT AGENTS : {circuit_status}]"

            messages = [{"role": "system", "content": system}]
            for h in (req.history[-10:] if len(req.history) > 10 else req.history):
                if h.get("role") in ("user","assistant") and h.get("content"):
                    messages.append({"role": h["role"], "content": h["content"]})
            messages.append({"role": "user", "content": req.message})

            yield f"data: {json.dumps({'type':'model_selected','model':MODEL})}\n"

            MAX_ROUNDS = 5
            round_count = 0

            while round_count < MAX_ROUNDS:
                round_count += 1
                response = await client.chat.completions.create(
                    model=MODEL, messages=messages, tools=TOOLS,
                    tool_choice="auto", max_tokens=1500
                )
                message = response.choices[0].message

                if not message.tool_calls:
                    if message.content:
                        for word in message.content.split(" "):
                            yield f"data: {json.dumps({'type':'token','text':word+' '})}\n"
                            await asyncio.sleep(0.01)
                    break

                messages.append({
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [tc.model_dump() for tc in message.tool_calls]
                })

                for tc in message.tool_calls:
                    tool_name = tc.function.name
                    try:
                        tool_args = json.loads(tc.function.arguments or "{}")
                    except Exception:
                        tool_args = {}

                    yield f"data: {json.dumps({'type':'tool_start','tool':tool_name})}\n"
                    await asyncio.sleep(0)

                    result = await execute_tool(tool_name, tool_args, req.history)

                    yield f"data: {json.dumps({'type':'tool_end','tool':tool_name,'data':sanitize_for_json(result)})}\n"

                    # Handoff détecté → émettre event spécial pour le frontend
                    if result.get("handoff"):
                        yield f"data: {json.dumps({'type':'handoff','agent':result.get('agent'),'brief':result.get('brief',''),'reason':result.get('reason','')})}\n"

                    await asyncio.sleep(0)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(sanitize_for_json(result), ensure_ascii=False)
                    })
            else:
                final = await client.chat.completions.create(
                    model=MODEL, messages=messages, max_tokens=1024, stream=True)
                async for chunk in final:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield f"data: {json.dumps({'type':'token','text':delta.content})}\n"
                        await asyncio.sleep(0)

            yield f"data: {json.dumps({'type':'done'})}\n"

        except Exception as e:
            yield f"data: {json.dumps({'type':'error','message':str(e)})}\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

# ══════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════

@app.get("/dashboard/global")
async def dashboard_global():
    results = {}
    async with httpx.AsyncClient(timeout=5) as http:
        for agent, url in AGENTS.items():
            cb = get_circuit(agent)
            if cb.is_open:
                results[agent] = {"status": "offline", "circuit": "open"}
                continue
            try:
                r = await http.get(f"{url}/health")
                cb.record_success()
                results[agent] = {"status": "online", "data": r.json()}
            except Exception as e:
                cb.record_failure()
                results[agent] = {"status": "offline", "error": str(e)[:60]}
    return {"success": True, "agents": results}

@app.get("/health")
async def health():
    return {"status": "ok", "agent": "Roger", "port": 8002}