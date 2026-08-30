import type { VSLogLevel } from "vsrepo";
import { AdapterRelations } from "./adapter-relations.type";

/**
 * Configuration accepted by `VSRepoPrisma7Adapter`'s constructor, as the
 * second parameter.
 *
 * @publicApi
 */
export interface VSRepoPrisma7AdapterConfig<T = any> {
    /** Name of the Prisma Client model/delegate (e.g. `"user"`, as in `prisma.user`). */
    tableName: string;
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
}
