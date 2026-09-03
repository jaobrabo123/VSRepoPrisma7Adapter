import {
    AdapterErrorCode,
    AdapterMethodOptions,
    AdapterQueryOptions,
    CountResult,
    DeepPartial,
    VSLogger,
    VSLogLevel,
    VSRepoAdapter,
    VSRepoAdapterError,
    VSRepoWhere,
} from "vsrepo";
import { parsePrismaWhere } from "./parsers/where.parser";
import { parsePrismaInclude } from "./parsers/include.parser";
import { parsePrismaSelect } from "./parsers/select.parser";
import { parsePrismaOrderBy } from "./parsers/order-by.parser";
import { parsePrismaWriteData } from "./parsers/data.parser";
import { mergeEntities } from "./resolvers/merge-entities.resolver";
import { mapPrismaError } from "./resolvers/map-prisma-error.resolver";
import { validateAdapterConfig } from "./validators/validate-adapter-config.validator";
import { AdapterRelations } from "./types/adapter-relations.type";
import { VSRepoPrisma7AdapterConfig } from "./types/adapter-config.type";
import { PrismaArgLike } from "./types/prisma-arg-like.type";
import { PrismaRepositoryLike } from "./types/prisma-repository-like.type";
import { PlainObject } from "./types/plain-object.type";

