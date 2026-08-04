---
name: rnc-modernize
description: >
  Conduz a modernização de um sistema legado analisado no RNC — do workspace até
  a aplicação nova, rastreável até a regra de origem. Entrevista curta, extração
  determinística das regras, gate para o que é ambíguo, escolha de arquitetura e
  verificação executada. Use quando pedirem para modernizar legado, migrar de
  Delphi/VB6/COBOL/NATURAL/Java antigo, gerar app a partir de workspace RNC, ou
  quando disserem "/rnc-modernize", "moderniza meu legado", "trabalhar com o RNC".
---

# Modernizar um legado do RNC

Você conduz. O usuário decide. O `rnc` fornece os fatos e julga o resultado —
ele não manda em você, e você não improvisa o que ele já resolve.

**Princípio: o legado é a fonte da verdade, não a sua intuição sobre ele.**
Cada regra que sobreviver precisa apontar para a regra de origem no código
antigo. Se a semântica for ambígua, isso vira pergunta — nunca palpite.

## Antes de começar

Verifique o essencial (uma vez, silenciosamente):

```bash
rnc doctor
```

Sem o `rnc` no PATH: `npm i -g @skalena/rnc`.
Sem autenticação: `rnc mcp login` (device pairing; se o deployment não tiver,
ele pede o token do web app com colagem oculta).

## Fase 1 — Qual legado

Nunca peça um UUID. Liste o que existe e deixe escolher:

```bash
rnc workspaces --list
```

Apresente as opções com `AskUserQuestion` usando nome · linguagem · nº de
módulos, porque o mesmo sistema costuma ser ingerido mais de uma vez e a lista
fica ilegível sem isso.

## Fase 2 — Extrair (determinístico, não invente)

```bash
rnc analyze --workspace <nome>
rnc spec
```

Isso produz `.rnc/analysis.json` (o IR) e `docs/functional/` — stack-neutros e
rastreáveis. **Não escreva esses documentos à mão**: eles são a linha de base
que o juiz usa depois; um texto que você inventou faz o `trace` perder o
referencial.

Relate o que saiu em números reais (módulos, regras, entidades, tech-debt) e a
ordem de build por blast-radius. Um legado de 79 módulos com 1699 regras não se
moderniza inteiro de uma vez — se for grande, ofereça fatiar por bounded
context antes de seguir.

## Fase 3 — Gate do ambíguo

```bash
rnc clarify
```

Cada ponto aqui é uma dúvida que o RNC **não conseguiu** resolver sozinho:
regra ambígua, fonte descartada, binding de baixa confiança. Leve ao usuário as
de impacto alto, uma por vez, com a origem. Quem responde é o negócio.

O que ficar sem resposta vira `[PRESUMIDO]` explícito no código e na
traceability — nunca uma suposição silenciosa.

**Não gere código de domínio com dúvida ALTA em aberto.**

## Fase 4 — Contrato

```bash
rnc api gen      # esqueleto determinístico: entidades, erros, CRUD, auth
rnc api check    # juiz
```

O esqueleto pertence ao `rnc` — **não reescreva o arquivo inteiro**, senão
frontend e backend passam a ser construídos contra contratos diferentes. Seu
trabalho é enriquecer *dentro* dele, nos pontos `x-rnc-agent-fill`: operações
semânticas, shapes custom e `examples` com valores reais (que viram as fixtures
do contract-test).

## Fase 5 — Arquitetura

Pergunte com `AskUserQuestion`, recomendando com base nos números medidos:

```bash
rnc stack --golden                                  # Next monorepo + SQLite, sem docker
rnc stack --front vue --back quarkus --db postgres  # polyglot → docker-compose
rnc runtime up
```

Frontends: `next` `vue` `angular` · Backends: `next-api` `springboot` `quarkus`
`dotnet` `flask` `go` · Bancos: `postgres` `mysql` `mongo` `sqlite`.

## Fase 6 — Construir, marco a marco

```bash
rnc implement --list    # a escada derivada do IR + stack
```

Implemente **um marco por vez**, com a Definition of Done do próprio marco.
Domínio antes de UI: regra de negócio nasce na camada de domínio, nunca dentro
de componente — senão você recriou o monólito que estava modernizando.

Ao escrever regra de domínio, use `rnc-provenance`. Ao escrever qualquer
código, `rnc-guardrails` vale sempre.

> Não rode `rnc implement <M>` de dentro desta sessão: ele dispara **outro**
> agente headless e causa recursão. Ele é o modo de fora-para-dentro (CI/batch).
> Aqui, você implementa.

## Fase 7 — Verificar (não alegar)

```bash
rnc verify          # gates do projeto + trace + DoD do marco
rnc trace --check   # drift código ↔ spec ↔ RNC (exit 1)
```

Use `rnc-verify` para a disciplina completa. Regra curta: **nada é dado como
pronto sem o comando ter rodado e passado.** Relate falha com a saída real.

## Zoom no legado

O `rnc` entrega o mapa (bulk, determinístico). Para detalhe de um módulo
específico enquanto codifica, use as tools do MCP server `rnc`:
`getModuleRules`, `getModuleDataModel`, `getUirModule`, `getModuleScreens`.

Precisa do token para o MCP: `export RNC_TOKEN=$(rnc mcp token)`.

## O que não fazer

- Escrever `docs/functional/` ou `openapi.yaml` do zero — quebra a linha de base do juiz.
- Pular o `clarify` e adivinhar semântica de regra.
- Marcar marco como pronto sem `rnc verify` ter passado.
- Tratar o `rnc` como dono do processo: quem conduz é você, com o usuário decidindo.
