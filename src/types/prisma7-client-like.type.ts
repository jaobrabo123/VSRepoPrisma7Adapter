/**
 * Minimal shape of a Prisma Client (or transaction client) required by the
 * adapter for raw queries (`@QueryMethod`) and for telling a root client
 * apart from an active transaction client.
 *
 * `$on` is only present on the root `PrismaClient` — Prisma's interactive
 * transaction client doesn't expose it — so the adapter uses it to detect
 * whether a `db` passed in `AdapterMethodOptions` is already a transaction
 * (see `Prisma7OrmTypes`).
 *
 * @publicApi
 */
export type Prisma7ClientLike = {
    $executeRaw: any;
    $executeRawUnsafe: any;
    $queryRaw: any;
    $queryRawUnsafe: any;
    $on: any;
};
