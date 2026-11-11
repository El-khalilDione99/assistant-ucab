# Assistant UCAB Dakar

Assistant virtuel de l'Université Cheikh Ahmadou Bamba, centre de Dakar (Fass Mbao).
Il répond aux futurs bacheliers, aux étudiants et aux parents, en français et en arabe,
à partir des documents de l'université.

## Comment ça marche

- **Front et back dans un seul projet Next.js** (TypeScript).
  - `src/components/Chat.tsx` : l'interface (reprise de la maquette validée).
  - `src/app/api/chat/route.ts` : le serveur qui reçoit la question et interroge l'IA.
- **Base de connaissances** : les fichiers `.md` du dossier `knowledge/`.
  L'assistant ne répond qu'avec ce qui y est écrit. Pour mettre à jour une information,
  il suffit de modifier le fichier concerné.
- **IA** : Groq (offre gratuite) par défaut. On peut passer à Claude (payant) en changeant
  la variable `AI_PROVIDER`. Les clés restent sur le serveur, jamais dans le navigateur.

## Lancer en local

```bash
npm install
cp .env.example .env.local   # puis coller la clé GROQ_API_KEY
npm run dev                  # ouvre http://localhost:3000
```

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `AI_PROVIDER` | `groq` (par défaut) ou `anthropic` |
| `GROQ_API_KEY` | Clé Groq, créée sur https://console.groq.com/keys |
| `GROQ_MODEL` | Modèle Groq (par défaut `llama-3.3-70b-versatile`) |
| `ANTHROPIC_API_KEY` | Clé Claude, seulement si `AI_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | Modèle Claude (par défaut `claude-haiku-5-5`) |

## Mise en ligne sur Hostinger (offre Unlimited, Web apps)

1. Dans hPanel, créer une application Node.js et la relier à ce dépôt GitHub.
2. Commande de build : `npm run build`. Commande de démarrage : `npm start`.
3. Ajouter les variables d'environnement ci-dessus dans les réglages de l'application.
4. Relier le domaine `assistant-ucab.com` à l'application.

## Protection

- 15 questions par minute au maximum par visiteur.
- Messages limités à 600 caractères, historique limité aux 12 derniers messages.
