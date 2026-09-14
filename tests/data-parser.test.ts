// Testes unitários do `parsePrismaWriteData` (src/parsers/data.parser.ts) — o
// resolver que transforma os payloads `create`/`update`/`save`/`upsert` em
// nested writes do Prisma quando o adapter tem `relations` configuradas
// (comportamento da v1 do VSRepository).
//
// Não precisam de um Postgres real (mesmo espírito do `config-validation.test
// .ts`): importam o parser direto e verificam o formato exato dos payloads
// gerados para cada combinação de `mode`/`restriction`/`nullable` das relações
// to-one — incluindo o comportamento atual de lançar `VSRepoAdapterError`
// (code `INVALID_DATA`) quando `null` é enviado para uma relação to-one
// não-nullable (antes, o `null` era simplesmente ignorado).

import { describe, it, expect } from "@jest/globals";
import { AdapterErrorCode, VSRepoAdapterError } from "vsrepo";
import { parsePrismaWriteData } from "../src/parsers/data.parser";

// Configurações de relation usadas nos testes (espelham `Relation`).
const otoSet = { mode: "oto", restriction: "set", pk: "id" };
const otoSetNullable = { ...otoSet, nullable: true };
const otoAddNullable = { mode: "oto", restriction: "add", pk: "id", nullable: true };
const mtoSetNullable = { mode: "mto", restriction: "set", pk: "id", nullable: true };
const mtoAddNullable = { mode: "mto", restriction: "add", pk: "id", nullable: true };

// Wrapper que aplica a chamada com o cast de `relations` (que é tipado como
// `AdapterRelations<T>` — irrelevante aqui, os testes verificam o runtime).
function parse(obj: Record<string, unknown>, relations?: Record<string, unknown>, pkName = "id") {
    return parsePrismaWriteData(obj, pkName, relations as any);
}

describe("parsePrismaWriteData — to-one enviado como 'null'", () => {
    it("lança 'VSRepoAdapterError' (code INVALID_DATA) com oto não-nullable", () => {
        expect(() => parse({ address: null }, { address: otoSet })).toThrow(
            "You cannot provide null for a to-one relation when it is not nullable.",
        );

        try {
            parse({ address: null }, { address: otoSet });
            throw new Error("deveria ter lançado VSRepoAdapterError");
        } catch (err) {
            expect(err).toBeInstanceOf(VSRepoAdapterError);
            expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.INVALID_DATA);
        }
    });

    it("lança 'VSRepoAdapterError' (code INVALID_DATA) com mto não-nullable", () => {
        const mtoSet = { mode: "mto", restriction: "set", pk: "id" };

        expect(() => parse({ author: null }, { author: mtoSet })).toThrow(VSRepoAdapterError);

        try {
            parse({ author: null }, { author: mtoSet });
            throw new Error("deveria ter lançado VSRepoAdapterError");
        } catch (err) {
            expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.INVALID_DATA);
        }
    });

    it("oto + restriction 'set' + nullable resolve pra 'delete' no update", () => {
        expect(parse({ address: null }, { address: otoSetNullable })).toEqual({
            create: {},
            update: { address: { delete: true } },
        });
    });

    it("oto + restriction 'add' + nullable resolve pra 'disconnect' no update", () => {
        expect(parse({ address: null }, { address: otoAddNullable })).toEqual({
            create: {},
            update: { address: { disconnect: true } },
        });
    });

    it("mto + restriction 'set' + nullable resolve pra 'disconnect' no update", () => {
        expect(parse({ author: null }, { author: mtoSetNullable })).toEqual({
            create: {},
            update: { author: { disconnect: true } },
        });
    });

    it("mto + restriction 'add' + nullable resolve pra 'disconnect' no update", () => {
        expect(parse({ author: null }, { author: mtoAddNullable })).toEqual({
            create: {},
            update: { author: { disconnect: true } },
        });
    });
});

