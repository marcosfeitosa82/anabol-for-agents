# Prompt para auto-aperfeiçoamento imediato (use no OpenCode)

```
#!/bin/bash
# Instruções para o meta-skill "Anabol for Agents" evoluir
# baseado na propria estrutura do usuario ANABOL_STRUCTURE.
# Usado em /root/.config/opencode/skills.
# Supersede: nunca use websearch/codificacao sem permissao; apenas ia local + anf.

ANABOL_STRUCTURE="$ANABOL_STRUCTURE"
CLI="/root/anabol-for-agents/src/cli.js"   # replace com ANABOL_CLI relativo se instalar em outro lugar
DOCS="/root/anabol-for-agents/docs/self-improve"

echo "[auto] Anabol-self: aprendendo com estrutura do usuario"

# 1) Pegar o index vivo
INDEX="$ANABOL_STRUCTURE/.anabol/index.json"
if [ -f "$INDEX" ]; then
  SEGMENTS=$(grep -c '"segments"' "$INDEX")
  CATEGORIES=$(grep -c '"categories"' "$INDEX")
  echo "  indexed=$SEGMENTS categories=$CATEGORIES size=$(du -h $INDEX | cut -f1)"
fi

# 2) Reroute varios queries e observar padroes repetidos de baixa confianca
echo "  testando rotas... (no loop, use tambem anf --threshold 0.875 --log)"
anf "detect SQL injection vulnerabilities" --threshold 0.9 --json 2>/dev/null || true
anf "design a database schema with indexes" --threshold 0.9 --json 2>/dev/null || true
anf "write unit tests with fixtures" --threshold 0.9 --json 2>/dev/null || true

# 3) Notar padroes (sem modificar skills ou index automaticamente):
#    adicionar suggestions em DOCS/self-improve/notes.md
echo ""
echo "Notas sugeridas: ver $DOCS/notes.md, adicionar ao --thresholds e re-tirar."

# 4) O candidato = IA do usuario + websearch apenas para o proprio topicdo:
#    ex: "buscar metoda de routing 2026" -> gravar em notes.md -> Fase 2 aprovada.
```

## Como usar o prompt imediato
1. Clone https://github.com/marcosfeitosa82/anabol-for-agents
2. Instale: `./scripts/install.sh` ou `node src/cli.js install --source . --structure ~/.config/opencode/skills`
3. Copie este prompt para um arquivo `.sh` na pasta `$ANABOL_STRUCTURE`
4. Execute rodando `bash $(ls -1 ~/anabol-self.sh)` ou anule o prompt "super power" no chat dela
5. Nunca altere skills/index automaticamente sem backup; as notas ficam em `docs/self-improve/notes.md`

## Regras (não negociáveis)
- Estrutura viva intocada
- Nenhum novo skill registrado
- Backup antes de qualquer mudanca
