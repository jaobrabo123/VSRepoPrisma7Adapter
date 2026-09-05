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
// NOTA sobre `@DynamicMethod`/`@QueryMethod`: em vez do padrão do
// `example.ts` (campo `declare` + decorator syntax), aqui os métodos são
// registrados de forma imperativa logo após a classe — ex.:
// `DynamicMethod()(UserRepository.prototype, "findOneByEmail")` — com a
// assinatura do método adicionada via declaration merging
// (`interface UserRepository { findOneByEmail(...): ...; }`).
// Isso faz exatamente o que o decorator faria (`Reflect.defineMetadata` no
// prototype, lido pelo `VSRepository` no construtor), sem passar pelo campo
// `declare`, que é o que quebra o parse no babel-jest deste repo: a
// combinação `declare` + decorators legacy não é suportada pelo
// `@babel/plugin-proposal-decorators` (usado no lugar do `ts-jest` só por
// causa do compilador nativo do TS 7 — ver comentário no `jest.config.js`).
// `tsc`/`test:types` aceita os dois padrões numa boa, é só o babel-jest que
// não aceita `declare` + decorator. Validado ponta a ponta contra o
// `VSRepository` real (dynamic methods e query methods, `modifying: true` e
// `false`) antes de escrever os testes abaixo.
//
// Requer `DATABASE_URL` apontando pra um banco com as migrations aplicadas
// e o Prisma Client gerado — ver README/CI (mesmo setup do
// `prisma7.adapter.test.ts`).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "@jest/globals";
import {
    AdapterErrorCode,
    DynamicMethod,
    MethodOptions,
    QueryMethod,
    QueryMethodArg,
    VSLogLevel,
    VSRepoAdapterError,
    VSRepository,
} from "vsrepo";
import { VSRepoPrisma7Adapter, Prisma7OrmTypes } from "../src";
import { Prisma, PrismaClient, Tag } from "../generated/prisma/client";
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

type UserMethodOptions = MethodOptions<User, MyOrmTypes>;

/**
 * Assinaturas dos métodos registrados abaixo via `DynamicMethod()`/`QueryMethod()`
 * — ver NOTA no topo do arquivo sobre por que são aplicados de forma
 * imperativa em vez de `@decorator` sobre um campo `declare`.
 */
interface UserRepository {
    /** Dynamic method: equivalente a `findOne({ email })`. */
    findOneByEmail(email: string, options?: UserMethodOptions): Promise<User | null>;
    /** Dynamic method: `findMany` com `name` filtrado por `contains`. */
    findByNameContains(name: string, options?: UserMethodOptions): Promise<User[]>;
    /** Dynamic method: `count` com `name` filtrado por igualdade. */
    countByName(name: string): Promise<number>;
    /** Query method (`modifying: false`): SELECT bruto parametrizado. */
    findByEmailRaw(
        arg: QueryMethodArg<[email: string]>,
    ): Promise<{ id: number; name: string | null }[]>;
    /** Query method (`modifying: true`): UPDATE bruto, resolve pra linhas afetadas. */
    renameUserById(arg: QueryMethodArg<[name: string, id: number]>): Promise<number>;
}

