// Testes de integração do `VSRepoPrisma7Adapter` contra um Postgres real
// (mesmo espírito do `functional-api.test.ts`/`class-based-api.test.ts` da v1
// de VSRepository). Requer `DATABASE_URL` apontando pra um banco com as
// migrations aplicadas (`npx prisma migrate deploy`) e o Prisma Client
// gerado (`npx prisma generate`) — ver README/CI.
//
// O banco é limpo antes de cada teste (`beforeEach` -> `cleanDatabase`), e
// cada teste cria os próprios registros via `tests/helpers/fixtures.ts`
// (inserts diretos pelo Prisma Client, não pelo adapter), pra manter os
// testes do adapter independentes uns dos outros.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "@jest/globals";
import { AdapterErrorCode, VSLogLevel, VSRepoAdapterError } from "vsrepo";
import { VSRepoPrisma7Adapter } from "../src";
import type { Address, Tag } from "../generated/prisma/client";
import { cleanDatabase, prisma } from "./helpers/db";
import { createPost, createTag, createUser } from "./helpers/fixtures";
import { Post, User } from "./helpers/entities";

describe("VSRepoPrisma7Adapter (integração com Postgres real)", () => {
    let userAdapter: VSRepoPrisma7Adapter<User>;

    beforeAll(async () => {
        await cleanDatabase();
    });

    beforeEach(async () => {
        await cleanDatabase();
        userAdapter = new VSRepoPrisma7Adapter<User>(prisma, {
            tableName: "user",
            pkName: "id",
            logLevel: VSLogLevel.ERROR,
        });
    });

    afterAll(async () => {
        await cleanDatabase();
        await prisma.$disconnect();
    });

    describe("findOne / findOneOrThrow / findMany", () => {
        it("findOne encontra o registro pelo where", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });
            await createUser({ email: "bia@example.com", name: "Bia" });

            const result = await userAdapter.findOne({ email: "ana@example.com" });

            expect(result?.id).toBe(user.id);
            expect(result?.name).toBe("Ana");
        });

        it("findOne retorna 'null' quando nada casa com o where", async () => {
            const result = await userAdapter.findOne({ email: "nao-existe@example.com" });
            expect(result).toBeNull();
        });

        it("findOne aplica operadores de where (contains + ignoreCase)", async () => {
            await createUser({ email: "ana@example.com", name: "Ana Paula" });

            const result = await userAdapter.findOne({
                name: { contains: "ANA PAULA", ignoreCase: true },
            });

            expect(result?.name).toBe("Ana Paula");
        });

        it("findOne usa 'select' quando informado, retornando só os campos pedidos", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            const result = await userAdapter.findOne(
                { id: user.id },
                { select: { id: true, name: true }},
            );

            expect(result).toEqual({ id: user.id, name: "Ana" });
        });

        it("findOne usa 'relations' (include) quando 'select' não é informado", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });
            await createPost(user.id, { title: "Post 1" });
            await createPost(user.id, { title: "Post 2" });

            const result = (await userAdapter.findOne(
                { id: user.id },
                { relations: { posts: true }},
            ));

            expect(result?.posts).toHaveLength(2);
            expect(result?.posts.map((p: Post) => p.title).sort()).toEqual(["Post 1", "Post 2"]);
        });

        it("findOneOrThrow retorna o registro quando existe", async () => {
            const user = await createUser({ email: "ana@example.com" });
            const result = await userAdapter.findOneOrThrow({ id: user.id });
            expect(result.id).toBe(user.id);
        });

        it("findOneOrThrow rejeita com 'VSRepoAdapterError' (code NOT_FOUND) quando não encontra nada", async () => {
            await expect(userAdapter.findOneOrThrow({ id: -1 })).rejects.toThrow(VSRepoAdapterError);

            try {
                await userAdapter.findOneOrThrow({ id: -1 });
                throw new Error("deveria ter lançado VSRepoAdapterError");
            } catch (err) {
                expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.NOT_FOUND);
            }
        });

        it("findMany retorna todos os registros que casam com o where, respeitando 'order' e paginação", async () => {
            await createUser({ email: "c@example.com", name: "Carlos" });
            await createUser({ email: "a@example.com", name: "Ana" });
            await createUser({ email: "b@example.com", name: "Bia" });

            const result = await userAdapter.findMany(
                {},
                { order: { name: "ASC" }, pagination: { offset: 0, limit: 2 } },
            );

            expect(result.map(u => u.name)).toEqual(["Ana", "Bia"]);
        });

        it("findMany suporta 'distinct'", async () => {
            await createUser({ email: "a1@example.com", name: "Mesmo Nome" });
            await createUser({ email: "a2@example.com", name: "Mesmo Nome" });

            const result = await userAdapter.findMany({}, { distinct: ["name"] });

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe("Mesmo Nome");
        });
    });

    describe("count / exists", () => {
        it("count retorna a quantidade de registros que casam com o where", async () => {
            await createUser({ email: "a@example.com", name: "Ana" });
            await createUser({ email: "b@example.com", name: "Bia" });
            await createUser({ email: "c@example.com", name: "Ana" });

            const result = await userAdapter.count({ name: "Ana" });

            expect(result).toBe(2);
        });

        it("exists retorna 'true' quando existe pelo menos um registro", async () => {
            const user = await createUser({ email: "ana@example.com" });
            expect(await userAdapter.exists({ id: user.id })).toBe(true);
        });

        it("exists retorna 'false' quando não existe nenhum registro", async () => {
            expect(await userAdapter.exists({ id: -1 })).toBe(false);
        });
    });

    describe("create / save / update / upsert (sem relations configuradas)", () => {
        it("create insere um novo registro e o retorna", async () => {
            const result = await userAdapter.create({ email: "ana@example.com", name: "Ana" });

            expect(result.id).toBeDefined();
            await expect(
                prisma.user.findUniqueOrThrow({ where: { id: result.id } }),
            ).resolves.toMatchObject({ email: "ana@example.com", name: "Ana" });
        });

        it("save sem pk cria um novo registro", async () => {
            const result = await userAdapter.save({ email: "ana@example.com", name: "Ana" });

            const rows = await prisma.user.findMany();
            expect(rows).toHaveLength(1);
            expect(result.email).toBe("ana@example.com");
        });

        it("save com pk atualiza o registro existente (upsert)", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            const result = await userAdapter.save({ id: user.id, email: user.email, name: "Ana Paula" });

            expect(result.name).toBe("Ana Paula");
            const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
            expect(stored.name).toBe("Ana Paula");
        });

        it("update altera só os campos enviados, sem tocar nos demais", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            const result = await userAdapter.update({ id: user.id }, { name: "Ana Paula" });

            expect(result.name).toBe("Ana Paula");
            expect(result.email).toBe("ana@example.com");
        });

        it("upsert cria quando não encontra nada, e atualiza quando encontra", async () => {
            const created = await userAdapter.upsert(
                { email: "ana@example.com" },
                { email: "ana@example.com", name: "Ana" },
                { name: "Ana Atualizada" },
            );
            expect(created.name).toBe("Ana");

            const updated = await userAdapter.upsert(
                { email: "ana@example.com" },
                { email: "ana@example.com", name: "Ana" },
                { name: "Ana Atualizada" },
            );
            expect(updated.name).toBe("Ana Atualizada");
            expect(updated.id).toBe(created.id);
        });
    });

    describe("relação one-to-one (User <-> Address)", () => {
        beforeEach(() => {
            userAdapter = new VSRepoPrisma7Adapter<User>(prisma, {
                tableName: "user",
                pkName: "id",
                logLevel: VSLogLevel.ERROR,
                relations: {
                    address: { mode: "oto", restriction: "set", pk: "id" },
                },
            });
        });

        it("create com um Address aninhado (sem pk) cria os dois registros", async () => {
            const result = (await userAdapter.create(
                {
                    email: "ana@example.com",
                    name: "Ana",
                    address: { street: "Rua A", city: "Recife", country: "BR" },
                },
                { relations: { address: true } },
            ));

            expect(result.address).toMatchObject({ street: "Rua A", city: "Recife", country: "BR" });

            const stored = await prisma.address.findUnique({ where: { userId: result.id } });
            expect(stored).not.toBeNull();
        });

        it("update enviando o Address como 'null' apaga o Address (restriction 'set')", async () => {
            const user = await createUser({ email: "ana@example.com" });
            await prisma.address.create({
                data: { street: "Rua A", city: "Recife", country: "BR", userId: user.id },
            });

            await userAdapter.update({ id: user.id }, { address: null });

            const stored = await prisma.address.findUnique({ where: { userId: user.id } });
            expect(stored).toBeNull();
        });

        it("update de um Address existente (com pk) faz upsert do Address aninhado", async () => {
            const user = await createUser({ email: "ana@example.com" });
            const address = await prisma.address.create({
                data: { street: "Rua A", city: "Recife", country: "BR", userId: user.id },
            });

            await userAdapter.update(
                { id: user.id },
                {
                    address: {
                        id: address.id,
                        street: "Rua B",
                        city: "Recife",
                        country: "BR",
                    },
                },
            );

            const stored = await prisma.address.findUniqueOrThrow({ where: { id: address.id } });
            expect(stored.street).toBe("Rua B");

            const addressCount = await prisma.address.count({ where: { userId: user.id } });
            expect(addressCount).toBe(1);
        });
    });

    describe("relação many-to-many (Post <-> Tag)", () => {
        let postAdapter: VSRepoPrisma7Adapter<Post>;
        let author: User;

        beforeEach(async () => {
            postAdapter = new VSRepoPrisma7Adapter<Post>(prisma, {
                tableName: "post",
                pkName: "id",
                logLevel: VSLogLevel.ERROR,
                relations: {
                    tags: { mode: "mtm", restriction: "set", pk: "id" },
                },
            });
            author = await createUser({ email: "autor@example.com" });
        });

        it("create com tags mistas (com e sem pk) cria as novas e conecta as existentes", async () => {
            const existingTag = await createTag({ name: "tutorial" });

            const result = (await postAdapter.create(
                {
                    title: "Post com Tags",
                    authorId: author.id,
                    tags: [{ name: "novidade" }, { id: existingTag.id, name: "tutorial" }],
                },
                { relations: { tags: true } },
            ));

            expect(result.tags.map((t: Tag) => t.name).sort()).toEqual(["novidade", "tutorial"]);

            const allTags = await prisma.tag.findMany();
            expect(allTags).toHaveLength(2); // não duplicou a tag existente

            const linkedCount = await prisma.tag.count({
                where: { posts: { some: { id: result.id } } },
            });
            expect(linkedCount).toBe(2);
        });

        it("update com restriction 'set' substitui o conjunto de tags do post", async () => {
            const post = await createPost(author.id, { title: "Post" });
            const tagA = await createTag({ name: "a" });
            const tagB = await createTag({ name: "b" });
            await prisma.post.update({
                where: { id: post.id },
                data: { tags: { connect: [{ id: tagA.id }] } },
            });

            await postAdapter.update({ id: post.id }, { tags: [{ id: tagB.id, name: "b" }] });

            const stored = await prisma.post.findUniqueOrThrow({
                where: { id: post.id },
                include: { tags: true },
            });
            expect(stored.tags.map((t: Tag) => t.id)).toEqual([tagB.id]);
        });

        it("createMany lança 'VSRepoAdapterError' (code NOT_SUPPORTED) se um objeto trouxer o campo de relação", async () => {
            await expect(
                postAdapter.createMany([{ title: "x", authorId: author.id, tags: [] }]),
            ).rejects.toThrow(VSRepoAdapterError);

            try {
                await postAdapter.createMany([{ title: "x", authorId: author.id, tags: [] }]);
            } catch (err) {
                expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.NOT_SUPPORTED);
            }

            expect(await prisma.post.count()).toBe(0);
        });
    });

    describe("delete / deleteMany / deleteManyReturning", () => {
        it("delete remove o registro e o retorna", async () => {
            const user = await createUser({ email: "ana@example.com" });

            const result = await userAdapter.delete({ id: user.id });

            expect(result.id).toBe(user.id);
            expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
        });

        it("deleteMany remove todos os registros que casam com o where e retorna o count", async () => {
            await createUser({ email: "a@example.com", name: "Ana" });
            await createUser({ email: "b@example.com", name: "Ana" });
            await createUser({ email: "c@example.com", name: "Bia" });

            const result = await userAdapter.deleteMany({ name: "Ana" });

            expect(result.count).toBe(2);
            expect(await prisma.user.count()).toBe(1);
        });

        it("deleteManyReturning apaga e devolve os registros apagados", async () => {
            await createUser({ email: "a@example.com", name: "Ana" });
            await createUser({ email: "b@example.com", name: "Ana" });

            const result = await userAdapter.deleteManyReturning({ name: "Ana" });

            expect(result).toHaveLength(2);
            expect(await prisma.user.count()).toBe(0);
        });
    });

    describe("updateManyReturning", () => {
        it("atualiza todos os registros que casam com o where e devolve os atualizados", async () => {
            await createUser({ email: "a@example.com", name: "Ana" });
            await createUser({ email: "b@example.com", name: "Ana" });
            await createUser({ email: "c@example.com", name: "Bia" });

            const result = await userAdapter.updateManyReturning({ name: "Ana" }, { name: "Ana Atualizada" });

            expect(result).toHaveLength(2);
            expect(result.every(u => u.name === "Ana Atualizada")).toBe(true);
            expect(await prisma.user.count({ where: { name: "Bia" } })).toBe(1);
        });

        it("lança 'VSRepoAdapterError' (code NOT_SUPPORTED) se o payload trouxer um campo de relação configurada", async () => {
            const postAdapter = new VSRepoPrisma7Adapter<Post>(prisma, {
                tableName: "post",
                pkName: "id",
                logLevel: VSLogLevel.ERROR,
                relations: { tags: { mode: "mtm", restriction: "set", pk: "id" } },
            });

            await expect(
                postAdapter.updateManyReturning({}, { tags: [] }),
            ).rejects.toThrow(VSRepoAdapterError);
        });
    });

    describe("saveMany", () => {
        it("salva cada registro individualmente, dentro de uma transação", async () => {
            const existing = await createUser({ email: "existente@example.com", name: "Antigo" });

            const result = await userAdapter.saveMany([
                { email: "novo@example.com", name: "Novo" },
                { id: existing.id, email: existing.email, name: "Atualizado" },
            ]);

            expect(result).toHaveLength(2);
            expect(await prisma.user.count()).toBe(2);
            const updated = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
            expect(updated.name).toBe("Atualizado");
        });

        it("propaga 'VSRepoAdapterError' (code UNIQUE_CONSTRAINT_VIOLATION) e desfaz a transação quando um dos saves falha (email duplicado)", async () => {
            await createUser({ email: "duplicado@example.com" });

            await expect(
                userAdapter.saveMany([
                    { email: "ok@example.com", name: "Ok" },
                    { email: "duplicado@example.com", name: "Duplicado" },
                ]),
            ).rejects.toThrow(VSRepoAdapterError);

            try {
                await userAdapter.saveMany([
                    { email: "ok2@example.com", name: "Ok" },
                    { email: "duplicado@example.com", name: "Duplicado" },
                ]);
            } catch (err) {
                expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.UNIQUE_CONSTRAINT_VIOLATION);
            }

            // nada deve ter sido persistido: a transação inteira foi desfeita
            expect(await prisma.user.count({ where: { email: "ok@example.com" } })).toBe(0);
            expect(await prisma.user.count({ where: { email: "ok2@example.com" } })).toBe(0);
        });
    });

    describe("merge", () => {
        it("busca o registro e devolve o merge, sem persistir nada", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            const result = await userAdapter.merge<{ name: string }>({ id: user.id }, { name: "Ana Paula" });

            expect(result?.name).toBe("Ana Paula");
            const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
            expect(stored.name).toBe("Ana"); // não foi persistido
        });

        it("retorna 'null' quando nenhum registro é encontrado", async () => {
            const result = await userAdapter.merge({ id: -1 }, { name: "Ana" });
            expect(result).toBeNull();
        });
    });

    describe("createMany", () => {
        it("cria vários registros de uma vez e retorna o count", async () => {
            const result = await userAdapter.createMany([
                { email: "a@example.com", name: "A" },
                { email: "b@example.com", name: "B" },
            ]);

            expect(result.count).toBe(2);
            expect(await prisma.user.count()).toBe(2);
        });

        it("'ignoreConflicts: true' ignora duplicidades em vez de rejeitar", async () => {
            await createUser({ email: "duplicado@example.com" });

            const result = await userAdapter.createMany(
                [
                    { email: "duplicado@example.com", name: "Duplicado" },
                    { email: "novo@example.com", name: "Novo" },
                ],
                { ignoreConflicts: true },
            );

            expect(result.count).toBe(1); // só o "novo@example.com" foi inserido
            expect(await prisma.user.count()).toBe(2);
        });
    });

    describe("createManyReturning", () => {
        it("cria vários registros de uma vez e devolve os registros criados", async () => {
            const result = await userAdapter.createManyReturning([
                { email: "a@example.com", name: "A" },
                { email: "b@example.com", name: "B" },
            ]);

            expect(result).toHaveLength(2);
            expect(result.map(u => u.name).sort()).toEqual(["A", "B"]);
            expect(await prisma.user.count()).toBe(2);
        });

        it("'ignoreConflicts: true' não devolve os registros não inseridos (duplicados)", async () => {
            await createUser({ email: "duplicado@example.com" });

            const result = await userAdapter.createManyReturning(
                [
                    { email: "duplicado@example.com", name: "Duplicado" },
                    { email: "novo@example.com", name: "Novo" },
                ],
                { ignoreConflicts: true },
            );

            expect(result).toHaveLength(1); // só o "novo@example.com" foi inserido
            expect(result[0]?.email).toBe("novo@example.com");
            expect(await prisma.user.count()).toBe(2);
        });

        it("lança 'VSRepoAdapterError' (code NOT_SUPPORTED) se um objeto trouxer um campo de relação configurada", async () => {
            const author = await createUser({ email: "autor@example.com", name: "Autor" });
            const tag = await createTag({ name: "ts" });
            const postAdapter = new VSRepoPrisma7Adapter<Post>(prisma, {
                tableName: "post",
                pkName: "id",
                logLevel: VSLogLevel.ERROR,
                relations: { tags: { mode: "mtm", restriction: "set", pk: "id" } },
            });

            await expect(
                postAdapter.createManyReturning([
                    { title: "x", authorId: author.id, tags: [tag] },
                ]),
            ).rejects.toThrow(VSRepoAdapterError);

            try {
                await postAdapter.createManyReturning([
                    { title: "x", authorId: author.id, tags: [tag] },
                ]);
            } catch (err) {
                expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.NOT_SUPPORTED);
            }
        });
    });

    describe("query (raw)", () => {
        it("usa consulta somente-leitura por padrão ('modifying: false')", async () => {
            await createUser({ email: "a@example.com" });
            await createUser({ email: "b@example.com" });

            const result = await userAdapter.query<{ total: number }[]>(
                'SELECT count(*)::int as total FROM "User"',
                { modifying: false },
            );

            expect(result[0]?.total).toBe(2);
        });

        it("usa '$executeRawUnsafe' quando 'modifying: true', e a alteração é persistida", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            const affected = await userAdapter.query('UPDATE "User" SET name = $1 WHERE id = $2', {
                modifying: true,
                args: ["Ana Paula", user.id],
            });

            expect(affected).toBe(1);
            const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
            expect(stored.name).toBe("Ana Paula");
        });
    });

    describe("incrementOne / decrementOne / multiplyOne / divideOne", () => {
        it("incrementOne soma 'value' ao campo, avaliado server-side, e retorna o registro já atualizado", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 } as any);

            const result = await userAdapter.incrementOne("balance" as any, 50 as any, {
                id: user.id,
            });

            expect((result as any).balance).toBe(150);
            const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
            expect((stored as any).balance).toBe(150);
        });

        it("decrementOne subtrai 'value' do campo", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 } as any);

            const result = await userAdapter.decrementOne("balance" as any, 30 as any, {
                id: user.id,
            });

            expect((result as any).balance).toBe(70);
        });

        it("multiplyOne multiplica o valor atual do campo por 'value'", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 } as any);

            const result = await userAdapter.multiplyOne("balance" as any, 3 as any, {
                id: user.id,
            });

            expect((result as any).balance).toBe(300);
        });

        it("divideOne divide o valor atual do campo por 'value'", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 } as any);

            const result = await userAdapter.divideOne("balance" as any, 4 as any, {
                id: user.id,
            });

            expect((result as any).balance).toBe(25);
        });

        it("divideOne por zero rejeita com um 'VSRepoAdapterError' (comportamento nativo do Postgres pra colunas inteiras)", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 } as any);

            await expect(
                userAdapter.divideOne("balance" as any, 0 as any, { id: user.id }),
            ).rejects.toThrow(VSRepoAdapterError);
        });

        it("é avaliado server-side contra o valor atual (não um read-modify-write no cliente): chamadas concorrentes acumulam", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 0 } as any);

            await Promise.all([
                userAdapter.incrementOne("balance" as any, 10 as any, { id: user.id }),
                userAdapter.incrementOne("balance" as any, 10 as any, { id: user.id }),
                userAdapter.incrementOne("balance" as any, 10 as any, { id: user.id }),
            ]);

            const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
            expect((stored as any).balance).toBe(30);
        });

        it("funciona num campo 'Decimal' (ex: 'price' de 'Post')", async () => {
            const author = await createUser({ email: "ana@example.com" });
            const post = await createPost(author.id, { price: "19.90" } as any);
            const postAdapter = new VSRepoPrisma7Adapter<Post>(prisma, {
                tableName: "post",
                pkName: "id",
                logLevel: VSLogLevel.ERROR,
            });

            const result = await postAdapter.incrementOne("price" as any, 5.1 as any, {
                id: post.id,
            });

            expect(Number((result as any).price)).toBeCloseTo(25.0, 2);
        });

        it("propaga 'select' pro registro retornado", async () => {
            const user = await createUser({
                email: "ana@example.com",
                balance: 100,
                name: "Ana",
            } as any);

            const result = await userAdapter.incrementOne(
                "balance" as any,
                10 as any,
                { id: user.id },
                { select: { id: true, balance: true } as any },
            );

            expect(result).toEqual({ id: user.id, balance: 110 });
        });
    });

    describe("sum / average / min / max", () => {
        it("sum soma o campo entre todos os registros que casam com o 'where' (todos os registros se vazio)", async () => {
            await createUser({ email: "a@example.com", balance: 100 } as any);
            await createUser({ email: "b@example.com", balance: 200 } as any);
            await createUser({ email: "c@example.com", balance: 300 } as any);

            const result = await userAdapter.sum("balance" as any, {});

            expect(result).toBe(600);
        });

        it("sum retorna 'null' (não '0') quando nenhum registro casa com o 'where'", async () => {
            await createUser({ email: "a@example.com", balance: 100 } as any);

            const result = await userAdapter.sum("balance" as any, {
                email: "nao-existe@example.com",
            });

            expect(result).toBeNull();
        });

        it("sum respeita um 'where' explícito", async () => {
            await createUser({ email: "a@example.com", balance: 100, name: "Ana" } as any);
            await createUser({ email: "b@example.com", balance: 200, name: "Bia" } as any);

            const result = await userAdapter.sum("balance" as any, { name: "Ana" });

            expect(result).toBe(100);
        });

        it("average calcula a média aritmética", async () => {
            await createUser({ email: "a@example.com", balance: 100 } as any);
            await createUser({ email: "b@example.com", balance: 300 } as any);

            const result = await userAdapter.average("balance" as any, {});

            expect(result).toBe(200);
        });

        it("min retorna o menor valor", async () => {
            await createUser({ email: "a@example.com", balance: 100 } as any);
            await createUser({ email: "b@example.com", balance: 30 } as any);
            await createUser({ email: "c@example.com", balance: 300 } as any);

            const result = await userAdapter.min("balance" as any, {});

            expect(result).toBe(30);
        });

        it("max retorna o maior valor", async () => {
            await createUser({ email: "a@example.com", balance: 100 } as any);
            await createUser({ email: "b@example.com", balance: 30 } as any);
            await createUser({ email: "c@example.com", balance: 300 } as any);

            const result = await userAdapter.max("balance" as any, {});

            expect(result).toBe(300);
        });

        it("num campo 'Decimal' (ex: 'price' de 'Post'), retornam 'number' em vez de 'Decimal'", async () => {
            const author = await createUser({ email: "ana@example.com" });
            await createPost(author.id, { price: "10.50" } as any);
            await createPost(author.id, { price: "20.25" } as any);
            const postAdapter = new VSRepoPrisma7Adapter<Post>(prisma, {
                tableName: "post",
                pkName: "id",
                logLevel: VSLogLevel.ERROR,
            });

            const result = await postAdapter.sum("price" as any, {});

            expect(typeof result).toBe("number");
            expect(result).toBeCloseTo(30.75, 2);
        });

        it("ignora registros cujo campo é 'null' (comportamento nativo do SQL 'SUM'/'AVG'/'MIN'/'MAX')", async () => {
            await createUser({ email: "a@example.com", balance: 100, bonusPoints: null } as any);
            await createUser({ email: "b@example.com", balance: 200, bonusPoints: 50 } as any);

            const result = await userAdapter.sum("bonusPoints" as any, {});

            expect(result).toBe(50);
        });
    });

    describe("transações e getDbClient", () => {
        it("getDbClient retorna o client raiz", () => {
            expect(userAdapter.getDbClient()).toBe(prisma);
        });

        it("runInTransaction confirma as escritas quando o callback resolve", async () => {
            await userAdapter.runInTransaction(async (tx: typeof prisma) => {
                await tx.user.create({ data: { email: "a@example.com", name: "A" } });
            });

            expect(await prisma.user.count()).toBe(1);
        });

        it("runInTransaction desfaz as escritas quando o callback rejeita", async () => {
            await expect(
                userAdapter.runInTransaction(async (tx: typeof prisma) => {
                    await tx.user.create({ data: { email: "a@example.com", name: "A" } });
                    throw new Error("falha proposital");
                }),
            ).rejects.toThrow("falha proposital");

            expect(await prisma.user.count()).toBe(0);
        });

        it("saveMany reaproveita um client de transação já ativo (options.db) em vez de abrir uma nova", async () => {
            await prisma.$transaction(async (tx) => {
                await userAdapter.saveMany([{ email: "a@example.com", name: "A" }], { db: tx });

                // dentro da mesma transação, o registro já é visível
                expect(await tx.user.count()).toBe(1);
            });

            expect(await prisma.user.count()).toBe(1);
        });
    });
});
