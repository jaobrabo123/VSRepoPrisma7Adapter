import { Prisma7ClientLike } from "./prisma7-client-like.type";

export type Prisma7OrmTypes<
    DB extends Prisma7ClientLike,
    TX extends Prisma7ClientLike & { $on?: never },
> = {
    dbClient: DB;
    dbTransaction: TX;
};