DynamicMethod()(UserRepository.prototype, "findOneByEmail");
DynamicMethod()(UserRepository.prototype, "findByNameContains");
DynamicMethod()(UserRepository.prototype, "countByName");
QueryMethod('SELECT id, name FROM "User" WHERE email = $1')(
    UserRepository.prototype,
    "findByEmailRaw",
);
QueryMethod('UPDATE "User" SET name = $1 WHERE id = $2', { modifying: true })(
    UserRepository.prototype,
    "renameUserById",
);

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

    describe("@DynamicMethod através da VSRepository", () => {
        it("findOneByEmail busca um registro por igualdade, delegando pro adapter", async () => {
            await createUser({ email: "ana@example.com", name: "Ana" });

            const found = await userRepository.findOneByEmail("ana@example.com");
            expect(found?.name).toBe("Ana");

            expect(await userRepository.findOneByEmail("inexistente@example.com")).toBeNull();
        });

        it("findByNameContains filtra vários registros pelo operador 'contains'", async () => {
            await createUser({ email: "carlos@example.com", name: "Carlos" });
            await createUser({ email: "ana@example.com", name: "Ana" });

            const result = await userRepository.findByNameContains("arl");

            expect(result.map(u => u.name)).toEqual(["Carlos"]);
        });

        it("countByName conta quantos registros batem com o nome informado", async () => {
            await createUser({ email: "a@example.com", name: "Duplicado" });
            await createUser({ email: "b@example.com", name: "Duplicado" });
            await createUser({ email: "c@example.com", name: "Outro" });

            expect(await userRepository.countByName("Duplicado")).toBe(2);
            expect(await userRepository.countByName("Ninguém")).toBe(0);
        });
    });

    describe("@QueryMethod através da VSRepository", () => {
        it("findByEmailRaw (modifying: false) roda um SELECT bruto parametrizado", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            const result = await userRepository.findByEmailRaw({ args: ["ana@example.com"] });

            expect(result).toHaveLength(1);
            expect(result[0]?.id).toBe(user.id);
            expect(result[0]?.name).toBe("Ana");
        });

        it("renameUserById (modifying: true) roda um UPDATE bruto e resolve pra contagem de linhas afetadas", async () => {
            const user = await createUser({ email: "ana@example.com", name: "Ana" });

            const affected = await userRepository.renameUserById({ args: ["Ana Paula", user.id] });

            expect(affected).toBe(1);
            expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(
                "Ana Paula",
            );
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

    describe("métodos atômicos (increment/decrement/multiply/divide) através da VSRepository", () => {
        it("increment soma 'value' ao campo, avaliado server-side, e retorna o registro já atualizado", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 });

            const result = await userRepository.increment(user.id, "balance", 50);

            expect(result.balance).toBe(150);
            const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
            expect(stored.balance).toBe(150);
        });

        it("decrement subtrai 'value' do campo", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 });

            const result = await userRepository.decrement(user.id, "balance", 30);

            expect(result.balance).toBe(70);
            expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).balance).toBe(
                70,
            );
        });

        it("multiply multiplica o valor atual do campo por 'value'", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 });

            const result = await userRepository.multiply(user.id, "balance", 3);

            expect(result.balance).toBe(300);
            expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).balance).toBe(
                300,
            );
        });

        it("divide divide o valor atual do campo por 'value'", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 });

            const result = await userRepository.divide(user.id, "balance", 4);

            expect(result.balance).toBe(25);
            expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).balance).toBe(
                25,
            );
        });

        it("divide por zero rejeita com um 'VSRepoAdapterError' (comportamento nativo do Postgres pra colunas inteiras)", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 });

            await expect(userRepository.divide(user.id, "balance", 0)).rejects.toThrow(
                VSRepoAdapterError,
            );
        });

        it("é avaliado server-side contra o valor atual (não um read-modify-write no cliente): chamadas concorrentes acumulam", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 0 });

            await Promise.all([
                userRepository.increment(user.id, "balance", 10),
                userRepository.increment(user.id, "balance", 10),
                userRepository.increment(user.id, "balance", 10),
            ]);

            const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
            expect(stored.balance).toBe(30);
        });

        it("propaga 'select' pro registro retornado", async () => {
            const user = await createUser({
                email: "ana@example.com",
                name: "Ana",
                balance: 100,
            });

            const result = await userRepository.increment(user.id, "balance", 10, {
                select: { id: true, balance: true },
            });

            expect(result).toEqual({ id: user.id, balance: 110 });
        });

        it("funciona num campo 'Decimal' (ex: 'price' de 'Post')", async () => {
            const author = await createUser({ email: "ana@example.com" });
            const post = await createPost(author.id, { price: "19.90" });

            const result = await postRepository.increment(
                post.id,
                "price",
                new Prisma.Decimal(5.1),
            );

            expect(Number(result.price)).toBeCloseTo(25.0, 2);
        });

        it("em um campo nullable atualmente 'NULL', segue a semântica nativa do SQL ('NULL' + value = 'NULL')", async () => {
            const user = await createUser({ email: "ana@example.com", bonusPoints: null });

            const result = await userRepository.increment(user.id, "bonusPoints", 5);

            expect(result.bonusPoints).toBeNull();
            expect(
                (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).bonusPoints,
            ).toBeNull();
        });

        it("participa de uma 'transaction()' compartilhando o client (increment + sum no mesmo callback)", async () => {
            const user = await createUser({ email: "ana@example.com", balance: 100 });

            const result = await userRepository.transaction(async tx => {
                const updated = await userRepository.increment(user.id, "balance", 50, { db: tx });
                const total = await userRepository.sum("balance", {}, { db: tx });
                return { updated, total };
            });

            expect(result.updated.balance).toBe(150);
            expect(result.total).toBe(150);
            expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).balance).toBe(
                150,
            );
        });
    });

    describe("agregações (sum/average/min/max) através da VSRepository", () => {
        it("sum soma o campo entre todos os registros que casam com o 'where' (todos os registros se vazio)", async () => {
            await createUser({ email: "a@example.com", balance: 100 });
            await createUser({ email: "b@example.com", balance: 200 });
            await createUser({ email: "c@example.com", balance: 300 });

            const result = await userRepository.sum("balance");

            expect(result).toBe(600);
        });

        it("sum respeita um 'where' explícito", async () => {
            await createUser({ email: "a@example.com", balance: 100, name: "Ana" });
            await createUser({ email: "b@example.com", balance: 200, name: "Bia" });

            const result = await userRepository.sum("balance", { name: "Ana" });

            expect(result).toBe(100);
        });

        it("sum retorna 'null' (não '0') quando nenhum registro casa com o 'where'", async () => {
            await createUser({ email: "a@example.com", balance: 100 });

            const result = await userRepository.sum("balance", {
                email: "nao-existe@example.com",
            });

            expect(result).toBeNull();
        });

        it("average calcula a média aritmética", async () => {
            await createUser({ email: "a@example.com", balance: 100 });
            await createUser({ email: "b@example.com", balance: 300 });

            const result = await userRepository.average("balance");

            expect(result).toBe(200);
        });

        it("min retorna o menor valor", async () => {
            await createUser({ email: "a@example.com", balance: 100 });
            await createUser({ email: "b@example.com", balance: 30 });
            await createUser({ email: "c@example.com", balance: 300 });

            const result = await userRepository.min("balance");

            expect(result).toBe(30);
        });

        it("max retorna o maior valor", async () => {
            await createUser({ email: "a@example.com", balance: 100 });
            await createUser({ email: "b@example.com", balance: 30 });
            await createUser({ email: "c@example.com", balance: 300 });

            const result = await userRepository.max("balance");

            expect(result).toBe(300);
        });

        it("num campo 'Decimal' (ex: 'price' de 'Post'), retornam 'number' em vez de 'Decimal'", async () => {
            const author = await createUser({ email: "ana@example.com" });
            await createPost(author.id, { price: "10.50" });
            await createPost(author.id, { price: "20.25" });

            const result = await postRepository.sum("price");

            expect(typeof result).toBe("number");
            expect(result).toBeCloseTo(30.75, 2);
        });

        it("ignora registros cujo campo é 'null' (comportamento nativo do SQL 'SUM'/'AVG'/'MIN'/'MAX')", async () => {
            await createUser({ email: "a@example.com", balance: 100, bonusPoints: null });
            await createUser({ email: "b@example.com", balance: 200, bonusPoints: 50 });

            const result = await userRepository.sum("bonusPoints");

            expect(result).toBe(50);
        });
    });
});
