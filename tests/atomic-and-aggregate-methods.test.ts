// Testes "felizes" dos 8 novos métodos do `VSRepoAdapter` implementados pelo
// `VSRepoPrisma7Adapter` (`incrementOne`/`decrementOne`/`multiplyOne`/
// `divideOne`/`sum`/`average`/`min`/`max`), no mesmo espírito do
// `config-validation.test.ts`: usam o `fakePrisma` (ver `helpers/fake-prisma`)
// em vez de um Postgres real, então verificam QUAL chamada o adapter faz no
// client (nome do delegate, shape do `data`/`where`/argumento de agregação) e
// COMO ele traduz o retorno do Prisma pro shape esperado — sem depender de
// rede/DB. A cobertura contra um Postgres real (SQL de verdade rodando)
// fica em `prisma7.adapter.test.ts`.

import { describe, it, expect } from "@jest/globals";
import { VSRepoPrisma7Adapter } from "../src";
import { User, Post } from "./helpers/entities";
import { createFakePrisma } from "./helpers/fake-prisma";

describe("VSRepoPrisma7Adapter — incrementOne / decrementOne / multiplyOne / divideOne", () => {
    it("'incrementOne' chama 'user.update' com 'data: { [field]: { increment: value } }'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        const updated = { id: 1, balance: 150 };
        user.update.mockResolvedValueOnce(updated);

        const result = await adapter.incrementOne("balance", 50, { id: 1 });

        expect(user.update).toHaveBeenCalledTimes(1);
        const arg = user.update.mock.calls[0]![0];
        expect(arg.where).toEqual({ id: 1 });
        expect(arg.data).toEqual({ balance: { increment: 50 } });
        expect(result).toBe(updated);
    });

    it("'decrementOne' chama 'user.update' com 'data: { [field]: { decrement: value } }'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.update.mockResolvedValueOnce({ id: 1, balance: 50 });

        await adapter.decrementOne("balance", 50, { id: 1 });

        const arg = user.update.mock.calls[0]![0];
        expect(arg.data).toEqual({ balance: { decrement: 50 } });
    });

    it("'multiplyOne' chama 'user.update' com 'data: { [field]: { multiply: value } }'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.update.mockResolvedValueOnce({ id: 1, balance: 200 });

        await adapter.multiplyOne("balance", 2, { id: 1 });

        const arg = user.update.mock.calls[0]![0];
        expect(arg.data).toEqual({ balance: { multiply: 2 } });
    });

    it("'divideOne' chama 'user.update' com 'data: { [field]: { divide: value } }'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.update.mockResolvedValueOnce({ id: 1, balance: 25 });

        await adapter.divideOne("balance", 4, { id: 1 });

        const arg = user.update.mock.calls[0]![0];
        expect(arg.data).toEqual({ balance: { divide: 4 } });
    });

    it("retorna o registro já refletindo o estado após a escrita (retorno direto do 'update' do Prisma, sem leitura extra)", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        const updated = { id: 1, balance: 150 };
        user.update.mockResolvedValueOnce(updated);

        const result = await adapter.incrementOne("balance", 50, { id: 1 });

        expect(result).toBe(updated);
        expect(user.findFirst).not.toHaveBeenCalled();
    });

    it("propaga 'select'/'relations' pro 'update' via 'resolveReadArg', igual ao método 'update' comum", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.update.mockResolvedValueOnce({ id: 1, balance: 150 });

        await adapter.incrementOne(
            "balance",
            50,
            { id: 1 },
            {
                select: { id: true, balance: true },
            },
        );

        const arg = user.update.mock.calls[0]![0];
        expect(arg.select).toEqual({ id: true, balance: true });
    });

    it("aceita um campo nullable (ex: 'bonusPoints') sem alterar o shape do 'data'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.update.mockResolvedValueOnce({ id: 1, bonusPoints: 10 });

        await adapter.incrementOne("bonusPoints", 10, { id: 1 });

        const arg = user.update.mock.calls[0]![0];
        expect(arg.data).toEqual({ bonusPoints: { increment: 10 } });
    });

    it("erro do Prisma (ex: 'division_by_zero' em P2010) é traduzido pra 'VSRepoAdapterError'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        class PrismaClientKnownRequestError extends Error {
            code = "P2010";
            constructor() {
                super("division_by_zero");
                this.name = "PrismaClientKnownRequestError";
            }
        }
        user.update.mockRejectedValueOnce(new PrismaClientKnownRequestError());

        await expect(adapter.divideOne("balance", 0, { id: 1 })).rejects.toMatchObject({
            name: "VSRepoAdapterError",
        });
    });
});

