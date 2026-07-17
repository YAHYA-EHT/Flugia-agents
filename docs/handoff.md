# Système Handoff

Le système handoff permet à chaque agent de rediriger un client vers un autre agent avec un brief de contexte complet. Le client n'a pas besoin de réexpliquer sa situation.

---

## Architecture

```
Agent source
    │
    ├── 1. Appelle handoff_to_agent(agent, brief, ...)
    ├── 2. Génère le brief [CONTEXTE X]
    ├── 3. Émet event SSE {"type": "handoff", "agent": "...", "brief": "..."}
    │
Frontend
    ├── 4. Capture le brief dans handoffRef (useRef)
    ├── 5. Stocke dans localStorage["flugia_handoff_brief_{agent}"]
    ├── 6. Ouvre HandoffPanel
    │
    └── Client clique "Aller vers X"
         │
         └── Agent cible
              ├── 7. Lit localStorage au démarrage
              ├── 8. Envoie le brief comme premier message
              └── 9. Répond avec "X vient de m'informer..."
```

---

## Format du brief

```
[CONTEXTE ROGER]         ← ou DAVID, EMILY, JOHN

Demande du client :
[Ce que le client veut exactement]

Données récupérées par Roger :
[Données réelles récupérées avant le handoff]

Action immédiate :
[Ce que l'agent cible doit faire en premier]
```

---

## Matrice des redirections

| Source | Peut rediriger vers |
|--------|-------------------|
| Roger | David, Emily, John |
| David | Emily, John, Roger |
| Emily | David, John, Roger |
| John | David, Emily, Roger |

---

## Règle sections vs chat principal

| Type | Comportement |
|------|-------------|
| **Chat principal** (david, emily, john, roger) | Brief complet avec données réelles, instructions de démarrage |
| **Sections** (e_reputation, seo, linkedin, chatbot, agent_call, prospecting, campaigns) | 1 phrase + `handoff_to_agent` immédiat, pas de brief élaboré |

---

## Reconnaissance du brief par l'agent cible

Quand un message commence par `[CONTEXTE X]` :

1. L'agent reconnaît que c'est un brief de collègue
2. Il commence sa réponse par :
   - `[CONTEXTE ROGER]` → "Roger m'a transmis le contexte de votre échange."
   - `[CONTEXTE DAVID]` → "David vient de m'informer de votre demande."
   - `[CONTEXTE EMILY]` → "Emily vient de m'informer de votre demande."
   - `[CONTEXTE JOHN]` → "John vient de m'informer de votre demande."
3. Il enchaîne directement sur l'action sans poser de questions
4. Il ne répète jamais le tag `[CONTEXTE X]` dans sa réponse

---

## Implémentation frontend

### Côté émetteur (ex: RogerChatScreen)

```typescript
// Dans xhr.onprogress
case "handoff":
  handoffRef.current = { agent: evt.agent, brief: evt.brief ?? "" };
  break;

// Dans xhr.onload
if (handoffRef.current) {
  // Effacer tous les anciens briefs
  localStorage.removeItem("flugia_handoff_brief_david");
  localStorage.removeItem("flugia_handoff_brief_emily");
  localStorage.removeItem("flugia_handoff_brief_john");
  localStorage.removeItem("flugia_handoff_brief_roger");
  // Stocker le nouveau
  localStorage.setItem(
    `flugia_handoff_brief_${handoffRef.current.agent}`,
    JSON.stringify({ brief: handoffRef.current.brief, timestamp: Date.now() })
  );
  setTimeout(() => setHandoffTarget(handoffRef.current!.agent), 800);
}
```

### Côté récepteur (ex: DavidChatScreen)

```typescript
// Au démarrage (useEffect)
const briefRaw = localStorage.getItem("flugia_handoff_brief_david");
if (briefRaw) {
  const { brief, timestamp } = JSON.parse(briefRaw);
  if (Date.now() - timestamp < 5 * 60 * 1000 && brief) {
    // Effacer tous les briefs
    localStorage.removeItem("flugia_handoff_brief_david");
    localStorage.removeItem("flugia_handoff_brief_emily");
    localStorage.removeItem("flugia_handoff_brief_roger");
    // Envoyer le brief comme premier message
    setTimeout(() => send(brief), 600);
    return;
  }
}
```

### HandoffPanel — détection de redirection

Le panel s'ouvre uniquement sur des phrases de redirection explicites (plus de mots-clés métier larges) :

```typescript
// ✅ Déclenche le panel
"je te redirige vers John"
"c'est John qui gère ça chez nous"
"pour ça c'est David"

// ❌ Ne déclenche PAS le panel (faux positifs éliminés)
"nos campagnes email" (dans un contexte John normal)
"article SEO" (dans un contexte David normal)
```

---

## Durée de validité du brief

Un brief en localStorage est valide **5 minutes**. Au-delà, il est ignoré et l'agent démarre normalement sans contexte.