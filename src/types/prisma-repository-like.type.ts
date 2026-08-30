import { PrismaArgLike } from "./prisma-arg-like.type";

type AnyFn = (arg: PrismaArgLike) => Promise<any>;
/** `count` do Prisma resolve pra um `number` (na forma simples, sem `select` de agregação). */
type CountFn = (arg: PrismaArgLike) => Promise<number>;

export type PrismaRepositoryLike = {
    findFirst: AnyFn;
    findFirstOrThrow: AnyFn;
    findMany: AnyFn;
    create: AnyFn;
    createMany: AnyFn;
    update: AnyFn;
    updateMany: AnyFn;
    updateManyAndReturn: AnyFn;
    upsert: AnyFn;
    delete: AnyFn;
    deleteMany: AnyFn;
    count: CountFn;
};