describe("VSRepoPrisma7Adapter — sum / average / min / max", () => {
    it("'sum' chama 'user.aggregate' com '_sum: { [field]: true }' e retorna o número", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.aggregate.mockResolvedValueOnce({ _sum: { balance: 1000 } });

        const result = await adapter.sum("balance", {});

        expect(user.aggregate).toHaveBeenCalledTimes(1);
        const arg = user.aggregate.mock.calls[0]![0];
        expect(arg.where).toEqual({});
        expect(arg._sum).toEqual({ balance: true });
        expect(result).toBe(1000);
    });

    it("'sum' repassa o 'where' resolvido pro Prisma", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.aggregate.mockResolvedValueOnce({ _sum: { balance: 500 } });

        await adapter.sum("balance", { name: "Ana" });

        const arg = user.aggregate.mock.calls[0]![0];
        expect(arg.where).toEqual({ name: "Ana" });
    });

    it("'sum' retorna 'null' (não '0') quando o Prisma retorna '_sum' nulo (nenhum registro casou)", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.aggregate.mockResolvedValueOnce({ _sum: { balance: null } });

        const result = await adapter.sum("balance", {});

        expect(result).toBeNull();
    });

    it("'average' chama 'user.aggregate' com '_avg: { [field]: true }'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.aggregate.mockResolvedValueOnce({ _avg: { balance: 42.5 } });

        const result = await adapter.average("balance", {});

        const arg = user.aggregate.mock.calls[0]![0];
        expect(arg._avg).toEqual({ balance: true });
        expect(result).toBe(42.5);
    });

    it("'min' chama 'user.aggregate' com '_min: { [field]: true }'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.aggregate.mockResolvedValueOnce({ _min: { balance: 0 } });

        const result = await adapter.min("balance", {});

        const arg = user.aggregate.mock.calls[0]![0];
        expect(arg._min).toEqual({ balance: true });
        expect(result).toBe(0);
    });

    it("'max' chama 'user.aggregate' com '_max: { [field]: true }'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.aggregate.mockResolvedValueOnce({ _max: { balance: 9999 } });

        const result = await adapter.max("balance", {});

        const arg = user.aggregate.mock.calls[0]![0];
        expect(arg._max).toEqual({ balance: true });
        expect(result).toBe(9999);
    });

    it("converte um valor 'Decimal-like' (ex: 'Prisma.Decimal' de um campo 'price') pra 'number' via 'toNumber()'", async () => {
        const { client: fakePrisma, post } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<Post>(fakePrisma, {
            tableName: "post",
            pkName: "id",
        });
        const decimalLike = { toNumber: () => 19.9, decimalPlaces: () => 2 };
        post.aggregate.mockResolvedValueOnce({ _sum: { price: decimalLike } });

        const result = await adapter.sum("price", {});

        expect(result).toBe(19.9);
    });

    it("converte um valor 'bigint' pra 'number'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.aggregate.mockResolvedValueOnce({ _sum: { balance: 42n } });

        const result = await adapter.sum("balance", {});

        expect(result).toBe(42);
    });

    it("erro do Prisma em 'aggregate' é traduzido pra 'VSRepoAdapterError'", async () => {
        const { client: fakePrisma, user } = createFakePrisma();
        const adapter = new VSRepoPrisma7Adapter<User>(fakePrisma, {
            tableName: "user",
            pkName: "id",
        });
        user.aggregate.mockRejectedValueOnce(new Error("boom"));

        await expect(adapter.sum("balance", {})).rejects.toMatchObject({
            name: "VSRepoAdapterError",
        });
    });
});
