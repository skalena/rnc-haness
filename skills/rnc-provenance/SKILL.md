---
name: rnc-provenance
description: >
  Como escrever regra de negócio migrada de um legado de forma auditável: cada
  invariante cita a regra de origem, o incerto é marcado em vez de adivinhado, e
  o drift quebra o CI. Use ao portar regra de sistema legado, escrever camada de
  domínio a partir de spec derivada do RNC, decidir o que fazer com semântica
  ambígua, ou quando aparecerem identificadores como BR-NNN, INV-NN, [PRESUMIDO].
---

# Proveniência de regra de negócio

Numa modernização, o entregável não é só código que funciona — é **prova de que
a regra sobreviveu**. Sem isso ninguém consegue auditar a migração, e o risco
real do projeto (perder regra de negócio em silêncio) fica invisível.

## A cadeia

```
BR-NNN                INV-NN                  código                 teste
regra no legado  →   invariante na spec  →   implementação     →   verificação
(RNC extraiu)        (docs/functional)       (cita ambos)          (por invariante)
```

Cada elo cita o anterior. `rnc trace --check` percorre a cadeia e falha quando
um elo se solta.

## Ao implementar uma regra

Cite a origem no código, junto da regra:

```ts
/** INV-03 — movimento de estoque exige transação e lock do agregado raiz.
 *  Origem: BR-031 (DataMod.pas). Confiança RNC: baixa — ver [PRESUMIDO] abaixo. */
```

Antes de escrever, confirme a semântica na fonte em vez de inferir do nome:

```
getModuleRules(<módulo>)      # a regra como o RNC extraiu
getModuleDataModel(<módulo>)  # tipos e campos reais
```

Um nome de campo (`DISCOUNT`, `BACKORD`) não diz se é fração ou valor absoluto,
nem se aceita negativo. Isso é exatamente o que se perde numa reescrita.

## Quando a semântica é ambígua

Não escolha por conta. Marque de forma que apareça depois:

```ts
// [PRESUMIDO] DISCOUNT tratado como fração (0,10 = 10%).
// Fonte descartada no RNC — confirmar com o negócio antes do go-live.
```

E registre em `docs/functional/06-traceability.md`. `rnc trace` conta os
`[PRESUMIDO]` e os reporta como bloqueio de go-live — é assim que a dúvida
continua visível em vez de virar bug daqui a seis meses.

Regra prática: **incerteza declarada custa uma linha; incerteza silenciosa
custa um incidente.**

## Invariante mora no servidor

Validação de UI é conveniência, não garantia — a rota é alcançável por POST
direto. Todo invariante é aplicado na camada de domínio, e o teste prova isso
chamando o domínio, não a tela.

## Regras que não devem sobreviver

Boa parte do legado é plumbing (handler de evento, estado de dataset,
habilitação de botão) sem contraparte no alvo. Descartar é correto — mas
**registre a decisão** em traceability. "327 regras → 9 invariantes" só é
defensável se as 318 restantes tiverem motivo escrito.

## Verificar

```bash
rnc trace --check
```

Pega: INV citando BR que não existe no IR, código citando INV ausente da spec,
`[PRESUMIDO]` pendente, dúvida de impacto alto em aberto.
