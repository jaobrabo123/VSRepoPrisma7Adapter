# Changelog

All notable changes to this project will be documented in this file.

(Português) Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

---

## [1.1.0] - 2026-09-04

### Added
- **Atomic and aggregation methods** — implements the 8 new abstract methods added to the `VSRepoAdapter` contract by `vsrepo` 2.1.0: `incrementOne`, `decrementOne`, `multiplyOne`, `divideOne`, `sum`, `average`, `min` and `max`
  - `incrementOne`/`decrementOne`/`multiplyOne`/`divideOne` translate directly into Prisma's native single-field atomic write (`data: { [field]: { increment: value } }`, etc.), evaluated server-side against the row's *current* value, not as a client-side read-modify-write. Prisma's `update()` already returns the row reflecting the state *after* the write, so no follow-up read is issued
  - `sum`/`average`/`min`/`max` translate into Prisma's `aggregate()` (`_sum`/`_avg`/`_min`/`_max`); the raw result (`number`, `bigint`, `Decimal`, or `null`) is normalized to `number | null`, returning `null` (not `0`) when no record matches, mirroring SQL's `SUM()`/`AVG()`/`MIN()`/`MAX()`
  - `Decimal` fields are fully supported: atomic `value`s are passed through to Prisma as-is, and aggregate results are always normalized to `number` via `.toNumber()`, never returned as a `Decimal` instance
  - New "Atomic and aggregation methods" section in `README.md`/`README.pt-BR.md`, plus JSDoc on every new method

### Changed
- **BREAKING (peer dependency):** the `vsrepo` peer dependency was bumped from `^2.0.0` to `^2.1.0` — the adapter now imports `NumericKeys`/`DecimalLike` types that only exist starting in `vsrepo` 2.1.0, and implements the new abstract methods required by that version's `VSRepoAdapter` contract

---

## [1.1.0] - 2026-09-04 (Português)

### Adicionado
- **Métodos atômicos e de agregação** — implementa os 8 novos métodos abstratos adicionados ao contrato do `VSRepoAdapter` pela `vsrepo` 2.1.0: `incrementOne`, `decrementOne`, `multiplyOne`, `divideOne`, `sum`, `average`, `min` e `max`
  - `incrementOne`/`decrementOne`/`multiplyOne`/`divideOne` traduzem direto pra escrita atômica nativa de campo único do Prisma (`data: { [field]: { increment: value } }`, etc.), avaliada server-side contra o valor *atual* do registro, e não como um read-modify-write no cliente. O `update()` do Prisma já retorna a linha refletindo o estado *após* a escrita, então nenhuma leitura extra é feita
  - `sum`/`average`/`min`/`max` traduzem pro `aggregate()` do Prisma (`_sum`/`_avg`/`_min`/`_max`); o resultado bruto (`number`, `bigint`, `Decimal`, ou `null`) é normalizado pra `number | null`, retornando `null` (não `0`) quando nenhum registro casa, espelhando o `SUM()`/`AVG()`/`MIN()`/`MAX()` do SQL
  - Campos `Decimal` são totalmente suportados: os `value`s atômicos são repassados pro Prisma como estão, e os resultados de agregação são sempre normalizados pra `number` via `.toNumber()`, nunca retornados como uma instância de `Decimal`
  - Nova seção "Métodos atômicos e de agregação" no `README.md`/`README.pt-BR.md`, além de JSDoc em cada novo método

### Alterado
- **BREAKING (peer dependency):** a peer dependency `vsrepo` foi elevada de `^2.0.0` pra `^2.1.0` — o adapter agora importa os tipos `NumericKeys`/`DecimalLike`, que só existem a partir da `vsrepo` 2.1.0, e implementa os novos métodos abstratos exigidos pelo contrato `VSRepoAdapter` dessa versão

---

## [1.0.3] - 2026-09-03

### Fixed
- `logSlowThresholdMs` option was missing from the runtime validation schema (`adapterConfigSchema`) — although the option was documented and consumed in the constructor since v1.0.1, it was not declared in the valibot schema, which could cause validation issues; the field is now properly validated as an optional positive number, and a default value of `300` is applied before passing it to `VSLogger`

---

## [1.0.3] - 2026-09-03 (Português)

