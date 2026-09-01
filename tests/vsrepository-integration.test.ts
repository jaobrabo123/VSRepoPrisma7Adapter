// Testes de integração do `VSRepoPrisma7Adapter` usado **junto com o
// `VSRepository`** (v2), contra um Postgres real — igual em espírito ao
// `prisma7.adapter.test.ts`, mas em vez de chamar o adapter diretamente,
// aqui ele é passado pro construtor de repositórios concretos que estendem
// `VSRepository`, do mesmo jeito que uma aplicação real usaria (ver
// `example.ts`/README, seção "Basic usage").
//
// O objetivo é validar a integração ponta a ponta: `VSRepository` delega pro
// adapter, o adapter resolve `where`/`select`/`relations`/etc. e fala com o
// Prisma Client, e o resultado volta passando pelas duas camadas — incluindo
// `transaction()` compartilhando o client entre repositórios diferentes.
//
// NOTA sobre `@DynamicMethod`/`@QueryMethod`: não são cobertos aqui de
// propósito. Esses decorators usam campos `declare` (ver `example.ts`), e o
// babel-jest deste repo (usado no lugar do ts-jest só por causa do
// compilador nativo do TS 7 — ver comentário no `jest.config.js`) não
// suporta a combinação `declare` + decorators legacy: uma classe com esses
// campos já quebra o parse do arquivo inteiro no jest, mesmo o campo nunca
// sendo chamado. `tsc`/`test:types` aceita o padrão numa boa (é só o
// babel-jest que não), então essa cobertura fica de fora até esse gap de
// tooling ser resolvido — se quiser, dá pra abrir isso como um follow-up
// separado (ex.: um jest project à parte rodando via ts-jest só pra esse
// caso).
//
// Requer `DATABASE_URL` apontando pra um banco com as migrations aplicadas
// e o Prisma Client gerado — ver README/CI (mesmo setup do
// `prisma7.adapter.test.ts`).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "@jest/globals";
import { AdapterErrorCode, VSLogLevel, VSRepoAdapterError, VSRepository } from "vsrepo";
import { VSRepoPrisma7Adapter, Prisma7OrmTypes } from "../src";
import type { Prisma, PrismaClient, Tag } from "../generated/prisma/client";
import { cleanDatabase, prisma } from "./helpers/db";
import { createPost, createTag, createUser } from "./helpers/fixtures";
import { Post, User } from "./helpers/entities";

type MyOrmTypes = Prisma7OrmTypes<PrismaClient, Prisma.TransactionClient>;

/**
 * Repositório concreto de `User`, no mesmo espírito do `UserRepository` do
 * `example.ts`: configura `relations` (write) pro adapter resolver `address`
 * (oto) e `posts` (otm) em `create`/`update`/`save`.
 */
class UserRepository extends VSRepository<User, number, MyOrmTypes> {
    constructor() {
        super({
            adapter: new VSRepoPrisma7Adapter<User>(prisma, {
                tableName: "user",
                pkName: "id",
                relations: {
                    address: { mode: "oto", restriction: "set", pk: "id" },
                    posts: { mode: "otm", restriction: "add", pk: "id" },
                },
                logLevel: VSLogLevel.ERROR,
            }),
            pkName: "id",
            logLevel: VSLogLevel.ERROR,
        });
    }
}

/**
 * Repositório concreto de `Post`, configurado com `tags` (mtm) — cobre a
 * relação muitos-para-muitos através da `VSRepository`, complementando o
 * `oto`/`otm` já cobertos pelo `UserRepository` acima.
 */
class PostRepository extends VSRepository<Post, number, MyOrmTypes> {
    constructor() {
        super({
            adapter: new VSRepoPrisma7Adapter<Post>(prisma, {
                tableName: "post",
                pkName: "id",
                relations: {
                    tags: { mode: "mtm", restriction: "set", pk: "id" },
                },
                logLevel: VSLogLevel.ERROR,
            }),
            pkName: "id",
            logLevel: VSLogLevel.ERROR,
        });
    }
}

