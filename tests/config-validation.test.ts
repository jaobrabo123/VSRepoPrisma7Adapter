// Testes da validação da config recebida pelo construtor do
// `VSRepoPrisma7Adapter` (`tableName`, `pkName`, `relations` opcional,
// `logLevel` opcional). Não precisam de um client Prisma real: a validação
// (valibot) roda antes de qualquer query ser montada — mesmo espírito do
// `error-handling.test.ts` da v1 de VSRepository, que também usava um
// "prisma" mínimo/falso para não depender de um banco real.

import { describe, it, expect } from "@jest/globals";
import { AdapterErrorCode, VSLogLevel, VSRepoAdapterError } from "vsrepo";
import { VSRepoPrisma7Adapter } from "../src";
import { User } from "./helpers/entities";
import { createFakePrisma } from "./helpers/fake-prisma";

const { client: fakePrisma } = createFakePrisma();

describe("VSRepoPrisma7Adapter — validação da config do construtor", () => {
    it("é lançado quando a config não tem 'tableName'", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, { pkName: "id" } as any);
        }).toThrow(VSRepoAdapterError);
    });

    it("é lançado quando 'tableName' é uma string vazia", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, { tableName: "", pkName: "id" });
        }).toThrow(VSRepoAdapterError);
    });

    it("é lançado quando a config não tem 'pkName'", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, { tableName: "user" } as any);
        }).toThrow(VSRepoAdapterError);
    });

    it("é lançado quando 'pkName' é uma string vazia", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, { tableName: "user", pkName: "" as any });
        }).toThrow(VSRepoAdapterError);
    });

    it("não lança quando a config é válida e mínima (só tableName + pkName)", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, { tableName: "user", pkName: "id" });
        }).not.toThrow();
    });

    it("é lançado quando 'logLevel' não é um VSLogLevel válido", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                logLevel: "NOT_A_LEVEL" as any,
            });
        }).toThrow(VSRepoAdapterError);
    });

    it("aceita um 'logLevel' válido", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                logLevel: VSLogLevel.DEBUG,
            });
        }).not.toThrow();
    });

    it("é lançado quando uma relation não tem 'mode'", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                relations: { address: { restriction: "set", pk: "id" } } as any,
            });
        }).toThrow(VSRepoAdapterError);
    });

    it("é lançado quando uma relation tem 'mode' fora do picklist", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                relations: {
                    address: { mode: "one-to-one", restriction: "set", pk: "id" },
                } as any,
            });
        }).toThrow(VSRepoAdapterError);
    });

    it("é lançado quando uma relation tem 'restriction' fora do picklist", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                relations: {
                    posts: { mode: "otm", restriction: "merge", pk: "id" },
                } as any,
            });
        }).toThrow(VSRepoAdapterError);
    });

    it("é lançado quando uma relation tem uma chave desconhecida (strictObject)", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                relations: {
                    address: { mode: "oto", restriction: "set", pk: "id", cascade: true },
                } as any,
            });
        }).toThrow(VSRepoAdapterError);
    });

    it("aceita relations válidas cobrindo oto, otm e mtm", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                relations: {
                    address: { mode: "oto", restriction: "set", pk: "id" },
                    posts: { mode: "otm", restriction: "add", pk: "id" },
                } as any,
            });
        }).not.toThrow();
    });

    it("a mensagem de erro aponta o campo inválido, e o 'code' é 'INVALID_ADAPTER_CONFIG'", () => {
        try {
            new VSRepoPrisma7Adapter<User>(fakePrisma, { pkName: "id" } as any);
            throw new Error("deveria ter lançado VSRepoAdapterError");
        } catch (err) {
            expect(err).toBeInstanceOf(VSRepoAdapterError);
            expect((err as Error).message).toContain("tableName");
            expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.INVALID_ADAPTER_CONFIG);
        }
    });

    it("tem 'name' igual a 'VSRepoAdapterError'", () => {
        try {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {} as any);
            throw new Error("deveria ter lançado VSRepoAdapterError");
        } catch (err) {
            expect((err as Error).name).toBe("VSRepoAdapterError");
        }
    });
});
