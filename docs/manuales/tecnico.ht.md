# Yupiii · Manyèl teknik (rezime, Kreyòl Ayisyen)
> Vèsyon konplè a an panyòl nan `docs/ARQUITECTURA.md` ak `docs/DESPLIEGUE.md`. Tradiksyon sa a dwe revize pa yon moun ki pale kreyòl natif natal.
- **Teknoloji:** React Router v8 (SSR) sou Cloudflare Workers; Supabase (PostgreSQL + Auth) ak RLS sou tout tab yo; fichye nan Cloudflare R2; tradiksyon ak i18next (`app/locales/{es,ht,fr}`).
- **Sekirite:** se PostgreSQL ki aplike pèmisyon yo. Elèv yo ekri sèlman atravè fonksyon RPC kontwole. Elèv yo pa ka wè bon repons yo. Gen odit, epi kle sekrè yo pa janm nan git.
- **Tès:** `npm test`, `npm run test:db` ak `npm run typecheck`, egzekite otomatikman sou GitHub.
- **Deplwaman:** `npm run deploy:production`. Pou retounen nan yon vèsyon anvan: `wrangler rollback`.
