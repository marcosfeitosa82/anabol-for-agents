# Notas de auto-aperfeiçoamento — Fase 1 (pesquisa)
Status: PESQUISA COMPLETA — aguardando aprovação do usuário para Fase 2.
Data: 2026-11-03
Email de contato: anabolforagent@gmail.com
Repo: https://github.com/marcosfeitosa82/anabol-for-agents (publico)

---

## Descobertas relevantes (websearch 2026-11-03)

### 1. Meta Context Engineering (MCE) — bi-level optimization
Fonte: https://co-r-e.com/method/meta-context-engineering-skill-evolution
- Conceito: otimização de nível duplo (outer = skill que maximiza contexto; inner = melhor função de contexto).
- Aplicação ao Anabol: nosso `anf` (find) já opera como um router. A Fase 2 pode incluir uma seção `self-improvement` no `SKILL.md` que descreve como o router pode aprender com histórico de uso (`find` repetido com thresholds baixos).
- Nenhum arquivo novo; apenas descrição no segmento existente.

### 2. Skill-MAS (Meta-Skill evolvível)
Fonte: https://arxiv.org/html/2606.18837v1 / https://linhh29.github.io/blog/Skill-MAS/index.html
- Meta-agent com meta-skill (`SKILL.md`) refinado por rollout e reflexão.
- Aplicação: nosso `anabol-orchestrator` já é uma meta-skill. Podemos adicionar uma seção `self-improvement` descrevendo como o meta-agente pode fazer "rollout" local (simular queries com casos de teste) e refletir (
comparar resultados com o `routing-cases-fixture.json`).
- Nenhuma alteração no `.gitignore`, `.github/workflows/ci.yml`, ou testes congelados.

### 3. Context Engineering (2026 — LinkedIn / Medium)
Fonte: https://www.linkedin.com/posts/pawel-huryn_in-2026-everyone-in-ai-is-talking-about-activity-7413142652667359232-XJ57 / https://medium.com/@techlatest.net/50-opencode-skills-worth-installing-in-2026-the-definitive-curated-list-47c6ae4fbdb5
- Tendência: skills são "micro-prompts" e descrições de ferramentas são frequentemente insuficientes.
- Aplicação: melhorar as descrições dos segmentos (`SKILL.md`) com referência a `docs/architecture.md`, `docs/how-it-works.md`, e `tests/fixtures/` — sem criar novos skills, apenas enriquecendo o texto existente.

### 4. Overlapping skills / router conservador
Fonte: https://community.openai.com/t/how-do-you-handle-overlapping-codex-skills-in-larger-skill-catalogs/1383626
- Padrão seguro: uma entrada define precedência, manifestos de skill definem limites, overlay local define verdade local, router escolhe dono principal, trace explica decisão.
- Aplicação direta ao nosso projeto: nosso `router` (`find`) já implementa grande parte disso. A Fase 2 pode documentar esse padrão no `SKILL.md` como "self-improvement reference".

---

## Proposta para Fase 2 (segmento interno — NÃO aplicado ainda)
- Arquivo a ser modificado: `skills/anabol-orchestrator/SKILL.md` (linha nova, não arquivo novo).
- Conteúdo sugerido (seção `self-improvement`):
  - Descrição do padrão de router conservador (como no item 4).
  - Referência ao `docs/architecture.md` e `docs/audit-comparative.md`.
  - Nota sobre o uso de `ANABOL_STRUCTURE` para ler o índice vivo (`.anabol/index.json`).
- Nenhuma alteração no `tests/unit/eval-routing.test.js` (holdout congelado).
- Nenhuma alteração no `.superpowers/` (não rastreado, conforme `.gitignore`).

---

## Confirmação necessária do usuário
Diga:
- `aprovar fase 2` para eu criar o segmento `self-improvement` dentro do `SKILL.md`.
- `manter fase 1 apenas` se quiser só guardar as notas sem modificar código.
- `rejeitar` se algo precisar ser removido.

Não vou alterar `main`, `skills/`, ou `.anabol/` sem seu sinal explícito.