/**
 * `VSRepoAdapter` implementation for Prisma 7. Translates every method of the
 * adapter contract into Prisma Client calls, resolving `VSRepoWhere`/`Ordering`/
 * `select`/`include` through the parsers, and — when a
 * `relations` config is provided — resolving relation fields on `create`/
 * `update`/`upsert`/`merge` the same way the v1 of VSRepository did (see
 * `Relation`).
 *
 * Every method always rejects with a `VSRepoAdapterError` — any error raised
 * by Prisma (or by the adapter itself) is translated through `mapPrismaError`
 * before leaving the adapter, so callers never have to deal with a raw
 * Prisma/driver error shape.
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
            validated.logSlowThresholdMs ?? 300,
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
     * writes (scalar fields only). Throws a `VSRepoAdapterError` (code
     * `NOT_SUPPORTED`) instead of silently ignoring the field, when a configured
     * relation field is present in the payload.
     */
    private stripRelationFields(obj: PlainObject): PlainObject {
        if (!this.relations) return obj;

        const data: PlainObject = {};

        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined) continue;

            if (key in (this.relations as PlainObject)) {
                throw new VSRepoAdapterError(
                    `Field '${key}' is a configured relation, but Prisma's *Many operations don't support nested relation writes.`,
                    AdapterErrorCode.NOT_SUPPORTED,
                    null,
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
        try {
            return await this.prisma.$transaction(fn, options);
        } catch (error) {
            throw mapPrismaError(error, "runInTransaction");
        }
    }

    /** Fetches a single record matching `where`. */
    public async findOne(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T | null> {
        const start = this.logger.startPerformLog("run findOne");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'findOne'", arg);

            return await this.getPrismaRepository(options?.db).findFirst(arg);
        } catch (error) {
            throw mapPrismaError(error, "findOne");
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Fetches a single record matching `where`, throwing if none is found. */
    public async findOneOrThrow(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T> {
        const start = this.logger.startPerformLog("run findOneOrThrow");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'findOneOrThrow'", arg);

            return await this.getPrismaRepository(options?.db).findFirstOrThrow(arg);
        } catch (error) {
            throw mapPrismaError(error, "findOneOrThrow");
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Fetches all records matching `where`. */
    public async findMany(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T> & { distinct?: (keyof T)[] },
    ): Promise<T[]> {
        const start = this.logger.startPerformLog("run findMany");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'findMany'", arg);

            return await this.getPrismaRepository(options?.db).findMany(arg);
        } catch (error) {
            throw mapPrismaError(error, "findMany");
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Creates or updates (upsert) a single record. */
    public async save(obj: DeepPartial<T>, options?: AdapterMethodOptions<T>): Promise<T> {
        const start = this.logger.startPerformLog("run save");

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
        } catch (error) {
            throw mapPrismaError(error, "save");
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
        const start = this.logger.startPerformLog("run saveMany");

        try {
            this.logger.logDebug(
                `Saving ${objs.length} record(s) individually inside a transaction`,
            );

            return await this.runTransactional(options?.db, tx =>
                Promise.all(objs.map(obj => this.save(obj, { ...options, db: tx }))),
            );
        } catch (error) {
            throw mapPrismaError(error, "saveMany");
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Deletes a single record matching `where`. */
    public async delete(where: VSRepoWhere<T>, options?: AdapterMethodOptions<T>): Promise<T> {
        const start = this.logger.startPerformLog("run delete");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'delete'", arg);

            return await this.getPrismaRepository(options?.db).delete(arg);
        } catch (error) {
            throw mapPrismaError(error, "delete");
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Deletes every record matching `where`, returning the count of affected rows. */
    public async deleteMany(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<CountResult> {
        const start = this.logger.startPerformLog("run deleteMany");

        try {
            const arg = { where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'deleteMany'", arg);

            return await this.getPrismaRepository(options?.db).deleteMany(arg);
        } catch (error) {
            throw mapPrismaError(error, "deleteMany");
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /**
     * Deletes every record matching `where`, returning the deleted records.
     *
     * Prisma has no `deleteManyAndReturn`, so this does a `findMany` on
     * `where` first and then re-applies the same `where` to a `deleteMany`,
     * both inside a transaction (`runTransactional`).
     *
     * Because the delete is driven by the same `where` (not by the fetched
     * records), a concurrent change between the two operations can make them
     * diverge — e.g. a row inserted after the `findMany` matching the `where`
     * would still be deleted, while a row changed to stop matching wouldn't.
     * If you need to guarantee no concurrency issues, run this method inside a
     * `repository.transaction()` with a higher isolation level, e.g.
     * `TransactionIsolationLevel.SERIALIZABLE`.
     */
    public async deleteManyReturning(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<T[]> {
        const start = this.logger.startPerformLog("run deleteManyReturning");

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
        } catch (error) {
            throw mapPrismaError(error, "deleteManyReturning");
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
        const start = this.logger.startPerformLog("run update");

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
        } catch (error) {
            throw mapPrismaError(error, "update");
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
        const start = this.logger.startPerformLog("run updateMany");

        try {
            const data = this.stripRelationFields(obj as PlainObject);
            const arg = { where: parsePrismaWhere<T>(where), data };
            this.logger.logDebug("Resolved Prisma arg for 'updateMany'", arg);

            return await this.getPrismaRepository(options?.db).updateMany(arg);
        } catch (error) {
            throw mapPrismaError(error, "updateMany");
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
        const start = this.logger.startPerformLog("run updateManyReturning");

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
        } catch (error) {
            throw mapPrismaError(error, "updateManyReturning");
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Returns the number of records matching `where`. */
    public async count(where: VSRepoWhere<T>, options?: AdapterMethodOptions<T>): Promise<number> {
        const start = this.logger.startPerformLog("run count");

        try {
            const arg = { where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'count'", arg);

            return await this.getPrismaRepository(options?.db).count(arg);
        } catch (error) {
            throw mapPrismaError(error, "count");
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Checks whether at least one record matching `where` exists. */
    public async exists(
        where: VSRepoWhere<T>,
        options?: AdapterMethodOptions<T>,
    ): Promise<boolean> {
        const start = this.logger.startPerformLog("run exists");

        try {
            const arg = { where: parsePrismaWhere<T>(where), select: { [this.pkName]: true } };
            this.logger.logDebug("Resolved Prisma arg for 'exists'", arg);

            const result = await this.getPrismaRepository(options?.db).findFirst(arg);
            return result !== null;
        } catch (error) {
            throw mapPrismaError(error, "exists");
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
        } catch (error) {
            throw mapPrismaError(error, "query");
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /** Creates a single record. */
    public async create(obj: DeepPartial<T>, options?: AdapterMethodOptions<T>): Promise<T> {
        const start = this.logger.startPerformLog("run create");

        try {
            const { create } = parsePrismaWriteData(
                obj as PlainObject,
                this.pkName,
                this.relations,
            );
            const arg = { ...this.resolveReadArg(options), data: create };
            this.logger.logDebug("Resolved Prisma arg for 'create'", arg);

            return await this.getPrismaRepository(options?.db).create(arg);
        } catch (error) {
            throw mapPrismaError(error, "create");
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
        const start = this.logger.startPerformLog("run createMany");

        try {
            const data = objs.map(obj => this.stripRelationFields(obj as PlainObject));
            const arg = { data, skipDuplicates: options?.ignoreConflicts };
            this.logger.logDebug("Resolved Prisma arg for 'createMany'", arg);

            return await this.getPrismaRepository(options?.db).createMany(arg);
        } catch (error) {
            throw mapPrismaError(error, "createMany");
        } finally {
            this.logger.endPerformLog(start);
        }
    }

    /**
     * Creates multiple records in a single operation, returning the created records.
     */
    public async createManyReturning(
        objs: DeepPartial<T>[],
        options?: AdapterMethodOptions<T> & { ignoreConflicts?: boolean },
    ): Promise<T[]> {
        const start = this.logger.startPerformLog("run createManyReturning");

        try {
            const data = objs.map(obj => this.stripRelationFields(obj as PlainObject));
            const readArg = this.resolveReadArg(options);
            const arg = { data, skipDuplicates: options?.ignoreConflicts };
            this.logger.logDebug("Resolved Prisma arg for 'createManyReturning'", arg);

            return await this.runTransactional(options?.db, async tx => {
                const repo = this.getPrismaRepository(tx);
                const created = await repo.createManyAndReturn({
                    ...arg,
                    include: undefined,
                    select: { [this.pkName]: true },
                });

                const idsCreated = created.map((_: any) => _[this.pkName]);

                return repo.findMany({
                    ...readArg,
                    where: { [this.pkName]: { in: idsCreated } },
                });
            });
        } catch (error) {
            throw mapPrismaError(error, "createManyReturning");
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
        const start = this.logger.startPerformLog("run merge");

        try {
            const arg = { ...this.resolveReadArg(options), where: parsePrismaWhere<T>(where) };
            this.logger.logDebug("Resolved Prisma arg for 'merge'", arg);

            const result = await this.getPrismaRepository(options?.db).findFirst(arg);
            if (!result) return null as unknown as K & T;

            return mergeEntities(result, obj as PlainObject, this.relations) as K & T;
        } catch (error) {
            throw mapPrismaError(error, "merge");
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
        const start = this.logger.startPerformLog("run upsert");

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
        } catch (error) {
            throw mapPrismaError(error, "upsert");
        } finally {
            this.logger.endPerformLog(start);
        }
    }
}
