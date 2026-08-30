import { Prisma7ClientLike } from "./prisma7-client-like.type";

/**
 * @publicApi
 */
export type Prisma7OrmTypes<
    DB extends Prisma7ClientLike,
    TX extends Omit<Prisma7ClientLike, "$on">,
> = {
    dbClient: DB;
    dbTransaction: TX;
};
