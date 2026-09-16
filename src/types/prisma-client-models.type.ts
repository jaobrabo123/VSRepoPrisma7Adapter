import { Prisma7ClientLike } from "./prisma7-client-like.type";

/**
 * @publicApi
 */
export type PrismaClientModels<T extends Prisma7ClientLike> = Exclude<
    keyof T,
    | "$connect"
    | "$disconnect"
    | "$executeRaw"
    | "$executeRawUnsafe"
    | "$extends"
    | "$on"
    | "$queryRaw"
    | "$queryRawUnsafe"
    | "$transaction"
    | symbol
>;
