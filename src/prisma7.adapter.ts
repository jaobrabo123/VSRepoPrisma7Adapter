import {
    AdapterMethodOptions,
    AdapterQueryOptions,
    CountResult,
    DeepPartial,
    VSLogger,
    VSLogLevel,
    VSRepoAdapter,
    VSRepoWhere,
} from "vsrepo";
import { parsePrismaWhere } from "./parsers/where.parser";
import { parsePrismaInclude } from "./parsers/include.parser";
import { parsePrismaSelect } from "./parsers/select.parser";
import { parsePrismaOrderBy } from "./parsers/order-by.parser";
import { parsePrismaWriteData } from "./parsers/data.parser";
import { mergeEntities } from "./resolvers/merge-entities.resolver";
import { validateAdapterConfig } from "./validators/validate-adapter-config.validator";
import { AdapterRelations } from "./types/adapter-relations.type";
import { VSRepoPrisma7AdapterConfig } from "./types/adapter-config.type";
import { PrismaArgLike } from "./types/prisma-arg-like.type";
import { PrismaRepositoryLike } from "./types/prisma-repository-like.type";
import { PlainObject } from "./types/plain-object.type";

/**
 * @publicApi
 */
export class VSRepoPrisma7Adapter<T> extends VSRepoAdapter<T> {
    private readonly tableName: string;
    private readonly pkName: string;
    private readonly relations?: AdapterRelations<T>;
    private readonly logger: VSLogger;

    constructor(
        private readonly prisma: any,
        config: VSRepoPrisma7AdapterConfig<T>,
    ) {
        super();

        const validated = validateAdapterConfig<T>(config);

        this.tableName = validated.tableName;
        this.pkName = validated.pkName;
        this.relations = validated.relations;
        this.logger = new VSLogger(validated.logLevel ?? VSLogLevel.WARN, this.constructor.name + "Logger");

        this.logger.logInfo(
            `Initialized for table '${this.tableName}' (pkName: '${this.pkName}'${
                this.relations ? `, relations: [${Object.keys(this.relations).join(", ")}]` : ""
            })`,
        );
    }

    private getPrismaRepository(db?: any): PrismaRepositoryLike {
        return db ? db[this.tableName] : this.prisma[this.tableName];
    }

    /** Resolve a parte "de leitura" do arg do Prisma: select/include/orderBy/paginação. */
    private resolveReadArg(
        options: (AdapterMethodOptions<T> & { distinct?: (keyof T)[] }) | undefined,
    ): PrismaArgLike {
        options ??= {};

        const prismaSelect = options.select && parsePrismaSelect(options.select);
        const prismaInclude = prismaSelect
            ? undefined
            : options.relations && parsePrismaInclude(options.relations);

        return {
            select: prismaSelect,
            include: prismaInclude,
            orderBy: parsePrismaOrderBy<T>(options.order),
            skip: options.pagination?.offset,
            take: options.pagination?.limit,
            distinct: options.distinct as any,
        };
    }

    /**
     * Remove campos de relation de um payload — usado em `createMany`/`updateMany`/
     * `updateManyReturning`, já que essas operações do Prisma não suportam nested
     * writes (só campos escalares).
     */
    private stripRelationFields(obj: PlainObject): PlainObject {
        if (!this.relations) return obj;

        const data: PlainObject = {};

        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined) continue;

            if (key in (this.relations as PlainObject)) {
                this.logger.logWarn(
                    `Field '${key}' is a configured relation and was ignored — Prisma's *Many operations don't support nested relation writes.`,
                );
                continue;
            }

