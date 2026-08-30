# VSRepoPrisma7Adapter

🇧🇷 [Ler em português](./README.pt-BR.md)

> ⚠️ **Work in progress.** This adapter targets the `v2` branch of [VSRepository](https://github.com/jaobrabo123/VSRepository/tree/v2), which is itself still an ongoing rewrite. APIs described here may still change before a stable release.

`VSRepoAdapter` implementation for [VSRepository v2](https://github.com/jaobrabo123/VSRepository/tree/v2) backed by [Prisma 7](https://www.prisma.io/). It translates every `VSRepository` operation into Prisma Client calls, resolving `VSRepoWhere`, `Ordering`, `select`/`relations` through dedicated parsers, and — when a `relations` config is provided — resolving relation fields on `create`/`update`/`upsert`/`merge` the same way the v1 of VSRepository used to.

---

## Table of contents

- [Installation](#installation)
- [Basic usage](#basic-usage)
- [Constructor config](#constructor-config)
- [Relations](#relations)
  - [`mode`](#mode)
  - [`restriction`](#restriction)
  - [`pk` and `nullable`](#pk-and-nullable)
  - [How each write method resolves relations](#how-each-write-method-resolves-relations)
- [`merge`](#merge)
- [`createMany`/`updateMany`/`updateManyReturning` don't support nested writes](#createmanyupdatemanyupdatemanyreturning-dont-support-nested-writes)
- [Transactions](#transactions)
- [Logging](#logging)
- [Requirements](#requirements)

---

## Installation

```bash
npm install vsrepo @prisma/client
```

The adapter itself isn't published as a separate package yet — clone/vendor `src/prisma7.adapter.ts` and its dependencies (`deepmerge`, `valibot`) into your project until it ships as `@vsrepo/prisma7-adapter`.

## Basic usage

```typescript
import { VSRepository, VSLogLevel } from "vsrepo";
import { VSRepoPrisma7Adapter, Prisma7OrmTypes } from "vsrepoprisma7adapter";
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

`Prisma7OrmTypes<DB, TX>` ties `VSRepository`'s `getDbClient()`/`transaction()` return types to your real, generated Prisma types — see [Transactions](#transactions).

## Constructor config

```typescript
new VSRepoPrisma7Adapter(prisma, {
    tableName: "user", // required — the Prisma Client model/delegate name, as in `prisma.user`
    pkName: "id",       // required — the entity's primary key field name
    relations: { ... }, // optional — see "Relations" below
    logLevel: VSLogLevel.WARN, // optional — default: VSLogLevel.WARN
});
```

The config is validated with [valibot](https://valibot.dev/) — an invalid `tableName`/`pkName`/`relations`/`logLevel` throws a `VSRepoPrisma7AdapterError` naming the offending field.

## Relations

Without `relations`, every field — including relation fields — is passed straight through to Prisma's `where`/`data`/`create`/`update`, as-is. That's fine for scalar fields, but Prisma expects a very specific nested-write shape (`create`/`connectOrCreate`/`upsert`/`disconnect`/`deleteMany`/`set`) for relation fields, so if your entity has relations you'll usually want to configure them.

Each relation is configured by its field name:

```typescript
relations: {
    posts: { mode: "otm", restriction: "add", pk: "id" },
    address: { mode: "oto", restriction: "set", pk: "id" },
    author: { mode: "mto", restriction: "set", pk: "id", nullable: true },
}
```

### `mode`

Cardinality of the relation, from the point of view of the entity that owns the field:

| `mode` | Meaning | Field shape you send |
| --- | --- | --- |
| `oto` | one-to-one | a single object, or `null` |
| `mto` | many-to-one | a single object, or `null` |
| `otm` | one-to-many | an array of objects |
| `mtm` | many-to-many | an array of objects |

### `restriction`

Controls how `save`/`update`/`upsert` handle relation items that already exist (matched by `pk`) and, for to-many relations, items that were **not** included in the payload:

- **`"add"`** — only creates/connects/upserts the items you send. Existing items that aren't in the payload are left untouched.
- **`"set"`** — same as `"add"`, but also removes what wasn't sent: for `otm` it runs a `deleteMany` on the items missing from the array; for `mtm` it resets the join (`set: []`) before reconnecting; for `oto`/`mto` sending `null` disconnects/deletes the relation (see below).

### `pk` and `nullable`

- **`pk`** — the field used to identify an existing related record. An item **with** `pk` in the payload becomes a `connectOrCreate`/`upsert`; an item **without** it becomes a plain `create`.
- **`nullable`** — only relevant for `mto`. When `true`, sending `null` for the field resolves to `disconnect` on update. For `oto` with `restriction: "set"`, sending `null` resolves to `delete` instead (an `oto` side can't just be "disconnected", the owned row is removed).

### How each write method resolves relations

| Method | Relations |
| --- | --- |
| `create` | `create`/`connectOrCreate` only (no upsert — there's nothing to update yet) |
| `update` / `upsert` (`update` half) / `save` (upsert branch) | Full resolution: `create`/`connectOrCreate`/`upsert`/`disconnect`/`delete`/`deleteMany`/`set`, per `mode`/`restriction` |
| `createMany` / `updateMany` / `updateManyReturning` | Not supported — throws a `VSRepoPrisma7AdapterError` naming the offending field if the payload contains a configured relation |

## `merge`

`merge(where, obj, options)` fetches the record matching `where` and returns it **deep-merged, in memory**, with `obj` — it does **not** write anything to the database. This mirrors how `merge` worked in the v1 of VSRepository: it's meant to build a full, merged entity that you then pass to `save`/`update` yourself, not to persist a partial update directly.

For to-many relations (`otm`/`mtm`), items in the stored record and items in `obj` are matched by the configured `pk`: a match merges the two items, a new `pk` (or no `pk`) is appended. Nothing is ever removed by `merge`.

## `createMany`/`updateMany`/`updateManyReturning` don't support nested writes

`createMany`, `updateMany`, and `updateManyAndReturn` only accept scalar fields in their `data`. If your payload includes a field configured in `relations` (regardless of its value), the adapter throws a `VSRepoPrisma7AdapterError` naming the offending field. For a full nested write, use `create`/`update`/`save` one record at a time, or wrap several `save` calls in a `saveMany`/`transaction`.

## Transactions

Methods that need to run more than one Prisma operation atomically (`saveMany`, `deleteManyReturning`) accept `options.db`. If `options.db` is already an active transaction client, it's reused directly — no nested transaction is started; otherwise, a new transaction is created (on `options.db` if provided, or on the root client otherwise).

A transaction client is told apart from the root `PrismaClient` by the `$on` method: Prisma's root client exposes it (for event listeners), the interactive transaction client doesn't. This is what `Prisma7ClientLike`/`Prisma7OrmTypes` encode in their types.

```typescript
await userRepository.transaction(async tx => {
    // Every repository call made with `{ db: tx }` inside this callback
    // shares the same transaction — including calls to `saveMany`/
    // `deleteManyReturning`, which will detect `tx` is already a
    // transaction and run directly on it instead of nesting a new one.
    await userRepository.save(user, { db: tx });
    await userRepository.saveList(otherUsers, { db: tx });
});
```

## Logging

The adapter uses `VSLogger` (from `vsrepo`) internally: every method logs a `DEBUG` line with the resolved Prisma arg, and start/end performance logs (surfacing a `WARN` for slow operations). Set `logLevel` in the constructor config to control verbosity; it defaults to `VSLogLevel.WARN`.

## Requirements

- `vsrepo` v2
- `@prisma/client` ^7.10.0