### Corrigido
- A opção `logSlowThresholdMs` estava faltando no schema de validação em runtime (`adapterConfigSchema`) — embora a opção fosse documentada e consumida no construtor desde a v1.0.1, ela não estava declarada no schema valibot, o que poderia causar problemas de validação; o campo agora é validado corretamente como um número positivo opcional, e um valor padrão de `300` é aplicado antes de passá-lo ao `VSLogger`

---

## [1.0.2] - 2026-09-02

### Docs
- Documented how `deleteManyReturning` works — it fetches the records matching `where` via a `findMany` and then **re-applies the same `where`** to a `deleteMany` (Prisma has no native `deleteManyAndReturn`). Because the delete is driven by the `where` rather than the fetched records, a concurrent change between the two operations can make the returned records and the actually-deleted rows diverge (e.g. a row inserted after the `findMany` still gets deleted even though it wasn't returned; a row that stops matching before the `deleteMany` isn't deleted even though it was returned). Added guidance in the `README.md`/`README.pt-BR.md` (Transactions section) on running the method inside a `repository.transaction()` at a higher isolation level (e.g. `TransactionIsolationLevel.SERIALIZABLE`) to guarantee no concurrency issues, and updated the JSDoc of `deleteManyReturning` accordingly

---

## [1.0.2] - 2026-09-02 (Português)

### Documentação
- Documentado o funcionamento do `deleteManyReturning` — ele busca os registros que batem com o `where` via um `findMany` e depois **re-aplica o mesmo `where`** num `deleteMany` (o Prisma não tem um `deleteManyAndReturn` nativo). Como o delete é guiado pelo `where` — e não pelos registros buscados — uma alteração concorrente entre as duas operações pode fazer os registros retornados e as linhas realmente deletadas divergirem (ex.: uma linha inserida depois do `findMany` ainda é deletada mesmo sem ter sido retornada; uma linha que deixa de bater antes do `deleteMany` não é deletada mesmo tendo sido retornada). Adicionada orientação no `README.md`/`README.pt-BR.md` (seção Transactions) para rodar o método dentro de um `repository.transaction()` num nível de isolamento mais alto (ex.: `TransactionIsolationLevel.SERIALIZABLE`) para garantir que não haverá problemas de concorrência, e atualizado o JSDoc do `deleteManyReturning` de acordo

---

## [1.0.1] - 2026-09-02

### Fixed
- `merge` method now strips `undefined` fields from the source object before merging — previously, when merging entities without `relations` (`relations` config absent), `undefined` values from the source object were carried into the result, which could overwrite existing fields of the stored record with `undefined`
- Corrected the performance log texts — the start/end logs now read `run <method>` (e.g. `run findOne`) consistently across every method instead of the method name alone

### Added
- Documented provider-specific limitations in `README.md`/`README.pt-BR.md` — a table covering which Prisma features this adapter relies on aren't available on every provider (`mode: "insensitive"` for case-insensitive filters, `createManyReturning`/`updateManyReturning` for returning writes, and `skipDuplicates` on the `IgnoreConflicts` variants), noting these come from Prisma itself, not from the adapter
- Added a new `logSlowThresholdMs` option to the `VSRepoPrisma7Adapter` constructor config — the duration (in ms) above which a finished operation is logged as potentially slow, passed through to the internal `VSLogger`; defaults to `300ms`, complementing the existing `logLevel` option for performance monitoring

---

## [1.0.1] - 2026-09-02 (Português)

### Corrigido
- O método `merge` agora remove campos com valor `undefined` do objeto de origem antes de mesclar — antes, ao mesclar entidades sem `relations` (config de `relations` ausente), valores `undefined` do objeto de origem eram propagados para o resultado, o que poderia sobrescrever campos existentes do registro salvo com `undefined`
- Corrigidos os textos dos logs de performance — os logs de início/fim agora leem `run <método>` (ex.: `run findOne`) de forma consistente em todos os métodos, em vez de apenas o nome do método

### Adicionado
- Documentadas as limitações por provider no `README.md`/`README.pt-BR.md` — uma tabela cobrindo quais recursos do Prisma que esse adapter usa não estão disponíveis em todos os bancos (`mode: "insensitive"` para filtros case-insensitive, `createManyReturning`/`updateManyReturning` para escritas com retorno, e `skipDuplicates` nas variantes `IgnoreConflicts`), destacando que essas limitações vêm do próprio Prisma, não do adapter
- Adicionada uma nova opção `logSlowThresholdMs` na config do construtor do `VSRepoPrisma7Adapter` — a duração (em ms) acima da qual uma operação finalizada é logada como potencialmente lenta, repassada ao `VSLogger` interno; o default é `300ms`, complementando a opção `logLevel` já existente para monitoramento de performance

