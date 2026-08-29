import { PrismaArgLike } from "./prisma-arg-like.type";

type AnyFn = (arg: PrismaArgLike) => Promise<any>;

export type PrismaRepositoryLike = {
    findFirst: AnyFn;
    findMany: AnyFn;
    update: AnyFn;
    delete: AnyFn;
    deleteMany: AnyFn;
    create: AnyFn;
    createMany: AnyFn;
};
