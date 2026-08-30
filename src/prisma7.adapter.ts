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
import { VSRepoPrisma7AdapterError } from "./errors/vsrepo-prisma7-adapter.error";

/**
 * `VSRepoAdapter` implementation for Prisma 7. Translates every method of the
 * adapter contract into Prisma Client calls, resolving `VSRepoWhere`/`Ordering`/
 * `select`/`include` through the parsers, and — when a
 * `relations` config is provided — resolving relation fields on `create`/
 * `update`/`upsert`/`merge` the same way the v1 of VSRepository did (see
 * `Relation`).
 *
 * @template T Entity type this adapter operates on.
 *
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
        this.pkName = validated.pkName as string;
        this.relations = validated.relations;
        this.logger = new VSLogger(
            validated.logLevel ?? VSLogLevel.WARN,
            this.constructor.name + "Logger",
        );

        this.logger.logInfo(
            `${this.constructor.name} initialized for table '${this.tableName}' (pkName: '${this.pkName}'${
                this.relations ? `, relations: [${Object.keys(this.relations).join(", ")}]` : ""
            })`,
        );
    }

    private getPrismaRepository(db?: any): PrismaRepositoryLike {
        return db ? db[this.tableName] : this.prisma[this.tableName];
    }

    /** Resolves the "read" part of a Prisma arg: select/include/orderBy/pagination. */
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
     * Strips relation fields from a payload — used by `createMany`/`updateMany`/
     * `updateManyReturning`, since those Prisma operations don't support nested
     * writes (scalar fields only). Throws a `VSRepoPrisma7AdapterError` when a
     * configured relation field is present, instead of silently ignoring it.
     */
    private stripRelationFields(obj: PlainObject): PlainObject {
        if (!this.relations) return obj;

        const data: PlainObject = {};

        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined) continue;

            if (key in (this.relations as PlainObject)) {
                throw new VSRepoPrisma7AdapterError(
                    `Field '${key}' is a configured relation, but Prisma's *Many operations don't support nested relation writes.`,
                );
            }

            data[key] = value;
        }

        return data;
    }

    /**
     * Tells apart a root Prisma Client from an active transaction client: only
     * the root client exposes `$on` (used for event listeners), Prisma's
     * interactive transaction client doesn't (see `Prisma7ClientLike`).
     */
    private isRootClient(db: any): boolean {
        return typeof db?.$on === "function";
    }

    /**
     * Runs `fn` against a transaction, reusing `db` when it's already a
     * transaction client (see `isRootClient`) instead of nesting a new one —
     * this is what lets `saveMany`/`deleteManyReturning` participate in a
     * transaction already started via `VSRepository.transaction()`.
     * When `db` isn't provided, or is a root client, a new transaction is
     * started on it (or on `this.prisma` when `db` isn't provided at all).
     */
    private async runTransactional<R>(db: any, fn: (tx: any) => Promise<R>): Promise<R> {
        if (db && !this.isRootClient(db)) {
            this.logger.logDebug("Reusing an already-active transaction client");
            return fn(db);
        }

        return (db ?? this.prisma).$transaction(fn);
    }

    /** Returns the underlying ORM client instance used outside of transactions. */
    getDbClient(): any {
        return this.prisma;
    }

    /** Runs `fn` inside a native transaction of the underlying ORM/database. */
    public async runInTransaction<R>(
        fn: (tx: any) => Promise<R>,
        options?: { isolationLevel?: any },
    ): Promise<R> {
        return this.prisma.$transaction(fn, options);
    }

    /** Fetches a single record matching `where`. */
    public async findOne(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T | null> {
        const start = this.logger.startPerformLog("findOne");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'findOne'", arg);

            return await this.getPrismaRepository(options?.db).findFirst(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Fetches a single record matching `where`, throwing if none is found. */
    public async findOneOrThrow(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T> {
        const start = this.logger.startPerformLog("findOneOrThrow");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'findOneOrThrow'", arg);

            return await this.getPrismaRepository(options?.db).findFirstOrThrow(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Fetches all records matching `where`. */
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

    /** Creates or updates (upsert) a single record. */
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

    /**
     * Creates or updates (upsert) multiple records. Prisma has no native bulk
     * upsert, so each record is saved individually inside a transaction —
     * reusing `options.db` when it's already a transaction client (see
     * `runTransactional`).
     */
    public async saveMany(objs: DeepPartial<T>[], options?: AdapterMethodOptions<T>): Promise<T[]> {
        const start = this.logger.startPerformLog("saveMany");

        try {
            this.logger.logDebug(
                `Saving ${objs.length} record(s) individually inside a transaction`,
            );

            return await this.runTransactional(options?.db, tx =>
                Promise.all(objs.map(obj => this.save(obj, { ...options, db: tx }))),
            );
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Deletes a single record matching `where`. */
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

    /** Deletes every record matching `where`, returning the count of affected rows. */
    public async deleteMany(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<CountResult> {
        const start = this.logger.startPerformLog("deleteMany");

        try {
            const arg = { where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'deleteMany'", arg);

            return await this.getPrismaRepository(options?.db).deleteMany(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /**
     * Deletes every record matching `where`, returning the deleted records.
     * Prisma has no `deleteManyAndReturn`, so this fetches then deletes inside
     * a transaction — reusing `options.db` when it's already a transaction
     * client (see `runTransactional`), so it stays atomic even when it's not
     * the one starting the transaction.
     */
    public async deleteManyReturning(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T[]> {
        const start = this.logger.startPerformLog("deleteManyReturning");

        try {
            const prismaWhere = parsePrismaWhere<T>(where);
            const findArg = { ...this.resolveReadArg(options), where: prismaWhere };
            const deleteArg = { where: prismaWhere };
            this.logger.logDebug("Resolved Prisma args for 'deleteManyReturning'", {
                findArg,
                deleteArg,
            });

            return await this.runTransactional(options?.db, async tx => {
                const repo = this.getPrismaRepository(tx);
                const records = await repo.findMany(findArg);
                await repo.deleteMany(deleteArg);
                return records;
            });
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Updates a single record matching `where`. */
    public async update(
        where: VSRepoWhere<T>,
        obj: DeepPartial<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T> {
        const start = this.logger.startPerformLog("update");

        try {
            const { update } = parsePrismaWriteData(
                obj as PlainObject,
                this.pkName,
                this.relations,
            );
            const arg = {
                ...this.resolveReadArg(options),
                where: parsePrismaWhere<T>(where),
                data: update,
            };
            this.logger.logDebug("Resolved Prisma arg for 'update'", arg);

            return await this.getPrismaRepository(options?.db).update(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Updates every record matching `where`, returning the count of affected rows. */
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

    /** Updates every record matching `where`, returning the updated records. */
    public async updateManyReturning(
        where: VSRepoWhere<T>,
        obj: DeepPartial<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T[]> {
        const start = this.logger.startPerformLog("updateManyReturning");

        try {
            const data = this.stripRelationFields(obj as PlainObject);
            const readArg = this.resolveReadArg(options);
            const arg = {
                ...readArg,
                where: parsePrismaWhere<T>(where),
                data,
            };
            this.logger.logDebug("Resolved Prisma arg for 'updateManyReturning'", arg);

            return await this.runTransactional(options?.db, async tx => {
                const repo = this.getPrismaRepository(tx);
                const updated = await repo.updateManyAndReturn({
                    ...arg,
                    include: undefined,
                    select: { [this.pkName]: true },
                });

                const idsUpdated = updated.map((_: any) => _[this.pkName]);

                return repo.findMany({
                    ...readArg,
                    where: { [this.pkName]: { in: idsUpdated } },
                });
            });
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Returns the number of records matching `where`. */
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

    /** Checks whether at least one record matching `where` exists. */
    public async exists(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<boolean> {
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

    /** Executes a raw query/statement against the underlying database, used by `@QueryMethod`. */
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

    /** Creates a single record. */
    public async create(obj: DeepPartial<T>, options?: AdapterMethodOptions<T>): Promise<T> {
        const start = this.logger.startPerformLog("create");

        try {
            const { create } = parsePrismaWriteData(
                obj as PlainObject,
                this.pkName,
                this.relations,
            );
            const arg = { ...this.resolveReadArg(options), data: create };
            this.logger.logDebug("Resolved Prisma arg for 'create'", arg);

            return await this.getPrismaRepository(options?.db).create(arg);
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /**
     * Creates multiple records in a single operation. Relation fields are
     * stripped (see `stripRelationFields`), since Prisma's `createMany` doesn't
     * support nested writes.
     */
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

    /**
     * Fetches the record matching `where` and returns it deep-merged with
     * `obj`, WITHOUT persisting anything — same behavior the v1 of
     * VSRepository had (see `mergeEntities`). It's on the caller to decide
     * what to do with the result (e.g. call `save` next).
     */
    public async merge<K>(
        where: VSRepoWhere<T>,
        obj: DeepPartial<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<K & T> {
        const start = this.logger.startPerformLog("merge");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'merge'", arg);

            const result = await this.getPrismaRepository(options?.db).findFirst(arg);
            if (!result) return null as unknown as K & T;

            return mergeEntities(result, obj as PlainObject, this.relations) as K & T;
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Creates a record if none matches `where`, otherwise updates it. */
    public async upsert(
        where: VSRepoWhere<T>,
        create: DeepPartial<T>,
        update: DeepPartial<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T> {
        const start = this.logger.startPerformLog("upsert");

        try {
            const parsedCreate = parsePrismaWriteData(
                create as PlainObject,
                this.pkName,
                this.relations,
            ).create;

            const parsedUpdate = parsePrismaWriteData(
                update as PlainObject,
                this.pkName,
                this.relations,
            ).update;

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