describe("parsePrismaWriteData — to-one sem PK (campo pk undefined)", () => {
    it("create resolve pra 'create' e update (restriction 'set') pra 'upsert'", () => {
        const parsed = parse({ address: { street: "Rua A" } }, { address: otoSet });

        expect(parsed.create).toEqual({
            address: { create: { street: "Rua A" } },
        });
        expect(parsed.update).toEqual({
            address: { upsert: { create: { street: "Rua A" }, update: { street: "Rua A" } } },
        });
    });

    it("update (restriction 'add') resolve pra 'create' simples", () => {
        const parsed = parse(
            { address: { street: "Rua A" } },
            { address: { mode: "oto", restriction: "add", pk: "id" } },
        );

        expect(parsed.create).toEqual({
            address: { create: { street: "Rua A" } },
        });
        expect(parsed.update).toEqual({
            address: { create: { street: "Rua A" } },
        });
    });
});

describe("parsePrismaWriteData — to-one com PK", () => {
    it("create resolve pra 'connectOrCreate'", () => {
        const parsed = parse({ address: { id: 10, street: "Rua A" } }, { address: otoSet });

        expect(parsed.create).toEqual({
            address: {
                connectOrCreate: { where: { id: 10 }, create: { id: 10, street: "Rua A" } },
            },
        });
    });

    it("update (restriction 'set') resolve pra 'upsert', removendo a pk do 'update'", () => {
        const parsed = parse({ address: { id: 10, street: "Rua B" } }, { address: otoSet });

        expect(parsed.update).toEqual({
            address: {
                upsert: {
                    where: { id: 10 },
                    create: { id: 10, street: "Rua B" },
                    update: { street: "Rua B" },
                },
            },
        });
    });

    it("update (restriction 'add') resolve pra 'connectOrCreate'", () => {
        const parsed = parse(
            { address: { id: 10, street: "Rua B" } },
            { address: { mode: "oto", restriction: "add", pk: "id" } },
        );

        expect(parsed.update).toEqual({
            address: {
                connectOrCreate: { where: { id: 10 }, create: { id: 10, street: "Rua B" } },
            },
        });
    });
});

describe("parsePrismaWriteData — campos simples", () => {
    it("são repassados como estão, e o pkName é omitido do update", () => {
        const parsed = parse({ id: 5, name: "Ana", email: "a@example.com" }, undefined, "id");

        expect(parsed.create).toEqual({ id: 5, name: "Ana", email: "a@example.com" });
        expect(parsed.update).toEqual({ name: "Ana", email: "a@example.com" });
    });

    it("campos com valor 'undefined' são ignorados", () => {
        const parsed = parse({ name: "Ana", email: undefined });

        expect(parsed.create).toEqual({ name: "Ana" });
        expect(parsed.update).toEqual({ name: "Ana" });
    });

    it("campos de relação com valor 'undefined' também são ignorados, sem lançar erro", () => {
        expect(() => parse({ address: undefined }, { address: otoSet })).not.toThrow();

        const parsed = parse({ name: "Ana", address: undefined }, { address: otoSet });
        expect(parsed.create).toEqual({ name: "Ana" });
        expect(parsed.update).toEqual({ name: "Ana" });
    });
});

describe("parsePrismaWriteData — to-many (regressão)", () => {
    it("otm + restriction 'set' separa com/sem pk e gera deleteMany/upsert no update", () => {
        const parsed = parse(
            { posts: [{ id: 1, title: "Antigo" }, { title: "Novo" }] },
            { posts: { mode: "otm", restriction: "set", pk: "id" } },
        );

        expect(parsed.create).toEqual({
            posts: {
                create: [{ title: "Novo" }],
                connectOrCreate: [{ where: { id: 1 }, create: { id: 1, title: "Antigo" } }],
            },
        });
        expect(parsed.update).toEqual({
            posts: {
                deleteMany: { id: { notIn: [1] } },
                create: [{ title: "Novo" }],
                upsert: [
                    {
                        where: { id: 1 },
                        create: { id: 1, title: "Antigo" },
                        update: { title: "Antigo" },
                    },
                ],
            },
        });
    });
});
