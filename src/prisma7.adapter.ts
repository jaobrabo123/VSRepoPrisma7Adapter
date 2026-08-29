import { parsePrismaWhere } from "./parsers/where.parser";
import { parsePrismaInclude } from "./parsers/include.parser";
import { parsePrismaSelect } from "./parsers/select.parser";
import {
    AdapterMethodOptions,
    AdapterQueryOptions,
    CountResult,
    DeepPartial,
    VSRepoAdapter,
    VSRepoWhere,
} from "vsrepo";
import { PrismaArgLike } from "./types/prisma-arg-like.type";
import { PrismaRepositoryLike } from "./types/prisma-repository-like.type";

export class VSRepoPrisma7Adapter<T> extends VSRepoAdapter<T> {
    private readonly prismaRepository: PrismaRepositoryLike;

    constructor(
        private readonly prisma: any,
        private readonly tableName: string,
    ) {
        super();
        this.prismaRepository = (prisma as any)[this.tableName];
    }

    private resolveArg(
        options:
            | (AdapterMethodOptions<T> & { distinct?: (keyof T)[]; ignoreConflicts?: boolean })
            | undefined,
        other?: {
            where?: VSRepoWhere<T>;
            obj?: DeepPartial<T>;
            create?: DeepPartial<T>;
            update?: DeepPartial<T>;
        },
    ): PrismaArgLike {
        options ??= {};

        const { create, obj, update, where } = other ?? {};

        const prismaWhere = where && parsePrismaWhere<T>(where);
        const prismaSelect = options.select && parsePrismaSelect(options.select);
        const prismaInclude = prismaSelect
            ? undefined
            : options.relations && parsePrismaInclude(options.relations);
        const prismaSkip = options.pagination?.offset;
        const prismaTake = options.pagination?.limit;

        return {
            data: obj,
            create,
            update,
            distinct: options.distinct,
            include: prismaInclude,
            select: prismaSelect,
            orderBy: options.order,
            skipDuplicates: options.ignoreConflicts,
            where: prismaWhere,
            skip: prismaSkip,
            take: prismaTake,
        };
    }

    getDbClient(): any {
        return this.prisma;
    }

    public async runInTransaction<R>(
        fn: (tx: any) => Promise<R>,
        options?: { isolationLevel?: any },
    ): Promise<R> {
        return this.prisma.$transaction(fn, options);
    }

    public findOne(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<T | null> {
        const arg = this.resolveArg(options, { where });

        console.log(arg);

        return this.prismaRepository.findFirst(arg);
    }

    public findOneOrThrow(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<T> {
        throw new Error("Method not implemented.");
    }

    public findMany(
        where: VSRepoWhere<T>,
        options?: (AdapterMethodOptions<T> & { distinct?: (keyof T)[] }) | undefined,
    ): Promise<T[]> {
        throw new Error("Method not implemented.");
    }

    public save(obj: DeepPartial<T>, options?: AdapterMethodOptions<T> | undefined): Promise<T> {
        throw new Error("Method not implemented.");
    }

    public saveMany(objs: DeepPartial<T>[], options?: AdapterMethodOptions<T>): Promise<T[]> {
        throw new Error("Method not implemented.");
    }

    public delete(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<T> {
        throw new Error("Method not implemented.");
    }

    public deleteMany(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<CountResult> {
        throw new Error("Method not implemented.");
    }

    public deleteManyReturning(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<T[]> {
        throw new Error("Method not implemented.");
    }

    public update(
        where: VSRepoWhere<T>,
        obj: DeepPartial<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<T> {
        throw new Error("Method not implemented.");
    }

    public updateMany(
        where: VSRepoWhere<T>,
        obj: DeepPartial<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<CountResult> {
        throw new Error("Method not implemented.");
    }

    public updateManyReturning(
        where: VSRepoWhere<T>,
        obj: DeepPartial<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<T[]> {
        throw new Error("Method not implemented.");
    }

    public count(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<number> {
        throw new Error("Method not implemented.");
    }

    public exists(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    public query<T = any>(query: string, options?: AdapterQueryOptions): Promise<T> {
        throw new Error("Method not implemented.");
    }
    public create(objs: DeepPartial<T>, options?: AdapterMethodOptions<T> | undefined): Promise<T> {
        throw new Error("Method not implemented.");
    }
    public createMany(
        objs: DeepPartial<T>[],
        options?: (AdapterMethodOptions<T> & { ignoreConflicts?: boolean }) | undefined,
    ): Promise<CountResult> {
        throw new Error("Method not implemented.");
    }
    public merge<K>(
        where: VSRepoWhere<T>,
        obj: DeepPartial<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<K & T> {
        throw new Error("Method not implemented.");
    }
    public upsert(
        where: VSRepoWhere<T>,
        create: DeepPartial<T>,
        update: DeepPartial<T>,
        options?: AdapterMethodOptions<T> | undefined,
    ): Promise<T> {
        throw new Error("Method not implemented.");
    }
}

// type User = UserGetPayload<{ include: { address: true; products: true } }>;

// const where = parseVSRepoWhere<User>({
//     id: crypto.randomUUID(),
//     active: true,
//     createdAt: { between: [new Date(), new Date()] },
//     address: {
//         _with: {
//             city: {
//                 startsWith: "tal",
//                 ignoreCase: true,
//             },
//         },
//     },
//     products: {
//         _some: {
//             createdAt: { gt: new Date() },
//         },
//     },
// });

// async function test() {
//     const a = await prisma.user.findMany({ where });
//     console.log(JSON.stringify(where, null, 2));
//     console.log(a);
// }
// test();
