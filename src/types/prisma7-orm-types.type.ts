import { Prisma7ClientLike } from "./prisma7-client-like.type";

/**
 * Helper used to type a `VSRepository`'s `OrmTypes` generic when using
 * `VSRepoPrisma7Adapter`, tying the repository's `getDbClient()`/`transaction()`
 * return types to the real Prisma Client and transaction client types.
 *
 * @example
 * ```typescript
 * type MyOrmTypes = Prisma7OrmTypes<PrismaClient, Prisma.TransactionClient>;
 *
 * class UserRepository extends VSRepository<User, string, MyOrmTypes> { ... }
 * ```
 *
 * @publicApi
 */
export type Prisma7OrmTypes<
    DB extends Prisma7ClientLike,
    TX extends Omit<Prisma7ClientLike, "$on">,
> = {
    dbClient: DB;
    dbTransaction: TX;
};
