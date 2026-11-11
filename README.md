# Assistant UCAB Dakar

Assistant virtuel de l'Université Cheikh Ahmadou Bamba, centre de Dakar (Fass Mbao).
Il répond aux futurs bacheliers, aux étudiants et aux parents, en français et en arabe,
à partir des documents de l'université.

## Comment ça marche

- **Front et back dans un seul projet Next.js** (TypeScript).
  - `src/components/Chat.tsx` : l'interface (reprise de la maquette validée).
  - `src/app/api/chat/route.ts` : le serveur qui reçoit la question et interroge l'IA.
- **Espace administration** : `/admin` (2 comptes au maximum).
  - Tableau de bord : visiteurs, questions, sujets, heures d'affluence, langue, appareil.
  - Documents : on ajoute un PDF, un Word (.docx) ou une photo d'un document papier.
    Le texte est lu automatiquement (lecture des photos en français et en arabe).
  - Questions sans réponse : ce que l'assistant n'a pas trouvé dans les documents.
- **Base de connaissances** : les documents ajoutés dans l'espace administration.
  L'assistant ne répond qu'avec ce qui y est écrit. Au premier démarrage, les fichiers
  du dossier `knowledge/` deviennent les premiers documents ; on peut ensuite les supprimer
  ou les remplacer depuis `/admin`. Quand il y a beaucoup de documents, seuls les passages
  utiles à la question sont envoyés à l'IA.
- **Données** : une base SQLite (intégrée à Node.js, rien à installer) et les fichiers envoyés,
  dans le dossier `data/` (ou `DATA_DIR`). Ce dossier n'est pas dans GitHub.
- **IA** : Groq (offre gratuite) par défaut. On peut passer à Claude (payant) en changeant
  la variable `AI_PROVIDER`. Les clés restent sur le serveur, jamais dans le navigateur.

## Lancer en local

```bash
npm install
cp .env.example .env.local   # puis coller la clé GROQ_API_KEY
npm run dev                  # ouvre http://localhost:3000
```

L'espace administration est sur http://localhost:3000/admin. Le premier compte est créé
avec `ADMIN_EMAIL` et `ADMIN_PASSWORD` ; le second s'ajoute depuis l'écran « Comptes ».

Node.js 22.13 ou plus récent est nécessaire (pour la base SQLite intégrée).

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `AI_PROVIDER` | `groq` (par défaut) ou `anthropic` |
| `GROQ_API_KEY` | Clé Groq, créée sur https://console.groq.com/keys |
| `GROQ_MODEL` | Modèle Groq (par défaut `openai/gpt-oss-120b`) |
| `ANTHROPIC_API_KEY` | Clé Claude, seulement si `AI_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | Modèle Claude (par défaut `claude-haiku-5-5`) |
| `ADMIN_EMAIL` | E-mail du premier compte administrateur |
| `ADMIN_PASSWORD` | Son mot de passe (8 caractères au moins), à changer ensuite dans « Comptes » |
| `ADMIN_NAME` | Nom affiché (par défaut « Référent UCAB ») |
| `DATA_DIR` | Dossier de la base et des fichiers (par défaut `./data`) |
| `SESSION_SECRET` | Facultatif : clé des sessions. Sinon, une clé est créée dans `DATA_DIR` |

## Mise en ligne sur Hostinger (offre Unlimited, Web apps)

1. Dans hPanel, créer une application Node.js (version 22 ou plus) et la relier à ce dépôt GitHub.
2. Commande de build : `npm run build`. Commande de démarrage : `npm start`.
3. Ajouter les variables d'environnement ci-dessus dans les réglages de l'application.
4. Choisir pour `DATA_DIR` un dossier qui n'est pas effacé à chaque mise à jour du site
   (par exemple un dossier à côté de l'application), sinon les documents et les statistiques seraient perdus.
5. Relier le domaine `assistant-ucab.com` à l'application.

## Protection

- 15 questions par minute au maximum par visiteur.
- Messages limités à 600 caractères, historique limité aux 12 derniers messages.
- Espace admin : mots de passe chiffrés (scrypt), session signée de 7 jours,
  10 essais de connexion au maximum par quart d'heure, page non indexée par Google.
