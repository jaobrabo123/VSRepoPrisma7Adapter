<div align="center">
  <img src="https://res.cloudinary.com/ddbfifdxd/image/upload/w_200,q_auto,f_auto/v1786386427/VS_logo_TextoAbaixo_yev4tq.png" alt="VSRepository Logo" width="200"/>

  <p style="margin-top: 12px;">
    <img src="https://img.shields.io/npm/v/@vsrepo/prisma7-adapter?style=flat-square" alt="npm version"/>
    <img src="https://img.shields.io/npm/l/@vsrepo/prisma7-adapter?style=flat-square" alt="npm license"/>
    <img src="https://img.shields.io/badge/inspired%20by-JpaRepository-E73121?style=flat-square" alt="inspired by JpaRepository"/>
  </p>
</div>

# VSRepoPrisma7Adapter

🇺🇸 [Read in English](./README.md)

> ⚠️ **Em desenvolvimento.** Este adapter é feito para a branch `v2` do [VSRepository](https://github.com/jaobrabo123/VSRepository/tree/v2), que por sua vez ainda é uma reescrita em andamento. As APIs descritas aqui ainda podem mudar antes de um release estável.

Implementação de `VSRepoAdapter` para o [VSRepository v2](https://github.com/jaobrabo123/VSRepository/tree/v2) usando [Prisma 7](https://www.prisma.io/). Traduz toda operação do `VSRepository` em chamadas do Prisma Client, resolvendo `VSRepoWhere`, `Ordering`, `select`/`relations` através de parsers dedicados e — quando uma config de `relations` é fornecida — resolvendo campos de relação em `create`/`update`/`upsert`/`merge` da mesma forma que a v1 do VSRepository fazia.

---

## Sumário

- [Instalação](#instalação)
- [Uso básico](#uso-básico)
- [Config do construtor](#config-do-construtor)
- [Relations](#relations)
  - [Os dois `relations`](#os-dois-relations)
  - [`relations` no construtor (escrita)](#relations-no-construtor-escrita)
    - [`mode`](#mode)
    - [`restriction`](#restriction)
    - [`pk` e `nullable`](#pk-e-nullable)
    - [Como cada método de escrita resolve relations](#como-cada-método-de-escrita-resolve-relations)
  - [`relations` nas options (leitura)](#relations-nas-options-leitura)
- [`merge`](#merge)
- [`createMany`/`updateMany`/`updateManyReturning` não suportam nested writes](#createmanyupdatemanyupdatemanyreturning-não-suportam-nested-writes)
- [Transactions](#transactions)
- [Logging](#logging)
- [Requisitos](#requisitos)

---

## Instalação

```bash
npm install vsrepo @prisma/client
```

O adapter ainda não é publicado como um pacote separado — `src/prisma7.adapter.ts` importa o resto de `src/` (`parsers/`, `resolvers/`, `validators/`, `types/`), então clone/copie a pasta `src/` inteira (mais as dependências npm, `deepmerge` e `valibot`) para o seu projeto até que ele seja publicado como `@vsrepo/prisma7-adapter`.

## Uso básico

```typescript
import { VSRepository, VSLogLevel } from "vsrepo";
import { VSRepoPrisma7Adapter, Prisma7OrmTypes } from "@vsrepo/prisma7-adapter";
import { Prisma, PrismaClient } from "./generated/prisma/client";
import { prisma } from "./prisma";

type User = Prisma.UserGetPayload<{ include: { posts: true } }>;
type MyOrmTypes = Prisma7OrmTypes<PrismaClient, Prisma.TransactionClient>;

class UserRepository extends VSRepository<User, string, MyOrmTypes> {
    constructor() {
        super({
            adapter: new VSRepoPrisma7Adapter(prisma, {
                tableName: "user",
                pkName: "id",
                relations: {
                    posts: { mode: "otm", restriction: "add", pk: "id" },
                },
                logLevel: VSLogLevel.WARN,
            }),
            pkName: "id",
        });
    }
}

const userRepository = new UserRepository();

const user = await userRepository.get({ id: "..." }, { relations: { posts: true } });
```

Aqui, o `relations` passado no `options` do método — com a forma `{ campo: true }` — é transformado num `include` do Prisma pelo adapter (ver [`relations` nas options (leitura)](#relations-nas-options-leitura)). Se você fornecer `select`, o `relations`/`include` é ignorado. Não confunda com o `relations` da config do construtor (que descreve como campos de relação são resolvidos em escritas) — a diferença é explicada em [Os dois `relations`](#os-dois-relations).

`Prisma7OrmTypes<DB, TX>` amarra os tipos de retorno de `getDbClient()`/`transaction()` do `VSRepository` aos seus tipos reais e gerados do Prisma — ver [Transactions](#transactions).

## Config do construtor

```typescript
new VSRepoPrisma7Adapter(prisma, {
    tableName: "user", // obrigatório — nome do model/delegate do Prisma Client, como em `prisma.user`
    pkName: "id",       // obrigatório — nome do campo de primary key da entidade
    relations: { ... }, // opcional — ver "relations no construtor (escrita)" abaixo
    logLevel: VSLogLevel.WARN, // opcional — default: VSLogLevel.WARN
});
```

A config é validada com [valibot](https://valibot.dev/) — um `tableName`/`pkName`/`relations`/`logLevel` inválido lança um `VSRepoPrisma7AdapterError` apontando o campo problemático.

## Relations

### Os dois `relations`

O nome `relations` aparece em **dois lugares diferentes** da API, com **formas e propósitos diferentes** — fácil de confundir. Em resumo:

| | `relations` no **construtor** | `relations` nas **options** |
| --- | --- | --- |
| Onde você define | `new VSRepoPrisma7Adapter(prisma, { relations: ... })` | `repository.get(where, { relations: ... })` — e demais métodos |
| Formato | Um objeto de **configuração** por campo: `{ mode, restriction, pk, nullable? }` | Um objeto por campo **só com `true` ou sub-objeto**: `{ posts: true }` |
| Propósito | **Escrita** — quando um payload de `create`/`update`/`upsert`/`save`/`merge` tem campo de relação, diz como transformá-lo num nested write do Prisma (`create`/`connectOrCreate`/`upsert`/`disconnect`/`deleteMany`/`set`) | **Leitura** — eager loading: quais relations trazer junto no resultado (vira um `include` do Prisma) |
| Quem consome | `parsePrismaWriteData` / `mergeEntities` (resolvers de escrita) | `parsePrismaInclude` (via `resolveReadArg`) |
| Precisa da outra? | Não — só afeta escritas/`merge` | Não — funciona mesmo sem `relations` no construtor |

Nenhum depende do outro: o `relations` das options faz eager loading de leitura mesmo quando o construtor não tem `relations`; e o `relations` do construtor governa o comportamento de escrita mesmo que você nunca passe `relations` nas options. As duas subseções abaixo detalham cada um.

### `relations` no construtor (escrita)

A config `relations` do construtor descreve, para cada campo de relação da entidade, **como o adapter deve resolver esse campo quando ele aparecer nos payloads de escrita** (`create`/`update`/`upsert`/`save`/`merge`) — o mesmo comportamento que a v1 do VSRepository tinha.

Cada relation é configurada pelo nome do campo:

```typescript
relations: {
    posts: { mode: "otm", restriction: "add", pk: "id" },
    address: { mode: "oto", restriction: "set", pk: "id" },
    author: { mode: "mto", restriction: "set", pk: "id", nullable: true },
}
```

Sem `relations`, todo campo — incluindo campos de relação — é repassado direto pro `where`/`data`/`create`/`update` do Prisma, como está. Isso funciona bem pra campos escalares, mas o Prisma espera um formato bem específico de nested write (`create`/`connectOrCreate`/`upsert`/`disconnect`/`deleteMany`/`set`) pra campos de relação — então, se sua entidade tem relations, normalmente você vai querer configurá-las.

#### `mode`

Cardinalidade da relation, do ponto de vista da entidade dona do campo:

| `mode` | Significado | Formato do campo que você envia |
| --- | --- | --- |
| `oto` | one-to-one | um único objeto, ou `null` |
| `mto` | many-to-one | um único objeto, ou `null` |
| `otm` | one-to-many | um array de objetos |
| `mtm` | many-to-many | um array de objetos |

#### `restriction`

Controla como `save`/`update`/`upsert` tratam itens de relação que já existem (casados pela `pk`) e, pra relations to-many, itens que **não** vieram no payload:

- **`"add"`** — só cria/conecta/faz upsert dos itens enviados. Itens já existentes que não estão no payload permanecem intocados.
- **`"set"`** — igual a `"add"`, mas também remove o que não foi enviado: em `otm` roda um `deleteMany` nos itens que faltam no array; em `mtm` reseta o vínculo (`set: []`) antes de reconectar; em `oto`/`mto` enviar `null` desconecta/apaga a relation (ver abaixo).

#### `pk` e `nullable`

- **`pk`** — o campo usado pra identificar um registro relacionado já existente. Um item **com** `pk` no payload vira um `connectOrCreate`/`upsert`; um item **sem** `pk` vira um `create` simples.
- **`nullable`** — só relevante pra `mto`. Quando `true`, enviar `null` no campo resolve pra `disconnect` no update. Pra `oto` com `restriction: "set"`, enviar `null` resolve pra `delete` (um lado `oto` não dá só pra "desconectar", a linha possuída é removida).

#### Como cada método de escrita resolve relations

| Método | Relations |
| --- | --- |
| `create` | Só `create`/`connectOrCreate` (sem upsert — ainda não existe nada pra atualizar) |
| `update` / `upsert` (metade do `update`) / `save` (branch de upsert) | Resolução completa: `create`/`connectOrCreate`/`upsert`/`disconnect`/`delete`/`deleteMany`/`set`, conforme `mode`/`restriction` |
| `createMany` / `updateMany` / `updateManyReturning` | Não suportado — lança um `VSRepoPrisma7AdapterError` apontando o campo problemático se o payload tiver uma relation configurada |

### `relations` nas options (leitura)

Esse é o `relations` que você passa no `options` de um método do `VSRepository` (`get`, `find`, `findOne`, etc.). A forma é bem mais simples: um objeto onde cada campo de relação aceita:

- `true` — carrega a relation completa;
- ou outro objeto `relations` — para eager loading aninhado (relations da relation).

```typescript
const user = await userRepository.get(
    { id: "..." },
    {
        relations: {
            posts: true,                   // carrega os posts junto
            author: { profile: true },     // e, dentro do author, o profile (eager loading aninhado)
        },
    }
);
```

Esse objeto é transformado num `include` do Prisma pelo adapter (`parsePrismaInclude`). Ele **não** usa a config `relations` do construtor: é puramente uma opção de leitura e funciona mesmo sem `relations` na config.

O `select` e o `relations` que você passa nas options são transformados num `select` do Prisma (`parsePrismaSelect`) e num `include` (`parsePrismaInclude`), respectivamente. Quando o `select` é fornecido, o `include` derivado do `relations` é descartado (fica `undefined`), porque o Prisma não permite combinar `include` e `select` na mesma query. Ou seja, se você já estiver usando `select`, o objeto `relations` vira redundante — por isso ele é facultativo. Essa é a lógica resolvida (de `resolveReadArg`):

```ts
const prismaSelect = options.select && parsePrismaSelect(options.select);
const prismaInclude = prismaSelect
    ? undefined
    : options.relations && parsePrismaInclude(options.relations);
```

## `merge`

`merge(where, obj, options)` busca o registro que casa com `where` e devolve ele **deep-merged, em memória**, com `obj` — ele **não** escreve nada no banco. Isso reflete exatamente como o `merge` funcionava na v1 do VSRepository: ele serve pra montar uma entidade completa e mesclada, que você depois passa pro `save`/`update`, e não pra persistir um update parcial diretamente.

Pra relations to-many (`otm`/`mtm`), os itens do registro salvo e os itens de `obj` são casados pela `pk` configurada: um match faz merge dos dois itens, uma `pk` nova (ou sem `pk`) é apenas adicionada. `merge` nunca remove nada.

## `createMany`/`updateMany`/`updateManyReturning` não suportam nested writes

`createMany`, `updateMany` e `updateManyAndReturn` só aceitam campos escalares no `data`. Se seu payload incluir um campo configurado em `relations` (independente do valor), o adapter lança um `VSRepoPrisma7AdapterError` apontando o campo problemático. Pra um nested write completo, use `create`/`update`/`save` registro por registro, ou envolva várias chamadas de `save` num `saveMany`/`transaction`.

## Transactions

**Todos** os métodos aceitam `options.db` e executam a operação no client/transaction passado — a diferença está em **como** cada um o trata:

- A maioria (operações de uma única chamada Prisma) roda direto em `options?.db`: você passa um transaction client e a chamada participa da transaction, sem iniciar nada novo.
- `saveMany` e `deleteManyReturning` precisam rodar **mais de uma operação** do Prisma atomicamente (`saveMany` salva cada registro individualmente; `deleteManyReturning` faz um `findMany` + `deleteMany`), então passam por `runTransactional`. Se `options.db` já for um transaction client ativo, ele é reaproveitado — nenhuma transaction aninhada é criada; caso contrário, uma nova transaction é criada (em `options.db`, se fornecido, ou no client raiz caso contrário).

Um transaction client é diferenciado do `PrismaClient` raiz pelo método `$on`: o client raiz do Prisma o expõe (pra event listeners), o transaction client interativo não. É isso que `Prisma7ClientLike`/`Prisma7OrmTypes` codificam nos seus tipos.

```typescript
await userRepository.transaction(async tx => {
    // Toda chamada de repository feita com `{ db: tx }` dentro desse
    // callback compartilha a mesma transaction — incluindo chamadas a
    // `saveMany`/`deleteManyReturning`, que vão detectar que `tx` já é
    // uma transaction e rodar direto nele, sem aninhar uma nova.
    await userRepository.save(user, { db: tx });
    await userRepository.saveList(outrosUsuarios, { db: tx });
});
```

## Logging

O adapter usa o `VSLogger` (de `vsrepo`) internamente: todo método loga uma linha `DEBUG` com o arg resolvido do Prisma, além de logs de performance de início/fim (com `WARN` pra operações lentas). Configure `logLevel` na config do construtor pra controlar a verbosidade; o default é `VSLogLevel.WARN`.

## Requisitos

- `vsrepo` v2
- `@prisma/client` ^7.10.0