---

## [1.0.0] - 2026-08-31

> First official release. `@vsrepo/prisma7-adapter` is the officially published `VSRepoAdapter` implementation for [VSRepository v2](https://github.com/jaobrabo123/VSRepository), backed by [Prisma 7](https://www.prisma.io/).

### Added
- **Full `VSRepoAdapter` implementation** — translates every `VSRepository` operation into Prisma Client calls, backed by Prisma 7
- **Where/ordering parsing** — resolves `VSRepoWhere`, `Ordering` and case-insensitive filters (`IgnoreCase`) through dedicated parsers (`parsePrismaWhere`)
- **`select` support** — transforms method-options `select` into a Prisma `select` in read operations (`parsePrismaSelect`)
- **`relations` in method options (read)** — eager loading shape `{ field: true }` / `{ field: { sub: true } }` (nested) transformed into a Prisma `include` (`parsePrismaInclude`); the `include` is discarded when a `select` is provided (Prisma doesn't combine `include` and `select`)
- **`relations` in the constructor (write)** — describes each relation field (`mode: "oto" | "mto" | "otm" | "mtm"`, `restriction: "add" | "set"`, `pk`, `nullable`) so `create`/`update`/`upsert`/`save`/`merge` payload relation fields are resolved into Prisma nested writes (`create`/`connectOrCreate`/`upsert`/`disconnect`/`delete`/`deleteMany`/`set`) — the same behavior the v1 of VSRepository had
- **Full base method support** — `findOne`, `findOneOrThrow`, `findMany`, `save` (create/upsert), `saveMany`, `delete`, `deleteMany`, `deleteManyReturning`, `update`, `updateMany`, `updateManyReturning`, `count`, `exists`, `create`, `createMany`, `createManyReturning`, `merge`, `upsert`
- **`createManyReturning` / `updateManyReturning` / `deleteManyReturning`** — returning writes built on Prisma's `createManyAndReturn`/`updateManyAndReturn`, re-querying the affected rows by primary key via a second `findMany`, with `select`/`include` support and respect for the `order` option
- **Error mapping** — every Prisma/ORM error is mapped and always re-thrown as `VSRepoAdapterError`, carrying the original ORM error and a dedicated `AdapterErrorCode`
- **Config validation** — the constructor config (`tableName`, `pkName`, `relations`, `logLevel`) is validated at runtime with [valibot](https://valibot.dev/); an invalid value throws a `VSRepoPrisma7AdapterError` naming the offending field
- **Transactions** — every method accepts `options.db`; multi-operation methods (`saveMany`, `updateManyReturning`, `createManyReturning`, `deleteManyReturning`) go through `runTransactional`, reusing an already-active transaction client (detected by the `$on` method) instead of nesting a new one
- **`Prisma7OrmTypes<DB, TX>` / `Prisma7ClientLike`** — type helpers that tie `VSRepository`'s `getDbClient()`/`transaction()` return types to your real, generated Prisma types
- **Logging** — uses `VSLogger` internally: a `DEBUG` line with the resolved Prisma arg per method plus start/end performance logs (WARN on slow operations), controlled by the `logLevel` constructor option
- **Nested-write validation** — `createMany`/`createManyReturning`/`updateMany`/`updateManyReturning` only accept scalar fields; a payload containing a configured relation field throws a `VSRepoPrisma7AdapterError`
- **Build & pack** — `tsc` build to `dist/`, npm `prepack` build, `clean`/`build`/`typecheck` scripts, and `files` whitelisting for publishing (commonly CommonJS output)
- **CI workflow** — GitHub Actions (`.github/workflows/ci.yml`)
- **Tests** — implementation tests for the adapter and integration tests with `VSRepository` (including dynamic and query methods), plus `example.ts` usage example
- **Documentation** — `README.md`/`README.pt-BR.md` (English + Portuguese) covering installation, basic usage, the constructor config, the two `relations` (`write` vs `read`), `merge`, transactions, logging, requirements, and full JSDoc on the public API surface (marked `@publicApi`), plus a downloads badge

---

## [1.0.0] - 2026-08-31 (Português)

> Primeira release oficial. `@vsrepo/prisma7-adapter` é a implementação oficial publicada de `VSRepoAdapter` para o [VSRepository v2](https://github.com/jaobrabo123/VSRepository), usando [Prisma 7](https://www.prisma.io/).

### Adicionado
- **Implementação completa de `VSRepoAdapter`** — traduz toda operação do `VSRepository` em chamadas do Prisma Client, usando Prisma 7
- **Parsing de where/ordering** — resolve `VSRepoWhere`, `Ordering` e filtros case-insensitive (`IgnoreCase`) através de parsers dedicados (`parsePrismaWhere`)
- **Suporte a `select`** — transforma o `select` das options dos métodos num `select` do Prisma nas operações de leitura (`parsePrismaSelect`)
- **`relations` nas options (leitura)** — eager loading com a forma `{ campo: true }` / `{ campo: { sub: true } }` (aninhado) transformado num `include` do Prisma (`parsePrismaInclude`); o `include` é descartado quando um `select` é fornecido (o Prisma não combina `include` e `select`)
- **`relations` no construtor (escrita)** — descreve cada campo de relação (`mode: "oto" | "mto" | "otm" | "mtm"`, `restriction: "add" | "set"`, `pk`, `nullable`) para que os campos de relação dos payloads de `create`/`update`/`upsert`/`save`/`merge` sejam resolvidos em nested writes do Prisma (`create`/`connectOrCreate`/`upsert`/`disconnect`/`delete`/`deleteMany`/`set`) — o mesmo comportamento que a v1 do VSRepository tinha
- **Suporte completo aos métodos base** — `findOne`, `findOneOrThrow`, `findMany`, `save` (create/upsert), `saveMany`, `delete`, `deleteMany`, `deleteManyReturning`, `update`, `updateMany`, `updateManyReturning`, `count`, `exists`, `create`, `createMany`, `createManyReturning`, `merge`, `upsert`
- **`createManyReturning` / `updateManyReturning` / `deleteManyReturning`** — escritas com retorno baseadas nos `createManyAndReturn`/`updateManyAndReturn` do Prisma, re-buscando as linhas afetadas pela primary key num segundo `findMany`, com suporte a `select`/`include` e respeito à opção `order`
- **Mapeamento de erros** — todo erro de Prisma/ORM é mapeado e sempre relançado como `VSRepoAdapterError`, carregando o erro original do ORM e um `AdapterErrorCode` dedicado
- **Validação de config** — a config do construtor (`tableName`, `pkName`, `relations`, `logLevel`) é validada em runtime com [valibot](https://valibot.dev/); um valor inválido lança um `VSRepoPrisma7AdapterError` apontando o campo problemático
- **Transactions** — todos os métodos aceitam `options.db`; métodos com múltiplas operações (`saveMany`, `updateManyReturning`, `createManyReturning`, `deleteManyReturning`) passam por `runTransactional`, reaproveitando um transaction client já ativo (detectado pelo método `$on`) em vez de aninhar uma nova
- **`Prisma7OrmTypes<DB, TX>` / `Prisma7ClientLike`** — helpers de tipo que amarram os tipos de retorno de `getDbClient()`/`transaction()` do `VSRepository` aos seus tipos reais e gerados do Prisma
- **Logging** — usa o `VSLogger` internamente: uma linha `DEBUG` com o arg resolvido do Prisma por método e logs de performance de início/fim (WARN pra operações lentas), controlado pela opção `logLevel` do construtor
- **Validação de nested writes** — `createMany`/`createManyReturning`/`updateMany`/`updateManyReturning` só aceitam campos escalares; um payload contendo um campo de relação configurado lança um `VSRepoPrisma7AdapterError`
- **Build & pack** — build com `tsc` para `dist/`, `prepack` de build no npm, scripts `clean`/`build`/`typecheck`, e whitelist de `files` para publicação (saída CommonJS)
- **Workflow de CI** — GitHub Actions (`.github/workflows/ci.yml`)
- **Testes** — testes de implementação para o adapter e testes de integração com o `VSRepository` (incluindo dynamic e query methods), além do exemplo de uso `example.ts`
- **Documentação** — `README.md`/`README.pt-BR.md` (inglês + português) cobrindo instalação, uso básico, config do construtor, os dois `relations` (escrita vs leitura), `merge`, transactions, logging, requisitos e JSDoc completa na API pública (marcada com `@publicApi`), além do badge de downloads

---
