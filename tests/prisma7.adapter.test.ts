// Testes unitários do `VSRepoPrisma7Adapter`.
//
// Diferente dos testes de integração da v1 de VSRepository (que rodavam
// contra um Postgres real), aqui o "Prisma Client" é um mock (`jest.fn()`
// nos delegates — ver `tests/helpers/fake-prisma.ts`). O foco é verificar
// QUAL método do client o adapter chama e COM QUE argumento, já que é isso
// que o adapter é responsável por montar corretamente (where/select/include/
// orderBy/paginação, e a resolução de relations no create/update/upsert).
//
// As entidades usadas (`User`/`Address`/`Post`/`Tag`) espelham
// `prisma/schema.prisma`, cobrindo:
//  - one-to-one:   User <-> Address
//  - one-to-many:  User -> Post
//  - many-to-many: Post <-> Tag

import { describe, it, expect, beforeEach } from "@jest/globals";
import { VSLogLevel } from "vsrepo";
import { VSRepoPrisma7Adapter, VSRepoPrisma7AdapterError } from "../src";
import { Address, Post, Tag, User } from "./helpers/entities";
import { createFakePrisma, FakePrisma } from "./helpers/fake-prisma";

describe("VSRepoPrisma7Adapter", () => {
    let fake: FakePrisma;
    let adapter: VSRepoPrisma7Adapter<User>;

    beforeEach(() => {
        fake = createFakePrisma();
        adapter = new VSRepoPrisma7Adapter<User>(fake.client, {
            tableName: "user",
            pkName: "id",
            logLevel: VSLogLevel.ERROR,
        });
    });

    describe("findOne / findOneOrThrow / findMany", () => {
        it("findOne monta where/select/include/orderBy e delega para 'findFirst'", async () => {
            const record: User = { id: 1, email: "ana@example.com", name: "Ana" };
            fake.user.findFirst.mockResolvedValue(record);

            const result = await adapter.findOne(
                { email: { contains: "ana", ignoreCase: true } },
                { order: { name: "ASC" }, pagination: { offset: 5, limit: 10 } },
            );

            expect(result).toBe(record);
            expect(fake.user.findFirst).toHaveBeenCalledWith({
                where: { email: { contains: "ana", mode: "insensitive" } },
                select: undefined,
                include: undefined,
                orderBy: { name: "asc" },
                skip: 5,
                take: 10,
                distinct: undefined,
            });
        });

        it("findOne usa 'select' quando informado, e ignora 'relations' nesse caso", async () => {
            fake.user.findFirst.mockResolvedValue(null);

            await adapter.findOne(
                { id: 1 },
                { select: { id: true, name: true } as any, relations: { posts: true } as any },
            );

            expect(fake.user.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    select: { id: true, name: true },
                    include: undefined,
                }),
            );
        });

        it("findOne usa 'include' (via relations) quando 'select' não é informado", async () => {
            fake.user.findFirst.mockResolvedValue(null);

            await adapter.findOne({ id: 1 }, { relations: { posts: true } as any });

            expect(fake.user.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    select: undefined,
                    include: { posts: true },
                }),
            );
        });

        it("findOneOrThrow delega para 'findFirstOrThrow'", async () => {
            const record: User = { id: 1, email: "ana@example.com", name: "Ana" };
            fake.user.findFirstOrThrow.mockResolvedValue(record);

            const result = await adapter.findOneOrThrow({ id: 1 });

            expect(result).toBe(record);
            expect(fake.user.findFirstOrThrow).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: 1 } }),
            );
        });

        it("findOneOrThrow propaga o erro quando o client rejeita (ex.: RecordNotFound)", async () => {
            fake.user.findFirstOrThrow.mockRejectedValue(new Error("No User found"));

            await expect(adapter.findOneOrThrow({ id: 999 })).rejects.toThrow("No User found");
        });

        it("findMany delega para 'findMany' e repassa 'distinct'", async () => {
            const records: User[] = [{ id: 1, email: "a@x.com", name: "A" }];
            fake.user.findMany.mockResolvedValue(records);

            const result = await adapter.findMany({}, { distinct: ["email"] });

            expect(result).toBe(records);
            expect(fake.user.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: {}, distinct: ["email"] }),
            );
        });

        it("findMany traduz operadores de where (between / in / not)", async () => {
            fake.user.findMany.mockResolvedValue([]);

            await adapter.findMany({
                id: { between: [1, 10] },
                email: { not: { contains: "spam" } },
            } as any);

            expect(fake.user.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        id: { gte: 1, lte: 10 },
                        email: { not: { contains: "spam" } },
                    },
                }),
            );
        });
    });

    describe("count / exists", () => {
        it("count delega para 'count' com o where traduzido", async () => {
            fake.user.count.mockResolvedValue(3);

            const result = await adapter.count({ name: { contains: "a" } } as any);

            expect(result).toBe(3);
            expect(fake.user.count).toHaveBeenCalledWith({ where: { name: { contains: "a" } } });
        });

        it("exists retorna true quando 'findFirst' encontra um registro", async () => {
            fake.user.findFirst.mockResolvedValue({ id: 1 });

            const result = await adapter.exists({ id: 1 });

            expect(result).toBe(true);
            expect(fake.user.findFirst).toHaveBeenCalledWith({
                where: { id: 1 },
                select: { id: true },
            });
        });

        it("exists retorna false quando 'findFirst' não encontra nada", async () => {
            fake.user.findFirst.mockResolvedValue(null);

            const result = await adapter.exists({ id: 999 });

            expect(result).toBe(false);
        });
    });

    describe("create / save / update / upsert (sem relations configuradas)", () => {
        it("create delega para 'create' repassando o payload como está", async () => {
            const created: User = { id: 1, email: "a@x.com", name: "A" };
            fake.user.create.mockResolvedValue(created);

            const result = await adapter.create({ email: "a@x.com", name: "A" });

            expect(result).toBe(created);
            expect(fake.user.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: { email: "a@x.com", name: "A" } }),
            );
        });

        it("save sem pk no objeto vira 'create'", async () => {
            fake.user.create.mockResolvedValue({ id: 1, email: "a@x.com", name: "A" });

            await adapter.save({ email: "a@x.com", name: "A" });

            expect(fake.user.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: { email: "a@x.com", name: "A" } }),
            );
            expect(fake.user.upsert).not.toHaveBeenCalled();
        });

        it("save com pk no objeto vira 'upsert', e a pk é omitida do 'update'", async () => {
            fake.user.upsert.mockResolvedValue({ id: 1, email: "a@x.com", name: "A2" });

            await adapter.save({ id: 1, email: "a@x.com", name: "A2" });

            expect(fake.user.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 1 },
                    create: { id: 1, email: "a@x.com", name: "A2" },
                    update: { email: "a@x.com", name: "A2" },
                }),
            );
            expect(fake.user.create).not.toHaveBeenCalled();
        });

        it("update delega para 'update', omitindo a pk do payload", async () => {
            fake.user.update.mockResolvedValue({ id: 1, email: "a@x.com", name: "A2" });

            await adapter.update({ id: 1 }, { id: 1, name: "A2" });

            expect(fake.user.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: 1 }, data: { name: "A2" } }),
            );
        });

        it("upsert delega para 'upsert' com 'create'/'update' resolvidos separadamente", async () => {
            fake.user.upsert.mockResolvedValue({ id: 1, email: "a@x.com", name: "A" });

            await adapter.upsert({ email: "a@x.com" }, { email: "a@x.com", name: "A" }, { name: "A2" });

            expect(fake.user.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { email: "a@x.com" },
                    create: { email: "a@x.com", name: "A" },
                    update: { name: "A2" },
                }),
            );
        });
    });

    describe("relação one-to-one (User <-> Address)", () => {
        beforeEach(() => {
            adapter = new VSRepoPrisma7Adapter<User>(fake.client, {
                tableName: "user",
                pkName: "id",
                logLevel: VSLogLevel.ERROR,
                relations: {
                    address: { mode: "oto", restriction: "set", pk: "id" },
                } as any,
            });
        });

        it("create com um Address sem pk gera um 'create' aninhado", async () => {
            fake.user.create.mockResolvedValue({} as User);

            const address: Partial<Address> = { street: "Rua A", city: "Recife", country: "BR" };
            await adapter.create({ email: "a@x.com", address } as any);

            expect(fake.user.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { email: "a@x.com", address: { create: address } },
                }),
            );
        });

        it("create com um Address com pk gera 'connectOrCreate'", async () => {
            fake.user.create.mockResolvedValue({} as User);

            const address: Address = { id: 9, street: "Rua A", city: "Recife", country: "BR", userId: 1 };
            await adapter.create({ email: "a@x.com", address } as any);

            expect(fake.user.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        email: "a@x.com",
                        address: { connectOrCreate: { where: { id: 9 }, create: address } },
                    },
                }),
            );
        });

        it("update enviando o Address como 'null' com restriction 'set' gera '{ delete: true }'", async () => {
            fake.user.update.mockResolvedValue({} as User);

            await adapter.update({ id: 1 }, { address: null } as any);

            expect(fake.user.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: { address: { delete: true } } }),
            );
        });

        it("update de um Address existente (com pk) gera 'upsert' aninhado, sem repetir a pk no 'update'", async () => {
            fake.user.update.mockResolvedValue({} as User);

            const address: Address = { id: 9, street: "Rua B", city: "Recife", country: "BR", userId: 1 };
            await adapter.update({ id: 1 }, { address } as any);

            expect(fake.user.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        address: {
                            upsert: {
                                where: { id: 9 },
                                create: address,
                                update: { street: "Rua B", city: "Recife", country: "BR", userId: 1 },
                            },
                        },
                    },
                }),
            );
        });
    });

    describe("relação many-to-many (Post <-> Tag)", () => {
        let postAdapter: VSRepoPrisma7Adapter<Post>;

        beforeEach(() => {
            postAdapter = new VSRepoPrisma7Adapter<Post>(fake.client, {
                tableName: "post",
                pkName: "id",
                logLevel: VSLogLevel.ERROR,
                relations: {
                    tags: { mode: "mtm", restriction: "set", pk: "id" },
                } as any,
            });
        });

        it("create com tags mistas (com e sem pk) separa 'create' e 'connectOrCreate'", async () => {
            fake.post.create.mockResolvedValue({} as Post);

            const tags: Partial<Tag>[] = [{ name: "novidade" }, { id: 3, name: "tutorial" }];
            await postAdapter.create({ title: "Post", authorId: 1, tags } as any);

            expect(fake.post.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        title: "Post",
                        authorId: 1,
                        tags: {
                            create: [{ name: "novidade" }],
                            connectOrCreate: [{ where: { id: 3 }, create: { id: 3, name: "tutorial" } }],
                        },
                    },
                }),
            );
        });

        it("update com restriction 'set' faz 'set: []' antes de recriar/reconectar as tags", async () => {
            fake.post.update.mockResolvedValue({} as Post);

            const tags: Partial<Tag>[] = [{ id: 3, name: "tutorial" }];
            await postAdapter.update({ id: 1 }, { tags } as any);

            expect(fake.post.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        tags: {
                            set: [],
                            create: [],
                            connectOrCreate: [{ where: { id: 3 }, create: { id: 3, name: "tutorial" } }],
                        },
                    },
                }),
            );
        });

        it("createMany lança 'VSRepoPrisma7AdapterError' se um objeto trouxer o campo de relação", async () => {
            await expect(
                postAdapter.createMany([{ title: "x", authorId: 1, tags: [] } as any]),
            ).rejects.toThrow(VSRepoPrisma7AdapterError);

            expect(fake.post.createMany).not.toHaveBeenCalled();
        });
    });

    describe("delete / deleteMany / deleteManyReturning", () => {
        it("delete delega para 'delete'", async () => {
            const deleted: User = { id: 1, email: "a@x.com", name: "A" };
            fake.user.delete.mockResolvedValue(deleted);

            const result = await adapter.delete({ id: 1 });

            expect(result).toBe(deleted);
            expect(fake.user.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }));
        });

        it("deleteMany delega para 'deleteMany' e devolve o CountResult", async () => {
            fake.user.deleteMany.mockResolvedValue({ count: 4 });

            const result = await adapter.deleteMany({ name: { contains: "x" } } as any);

            expect(result).toEqual({ count: 4 });
            expect(fake.user.deleteMany).toHaveBeenCalledWith({ where: { name: { contains: "x" } } });
        });

        it("deleteManyReturning busca os registros e depois apaga, dentro de uma transação", async () => {
            const matched: User[] = [{ id: 1, email: "a@x.com", name: "A" }];
            fake.user.findMany.mockResolvedValue(matched);
            fake.user.deleteMany.mockResolvedValue({ count: 1 });

            const result = await adapter.deleteManyReturning({ id: 1 });

            expect(result).toBe(matched);
            expect(fake.client.$transaction).toHaveBeenCalledTimes(1);
            expect(fake.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }));
            expect(fake.user.deleteMany).toHaveBeenCalledWith({ where: { id: 1 } });
        });
    });

    describe("updateManyReturning", () => {
        it("faz updateManyAndReturn (só com a pk) e depois um findMany com as pks atualizadas", async () => {
            fake.user.updateManyAndReturn.mockResolvedValue([{ id: 1 }, { id: 2 }]);
            const updated: User[] = [
                { id: 1, email: "a@x.com", name: "A2" },
                { id: 2, email: "b@x.com", name: "B2" },
            ];
            fake.user.findMany.mockResolvedValue(updated);

            const result = await adapter.updateManyReturning({ name: "old" } as any, { name: "A2" } as any);

            expect(result).toBe(updated);
            expect(fake.user.updateManyAndReturn).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { name: "old" },
                    data: { name: "A2" },
                    include: undefined,
                    select: { id: true },
                }),
            );
            expect(fake.user.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: { in: [1, 2] } } }),
            );
        });

        it("lança 'VSRepoPrisma7AdapterError' se o payload trouxer um campo de relação configurada", async () => {
            const postAdapter = new VSRepoPrisma7Adapter<Post>(fake.client, {
                tableName: "post",
                pkName: "id",
                logLevel: VSLogLevel.ERROR,
                relations: { tags: { mode: "mtm", restriction: "set", pk: "id" } } as any,
            });

            await expect(
                postAdapter.updateManyReturning({} as any, { tags: [] } as any),
            ).rejects.toThrow(VSRepoPrisma7AdapterError);
        });
    });

    describe("saveMany", () => {
        it("salva cada registro individualmente dentro de uma transação", async () => {
            fake.user.create.mockResolvedValueOnce({ id: 1, email: "a@x.com", name: "A" });
            fake.user.upsert.mockResolvedValueOnce({ id: 2, email: "b@x.com", name: "B" });

            const result = await adapter.saveMany([
                { email: "a@x.com", name: "A" },
                { id: 2, email: "b@x.com", name: "B" },
            ]);

            expect(result).toEqual([
                { id: 1, email: "a@x.com", name: "A" },
                { id: 2, email: "b@x.com", name: "B" },
            ]);
            expect(fake.client.$transaction).toHaveBeenCalledTimes(1);
            expect(fake.user.create).toHaveBeenCalledTimes(1);
            expect(fake.user.upsert).toHaveBeenCalledTimes(1);
        });
    });

    describe("merge", () => {
        it("busca o registro e devolve o merge profundo com o objeto informado, sem persistir nada", async () => {
            fake.user.findFirst.mockResolvedValue({ id: 1, email: "a@x.com", name: "A" });

            const result = await adapter.merge<{ name: string }>({ id: 1 }, { name: "A2" });

            expect(result).toEqual({ id: 1, email: "a@x.com", name: "A2" });
            expect(fake.user.update).not.toHaveBeenCalled();
            expect(fake.user.upsert).not.toHaveBeenCalled();
        });

        it("retorna 'null' quando nenhum registro é encontrado", async () => {
            fake.user.findFirst.mockResolvedValue(null);

            const result = await adapter.merge({ id: 999 }, { name: "A2" });

            expect(result).toBeNull();
        });
    });

    describe("createMany", () => {
        it("delega para 'createMany' repassando 'skipDuplicates'", async () => {
            fake.user.createMany.mockResolvedValue({ count: 2 });

            const result = await adapter.createMany(
                [
                    { email: "a@x.com", name: "A" },
                    { email: "b@x.com", name: "B" },
                ],
                { ignoreConflicts: true },
            );

            expect(result).toEqual({ count: 2 });
            expect(fake.user.createMany).toHaveBeenCalledWith({
                data: [
                    { email: "a@x.com", name: "A" },
                    { email: "b@x.com", name: "B" },
                ],
                skipDuplicates: true,
            });
        });
    });

    describe("query (raw)", () => {
        it("usa '$queryRawUnsafe' quando 'modifying' é false/omitido", async () => {
            fake.client.$queryRawUnsafe.mockResolvedValue([{ total: 3 }]);

            const result = await adapter.query("SELECT count(*) as total FROM \"User\" WHERE id > $1", {
                modifying: false,
                args: [0],
            });

            expect(result).toEqual([{ total: 3 }]);
            expect(fake.client.$queryRawUnsafe).toHaveBeenCalledWith(
                "SELECT count(*) as total FROM \"User\" WHERE id > $1",
                0,
            );
            expect(fake.client.$executeRawUnsafe).not.toHaveBeenCalled();
        });

        it("usa '$executeRawUnsafe' quando 'modifying' é true", async () => {
            fake.client.$executeRawUnsafe.mockResolvedValue(2);

            const result = await adapter.query('UPDATE "User" SET name = $1 WHERE id = $2', {
                modifying: true,
                args: ["A2", 1],
            });

            expect(result).toBe(2);
            expect(fake.client.$executeRawUnsafe).toHaveBeenCalledWith(
                'UPDATE "User" SET name = $1 WHERE id = $2',
                "A2",
                1,
            );
        });
    });

    describe("transações e getDbClient", () => {
        it("getDbClient retorna o client raiz", () => {
            expect(adapter.getDbClient()).toBe(fake.client);
        });

        it("runInTransaction delega para '$transaction' repassando as options", async () => {
            fake.client.$transaction.mockImplementationOnce((fn: any) => fn(fake.client));

            const isolationLevel = "Serializable";
            const result = await adapter.runInTransaction(async () => "ok", { isolationLevel } as any);

            expect(result).toBe("ok");
            expect(fake.client.$transaction).toHaveBeenCalledWith(
                expect.any(Function),
                { isolationLevel },
            );
        });

        it("saveMany reaproveita um client de transação já ativo (options.db) em vez de abrir uma nova", async () => {
            const txClient: any = {
                user: fake.user,
                $transaction: jest.fn(),
                // sem '$on': simula um client de transação, não o client raiz.
            };
            fake.user.create.mockResolvedValue({ id: 1, email: "a@x.com", name: "A" });

            await adapter.saveMany([{ email: "a@x.com", name: "A" }], { db: txClient });

            expect(txClient.$transaction).not.toHaveBeenCalled();
            expect(fake.client.$transaction).not.toHaveBeenCalled();
            expect(fake.user.create).toHaveBeenCalledTimes(1);
        });
    });
});