describe("VSRepoPrisma7Adapter usado através de uma VSRepository real (integração com Postgres)", () => {
    let userRepository: UserRepository;
    let postRepository: PostRepository;

    beforeAll(async () => {
        await cleanDatabase();
    });

    beforeEach(async () => {
        await cleanDatabase();
        userRepository = new UserRepository();
        postRepository = new PostRepository();
    });

    afterAll(async () => {
        await cleanDatabase();
        await prisma.$disconnect();
    });

    describe("CRUD básico via VSRepository (get/save/patch/remove/...)", () => {
        it("get/getOrThrow buscam pela PK, delegando pro adapter", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            expect((await userRepository.get(user.id))?.name).toBe("Ana");
            expect((await userRepository.getOrThrow(user.id)).name).toBe("Ana");
        });

        it("get retorna 'null' e getOrThrow rejeita quando a PK não existe", async () => {
            expect(await userRepository.get(-1)).toBeNull();
            await expect(userRepository.getOrThrow(-1)).rejects.toThrow(VSRepoAdapterError);
        });

        it("getList busca várias PKs de uma vez", async () => {
            const a = await createUser({ email: "a@example.com", name: "A" });
            const b = await createUser({ email: "b@example.com", name: "B" });
            await createUser({ email: "c@example.com", name: "C" });

            const result = await userRepository.getList([a.id, b.id]);

            expect(result.map(u => u.name).sort()).toEqual(["A", "B"]);
        });

        it("getAll respeita 'order' e 'pagination'", async () => {
            await createUser({ email: "c@example.com", name: "Carlos" });
            await createUser({ email: "a@example.com", name: "Ana" });
            await createUser({ email: "b@example.com", name: "Bia" });

            const result = await userRepository.getAll({
                order: { name: "ASC" },
                pagination: { offset: 0, limit: 2 },
            });

            expect(result.map(u => u.name)).toEqual(["Ana", "Bia"]);
        });

        it("save sem pk cria, e com pk atualiza (upsert)", async () => {
            const created = await userRepository.save({ email: "ana@example.com", name: "Ana" });
            expect(created.id).toBeDefined();

            const updated = await userRepository.save({
                id: created.id,
                email: created.email,
                name: "Ana Paula",
            });

            expect(updated.name).toBe("Ana Paula");
            expect(await prisma.user.count()).toBe(1);
        });

        it("patch altera só os campos enviados", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            const result = await userRepository.patch(user.id, { name: "Ana Paula" });

            expect(result.name).toBe("Ana Paula");
            expect(result.email).toBe("ana@example.com");
        });

        it("total/has refletem o estado do banco", async () => {
            const user = await createUser({ email: "ana@example.com" });
            await createUser({ email: "bia@example.com" });

            expect(await userRepository.total()).toBe(2);
            expect(await userRepository.has(user.id)).toBe(true);
            expect(await userRepository.has(-1)).toBe(false);
        });

        it("remove/removeList apagam registros pela PK", async () => {
            const a = await createUser({ email: "a@example.com" });
            const b = await createUser({ email: "b@example.com" });
            const c = await createUser({ email: "c@example.com" });

            await userRepository.remove(a.id);
            const removedCount = await userRepository.removeList([b.id, c.id]);

            expect(await prisma.user.count()).toBe(0);
            expect(removedCount.count).toBe(2);
        });

        it("merge busca e devolve o merge em memória, sem persistir nada", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            const merged = await userRepository.merge(user.id, { name: "Ana Paula" });

            expect(merged?.name).toBe("Ana Paula");
            expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(
                "Ana",
            );
        });
    });

    describe("saveList()", () => {
        it("salva vários registros de uma vez, cada um upsertado individualmente", async () => {
            const existing = await createUser({ email: "existente@example.com", name: "Antigo" });

            const result = await userRepository.saveList([
                { email: "novo@example.com", name: "Novo" },
                { id: existing.id, email: existing.email, name: "Atualizado" },
            ]);

            expect(result).toHaveLength(2);
            expect(await prisma.user.count()).toBe(2);
        });
    });

    describe("relations resolvidas pelo adapter, através da VSRepository", () => {
        it("save com um Address aninhado (oto) cria as duas linhas, e get com 'relations' retorna o Address junto", async () => {
            const created = await userRepository.save(
                {
                    email: "ana@example.com",
                    name: "Ana",
                    address: { street: "Rua A", city: "Recife", country: "BR" },
                },
                { relations: { address: true } },
            );

            expect(created.address).toMatchObject({
                street: "Rua A",
                city: "Recife",
                country: "BR",
            });

            const fetched = await userRepository.get(created.id, { relations: { address: true } });
            expect(fetched?.address?.city).toBe("Recife");
        });

        it("save com Posts aninhados (otm) cria os posts, e getAll com 'relations' traz os posts de cada usuário", async () => {
            await userRepository.save(
                {
                    email: "ana@example.com",
                    name: "Ana",
                    posts: [{ title: "Post 1" }, { title: "Post 2" }],
                },
                { relations: { posts: true } },
            );

            const [user] = await userRepository.getAll({ relations: { posts: true } });

            expect(user?.posts).toHaveLength(2);
            expect(user?.posts.map((p: Post) => p.title).sort()).toEqual(["Post 1", "Post 2"]);
        });

        it("PostRepository.save com tags mistas (mtm) cria as novas e conecta as existentes", async () => {
            const author = await createUser({ email: "autor@example.com" });
            const existingTag = await createTag({ name: "tutorial" });

            const result = await postRepository.save(
                {
                    title: "Post com Tags",
                    authorId: author.id,
                    tags: [{ name: "novidade" }, { id: existingTag.id, name: "tutorial" }],
                },
                { relations: { tags: true } },
            );

            expect(result.tags.map((t: Tag) => t.name).sort()).toEqual(["novidade", "tutorial"]);
            expect(await prisma.tag.count()).toBe(2); // não duplicou a tag existente
        });
    });

    describe("query() (raw) através da VSRepository", () => {
        it("roda uma query crua parametrizada, delegando pro adapter", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            const result = await userRepository.query<{ id: number }[]>(
                'SELECT id FROM "User" WHERE email = $1',
                { args: ["ana@example.com"] },
            );

            expect(result).toHaveLength(1);
            expect(result[0]?.id).toBe(user.id);
        });
    });

    describe("transaction() compartilhando o client entre repositórios diferentes", () => {
        it("confirma as escritas de ambos os repositórios quando o callback resolve", async () => {
            await userRepository.transaction(async tx => {
                const user = await userRepository.save(
                    { email: "ana@example.com", name: "Ana" },
                    { db: tx },
                );
                await postRepository.save({ title: "Post", authorId: user.id }, { db: tx });
            });

            expect(await prisma.user.count()).toBe(1);
            expect(await prisma.post.count()).toBe(1);
        });

        it("desfaz as escritas de ambos os repositórios quando o callback rejeita", async () => {
            await expect(
                userRepository.transaction(async tx => {
                    const user = await userRepository.save(
                        { email: "ana@example.com", name: "Ana" },
                        { db: tx },
                    );
                    await postRepository.save({ title: "Post", authorId: user.id }, { db: tx });

                    throw new Error("falha proposital");
                }),
            ).rejects.toThrow("falha proposital");

            expect(await prisma.user.count()).toBe(0);
            expect(await prisma.post.count()).toBe(0);
        });
    });

    describe("erros do adapter propagados como 'VSRepoAdapterError' através da VSRepository", () => {
        it("save com email duplicado rejeita com code UNIQUE_CONSTRAINT_VIOLATION", async () => {
            await createUser({ email: "duplicado@example.com" });

            await expect(
                userRepository.save({ email: "duplicado@example.com", name: "Outra Ana" }),
            ).rejects.toThrow(VSRepoAdapterError);

            try {
                await userRepository.save({ email: "duplicado@example.com", name: "Outra Ana" });
            } catch (err) {
                expect((err as VSRepoAdapterError).code).toBe(
                    AdapterErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
                );
            }
        });
    });
});
