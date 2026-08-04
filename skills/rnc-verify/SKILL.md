---
name: rnc-verify
description: >
  Disciplina de verificação num projeto derivado de legado: rodar o comando em
  vez de alegar, provar o valor em vez do status, e aceitar um juiz externo que
  você não controla. Use antes de dar um marco como pronto, ao rodar rnc verify
  ou rnc trace, ao interpretar falha de gate, ou quando for reportar progresso.
---

# Verificação

Duas regras curtas, e a segunda é a difícil:

1. **Rodar, não alegar.** "Deve funcionar" não é resultado. Ou o comando rodou e
   passou, ou o marco não está pronto.
2. **Réu não julga o próprio caso.** Você escreveu o código; quem decide se ele
   bate com a spec é um checador determinístico externo.

## Os comandos

```bash
rnc verify          # gates do projeto (typecheck/lint/test/build) + trace + DoD do marco
rnc trace --check   # drift código ↔ spec ↔ RNC — exit 1
rnc api check       # juiz do contrato OpenAPI
```

Rode antes de reportar qualquer marco. Se falhar, o marco não avança —
conserte, não contorne.

## Por que o juiz é externo

Verificação que o próprio autor controla não é verificação. Se você decide se
passou, a garantia vale zero — e numa modernização auditada (regulado,
financeiro) é justamente a verificação independente que é o produto.

Daí a consequência prática: **não ajuste a spec para o código passar.** Se
`trace` acusa que o código cita um `INV` que não existe na spec, a pergunta é
qual dos dois está errado — muitas vezes é o código. Editar a spec para
silenciar o juiz destrói a garantia que ele existe para dar.

## Provar o valor, não o status

`200 OK` não prova que o relatório está certo. Extraia o conteúdo e confira
contra o banco: se a fatura diz `A pagar R$ 204,15`, a soma no banco tem de dar
exatamente isso. `%PDF-` no cabeçalho não é verificação.

O mesmo vale para contadores, totais e saldos: compare com a fonte, com mais de
um registro (um contador quebrado devolve 0, e um teste com um registro só pode
passar por acidente).

## O que cada camada tem de provar

| Camada | Prova |
|---|---|
| domínio | invariante aplicado no servidor, teste por INV |
| concorrência | banco **real** (Testcontainers/Postgres); PGlite é single-connection e não pega corrida |
| costura | contract-test do OpenAPI, usando os `examples` como fixture |
| fluxo | E2E em navegador real — pega o que unidade não pega (ex.: toast interceptando clique) |
| performance | `EXPLAIN` com volume realista, não intuição |

## Ao reportar

Diga o que rodou e o que saiu. Se um teste falhou, mostre a saída. Se um passo
foi pulado, diga qual e por quê. Marco parcialmente pronto é marco não pronto —
e escolher reduzir escopo é decisão do usuário, não sua.

Quando algo passou de verdade, diga sem hedge: rodou, passou, aqui está o número.
