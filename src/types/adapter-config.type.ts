import type { VSLogLevel } from "vsrepo";
import { AdapterRelations } from "./adapter-relations.type";
import { Prisma7ClientLike } from "./prisma7-client-like.type";
import { PrismaClientModels } from "./prisma-client-models.type";

/**
 * Configuration accepted by `VSRepoPrisma7Adapter`'s constructor, as the
 * second parameter.
 *
 * @publicApi
 */
export interface VSRepoPrisma7AdapterConfig<
    T = any,
    K extends Prisma7ClientLike = Prisma7ClientLike,
> {
    /** Name of the Prisma Client model/delegate (e.g. `"user"`, as in `prisma.user`). */
    tableName: [PrismaClientModels<K>] extends [never] ? string : PrismaClientModels<K>;
    /** Name of the entity's primary key field (e.g. `"id"`). */
    pkName: keyof T;
    /**
     * The entity's relation configuration, needed by the `create`/`update`/`merge`
     * parsers to correctly resolve relation fields (see `Relation`/`AdapterRelations`).
     * Optional: without it, relation fields are passed through to Prisma as-is (raw).
     */
    relations?: AdapterRelations<T>;
    /** Minimum log level for the adapter's internal `VSLogger`. @default VSLogLevel.WARN */
    logLevel?: VSLogLevel;
    /**
     * Duration (in ms) above which a finished operation is logged as `WARN`, flagging a potentially slow query, instead of the usual
     * `DEBUG` line. Pass `false` to disable slow-operation warnings entirely (every operation is then only ever logged at `DEBUG`); `true` (or omitting the field) uses the default of 300ms.
     */
    logSlowThresholdMs?: number | boolean;
}