            data[key] = value;
        }

        return data;
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

    public async findOne(where: VSRepoWhere<T>, options?: AdapterMethodOptions<T>): Promise<T | null> {
        const start = this.logger.startPerformLog("findOne");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'findOne'", arg);

            return await this.getPrismaRepository(options?.db).findFirst(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async findOneOrThrow(where: VSRepoWhere<T>, options?: AdapterMethodOptions<T>): Promise<T> {
        const start = this.logger.startPerformLog("findOneOrThrow");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'findOneOrThrow'", arg);

            return await this.getPrismaRepository(options?.db).findFirstOrThrow(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async findMany(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T> & { distinct?: (keyof T)[] },
    ): Promise<T[]> {
        const start = this.logger.startPerformLog("findMany");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'findMany'", arg);

            return await this.getPrismaRepository(options?.db).findMany(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async save(obj: DeepPartial<T>, options?: AdapterMethodOptions<T>): Promise<T> {
        const start = this.logger.startPerformLog("save");

        try {
            const objAny = obj as PlainObject;
            const pkValue = objAny[this.pkName];
            const readArg = this.resolveReadArg(options);
            const repo = this.getPrismaRepository(options?.db);

            if (pkValue === undefined) {
                const { create } = parsePrismaWriteData(objAny, this.pkName, this.relations);
                const arg = { ...readArg, data: create };
                this.logger.logDebug("Resolved Prisma arg for 'save' (create)", arg);

                return await repo.create(arg);
            }

            const { create, update } = parsePrismaWriteData(objAny, this.pkName, this.relations);
            const arg = { ...readArg, where: { [this.pkName]: pkValue }, create, update };
            this.logger.logDebug("Resolved Prisma arg for 'save' (upsert)", arg);

            return await repo.upsert(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async saveMany(objs: DeepPartial<T>[], options?: AdapterMethodOptions<T>): Promise<T[]> {
        const start = this.logger.startPerformLog("saveMany");

        try {
            this.logger.logDebug(`Saving ${objs.length} record(s) individually inside a transaction`);

            return await this.runInTransaction(tx =>
                Promise.all(objs.map(obj => this.save(obj, { ...options, db: tx }))),
            );
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async delete(where: VSRepoWhere<T>, options?: AdapterMethodOptions<T>): Promise<T> {
        const start = this.logger.startPerformLog("delete");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'delete'", arg);

            return await this.getPrismaRepository(options?.db).delete(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async deleteMany(where: VSRepoWhere<T>, options?: AdapterMethodOptions<T>): Promise<CountResult> {
        const start = this.logger.startPerformLog("deleteMany");

        try {
            const arg = { where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'deleteMany'", arg);

            return await this.getPrismaRepository(options?.db).deleteMany(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async deleteManyReturning(where: VSRepoWhere<T>, options?: AdapterMethodOptions<T>): Promise<T[]> {
        const start = this.logger.startPerformLog("deleteManyReturning");

        try {
            // * Prisma não tem `deleteManyAndReturn` — busca e deleta, atomicamente
            // * quando não estamos já dentro de uma transaction externa.
            const prismaWhere = parsePrismaWhere<T>(where);
            const findArg = { ...this.resolveReadArg(options), where: prismaWhere };
            const deleteArg = { where: prismaWhere };
            this.logger.logDebug("Resolved Prisma args for 'deleteManyReturning'", { findArg, deleteArg });

            const repo = this.getPrismaRepository(options?.db);

            if (options?.db) {
                const records = await repo.findMany(findArg);
                await repo.deleteMany(deleteArg);
                return records;
            }

            const [records] = await this.prisma.$transaction([repo.findMany(findArg), repo.deleteMany(deleteArg)]);
            return records;
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async update(where: VSRepoWhere<T>, obj: DeepPartial<T>, options?: AdapterMethodOptions<T>): Promise<T> {
        const start = this.logger.startPerformLog("update");

        try {
            const { update } = parsePrismaWriteData(obj as PlainObject, this.pkName, this.relations);
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where), data: update };
            this.logger.logDebug("Resolved Prisma arg for 'update'", arg);

            return await this.getPrismaRepository(options?.db).update(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async updateMany(
        where: VSRepoWhere<T>,
        obj: DeepPartial<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<CountResult> {
        const start = this.logger.startPerformLog("updateMany");

        try {
            const data = this.stripRelationFields(obj as PlainObject);
            const arg = { where: parsePrismaWhere<T>(where), data };
            this.logger.logDebug("Resolved Prisma arg for 'updateMany'", arg);

            return await this.getPrismaRepository(options?.db).updateMany(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async updateManyReturning(
        where: VSRepoWhere<T>,
        obj: DeepPartial<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T[]> {
        const start = this.logger.startPerformLog("updateManyReturning");

        try {
            const data = this.stripRelationFields(obj as PlainObject);
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where), data };
            this.logger.logDebug("Resolved Prisma arg for 'updateManyReturning'", arg);

            return await this.getPrismaRepository(options?.db).updateManyAndReturn(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async count(where: VSRepoWhere<T>, options?: AdapterMethodOptions<T>): Promise<number> {
        const start = this.logger.startPerformLog("count");

        try {
            const arg = { where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'count'", arg);

            return await this.getPrismaRepository(options?.db).count(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async exists(where: VSRepoWhere<T>, options?: AdapterMethodOptions<T>): Promise<boolean> {
        const start = this.logger.startPerformLog("exists");

        try {
            const arg = { where: parsePrismaWhere<T>(where), select: { [this.pkName]: true } };
            this.logger.logDebug("Resolved Prisma arg for 'exists'", arg);

            const result = await this.getPrismaRepository(options?.db).findFirst(arg);
            return result !== null;
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async query<R = any>(query: string, options?: AdapterQueryOptions): Promise<R> {
        const modifying = options?.modifying ?? false;
        const db = options?.db ?? this.prisma;
        const args = options?.args ?? [];

        const start = this.logger.startPerformLog(`run raw query (modifying: ${modifying})`);

        try {
            this.logger.logDebug("Running raw query", { query, args, modifying });

            return modifying
                ? await db.$executeRawUnsafe(query, ...args)
                : await db.$queryRawUnsafe(query, ...args);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async create(obj: DeepPartial<T>, options?: AdapterMethodOptions<T>): Promise<T> {
        const start = this.logger.startPerformLog("create");

        try {
            const { create } = parsePrismaWriteData(obj as PlainObject, this.pkName, this.relations);
            const arg = { ...this.resolveReadArg(options), data: create };
            this.logger.logDebug("Resolved Prisma arg for 'create'", arg);

            return await this.getPrismaRepository(options?.db).create(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async createMany(
        objs: DeepPartial<T>[],
        options?: AdapterMethodOptions<T> & { ignoreConflicts?: boolean },
    ): Promise<CountResult> {
        const start = this.logger.startPerformLog("createMany");

        try {
            const data = objs.map(obj => this.stripRelationFields(obj as PlainObject));
            const arg = { data, skipDuplicates: options?.ignoreConflicts };
            this.logger.logDebug("Resolved Prisma arg for 'createMany'", arg);

            return await this.getPrismaRepository(options?.db).createMany(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async merge<K>(where: VSRepoWhere<T>, obj: DeepPartial<T>, options?: AdapterMethodOptions<T>): Promise<K & T> {
        const start = this.logger.startPerformLog("merge");

        try {
            // * `merge` NÃO persiste nada — busca o registro e devolve o merge em
            // * memória, igual funcionava na v1. Quem chamou decide o que fazer
            // * com o resultado (ex: chamar `save` na sequência).
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'merge'", arg);

            const result = await this.getPrismaRepository(options?.db).findFirst(arg);
            if (!result) return null as unknown as K & T;

            return mergeEntities(result, obj as PlainObject, this.relations) as K & T;
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    public async upsert(
        where: VSRepoWhere<T>,
        create: DeepPartial<T>,
        update: DeepPartial<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T> {
        const start = this.logger.startPerformLog("upsert");

        try {
            const parsedCreate = parsePrismaWriteData(create as PlainObject, this.pkName, this.relations).create;
            const parsedUpdate = parsePrismaWriteData(update as PlainObject, this.pkName, this.relations).update;

            const arg = {
                ...this.resolveReadArg(options),
                where: parsePrismaWhere<T>(where),
                create: parsedCreate,
                update: parsedUpdate,
            };
            this.logger.logDebug("Resolved Prisma arg for 'upsert'", arg);

            return await this.getPrismaRepository(options?.db).upsert(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }
}
