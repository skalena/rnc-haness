---
name: rnc-guardrails
description: >
  Armadilhas caras já descobertas em modernizações reais — dinheiro em float,
  build que exige banco, endpoint alcançável sem auth, corrida em movimento de
  estoque, componente falando direto com o banco, contador silenciosamente
  zerado. Use ao escrever schema, camada de domínio, Server Action, endpoint,
  query ou migração num projeto derivado de legado.
---

# Guardrails de modernização

Cada item aqui custou caro numa migração real. São falhas **silenciosas** — o
código roda, o teste passa, o erro aparece em produção ou na conciliação.

## Dinheiro nunca em float

O legado usava `FLOAT` para valor monetário; é a causa raiz de divergência de
centavos que ninguém consegue explicar depois.

- banco: `numeric(12,2)` — nunca `float`/`double`/`real`
- aplicação: `Decimal` (decimal.js, BigDecimal, decimal.Decimal), arredondamento half-up
- contrato: string decimal, nunca `type: number`

## Build não pode exigir banco

Conexão criada na avaliação do módulo faz o build de produção falhar ao coletar
dados de página, com uma mensagem que não aponta a causa. Crie a conexão sob
demanda (lazy/Proxy). O build tem de rodar sem `DATABASE_URL`.

## Fail-closed: autentique antes de validar

Server Action e route handler são alcançáveis por POST direto, não só pela sua
UI. Sem verificação, qualquer um cria pedido, mexe em estoque e apaga cadastro
sem passar por tela nenhuma.

Autentique **antes** de validar o payload — senão as mensagens de erro de campo
revelam o schema para um anônimo. Sem provedor configurado, recuse (503), não
libere.

## Mutação de saldo exige lock do agregado raiz

Transação sozinha não basta. Duas requisições paralelas que leem
`max(line_no)+1` colidem na unique, e o usuário vê "unique violation" onde
deveria ver "estoque insuficiente".

Trave a raiz do agregado (`SELECT ... FOR UPDATE`) antes de tocar linhas ou
saldo, com **ordem de lock estável** (pedido → itens por id) para não deadlockar.

O teste que prova isso precisa de banco real concorrente: PGlite é
single-connection e passa mesmo com o bug. N requisições paralelas na mesma
peça → exatamente os sucessos que o estoque permite, o resto rejeitado, saldo
final íntegro.

## Nenhum componente fala com o banco

Regra de negócio dentro de componente recria o monólito que você está
modernizando — blast radius máximo, impossível de testar isolado. Domínio
concentra as regras; a camada de ação só orquestra transação e revalidação.

## Subquery correlacionada em SQL cru

Template de SQL cru costuma renderizar a coluna **sem qualificar a tabela**, e o
banco resolve para a tabela errada. A condição vira sempre-falsa: contador
zerado, **sem erro e sem aviso**.

Use o helper de contagem do ORM, ou qualifique a tabela em toda coluna. E teste
com mais de um registro — um contador quebrado devolve 0, e `toBe(1)` pode
passar por acidente.

## Saldo derivado tem de reconciliar

Se existe razão (movimentos) e saldo materializado, eles precisam bater. Popular
o saldo por `INSERT` direto fura o razão: `sum(movimentos) ≠ saldo`. Crie o
saldo inicial **pela camada de domínio**, como um movimento. Verifique por query.

## Índice se mede, não se adivinha

Decida sob `EXPLAIN` com volume realista. `ilike '%termo%'` não usa btree —
precisa de índice trigrama (que o gerador de migração normalmente não emite:
adicione o `CREATE EXTENSION` à mão). Índice não usado é custo de escrita puro:
verifique o uso antes de manter.

## Toast não pode cobrir botão de ação

Notificação empilhada sobre a barra de ações **intercepta o clique**. Quem clica
rápido bate na parede. Só o E2E em navegador real pega isso.
