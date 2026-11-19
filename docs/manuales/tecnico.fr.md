# Yupiii · Manuel technique (résumé, Français)
La version complète, en espagnol, se trouve dans `docs/ARQUITECTURA.md` et `docs/DESPLIEGUE.md`.
- **Pile technique :** React Router v8 (SSR) sur Cloudflare Workers ; Supabase (PostgreSQL + Auth) avec RLS sur toutes les tables ; fichiers dans Cloudflare R2 (URL présignées, téléchargements contrôlés par le Worker) ; i18n via i18next (`app/locales/{es,ht,fr}`).
- **Sécurité :** les autorisations sont appliquées par PostgreSQL. Les étudiants écrivent seulement via des fonctions RPC contrôlées. Les clés de correction sont invisibles pour eux. Un audit est tenu et les secrets restent hors de git.
- **Tests :** `npm test` (Vitest), `npm run test:db` (tests RLS) et `npm run typecheck`. Ils sont exécutés en CI GitHub.
- **Déploiement :** `npm run deploy:production`. Retour arrière : `wrangler rollback`. Les migrations ne vont que vers l'avant.
