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

    it("é lançado quando uma relation tem 'nullable: true' com mode 'otm'", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                relations: {
                    posts: { mode: "otm", restriction: "add", pk: "id", nullable: true },
                },
            });
        }).toThrow(VSRepoAdapterError);
    });

    it("é lançado quando uma relation tem 'nullable: true' com mode 'mtm'", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "post",
                pkName: "id",
                relations: {
                    tags: { mode: "mtm", restriction: "set", pk: "id", nullable: true },
                } as any,
            });
        }).toThrow(VSRepoAdapterError);
    });

    it("aceita 'nullable: true' com mode 'mto'", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "post",
                pkName: "id",
                relations: {
                    author: { mode: "mto", restriction: "set", pk: "id", nullable: true },
                } as any,
            });
        }).not.toThrow();
    });

    it("aceita 'nullable: true' com mode 'oto'", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                relations: {
                    address: { mode: "oto", restriction: "set", pk: "id", nullable: true },
                } as any,
            });
        }).not.toThrow();
    });

    it("aceita 'otm'/'mtm' sem 'nullable' (o caso comum)", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                relations: {
                    posts: { mode: "otm", restriction: "add", pk: "id" },
                } as any,
            });
        }).not.toThrow();
    });

    it("a mensagem de erro do 'nullable' inválido aponta o path 'relations.<campo>'", () => {
        try {
            new VSRepoPrisma7Adapter<User>(fakePrisma, {
                tableName: "user",
                pkName: "id",
                relations: {
                    posts: { mode: "otm", restriction: "add", pk: "id", nullable: true },
                } as any,
            });
            throw new Error("deveria ter lançado VSRepoAdapterError");
        } catch (err) {
            expect((err as Error).message).toContain("relations.posts");
            expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.INVALID_ADAPTER_CONFIG);
        }
    });
});

describe("VSRepoPrisma7Adapter — validação do client Prisma", () => {
    it("é lançado quando 'prisma' é 'undefined'", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(undefined as any, { tableName: "user", pkName: "id" });
        }).toThrow(VSRepoAdapterError);
    });

    it("é lançado quando 'prisma' é 'null'", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(null as any, { tableName: "user", pkName: "id" });
        }).toThrow(VSRepoAdapterError);
    });

    it("o erro de 'prisma' ausente tem code 'MISSING_DB_CLIENT'", () => {
        try {
            new VSRepoPrisma7Adapter<User>(undefined as any, { tableName: "user", pkName: "id" });
            throw new Error("deveria ter lançado VSRepoAdapterError");
        } catch (err) {
            expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.MISSING_DB_CLIENT);
        }
    });

    it("é lançado quando 'tableName' não corresponde a nenhum delegate do client", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, { tableName: "usre", pkName: "id" });
        }).toThrow(VSRepoAdapterError);
    });

    it("o erro de 'tableName' sem delegate correspondente tem code 'MODEL_NOT_FOUND'", () => {
        try {
            new VSRepoPrisma7Adapter<User>(fakePrisma, { tableName: "usre", pkName: "id" });
            throw new Error("deveria ter lançado VSRepoAdapterError");
        } catch (err) {
            expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.MODEL_NOT_FOUND);
            expect((err as Error).message).toContain("usre");
        }
    });

    it("é lançado quando 'tableName' aponta pra uma propriedade que não é um delegate (ex.: '$transaction')", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, { tableName: "$transaction", pkName: "id" });
        }).toThrow(VSRepoAdapterError);
    });

    it("não lança quando 'prisma' e 'tableName' são válidos", () => {
        expect(() => {
            new VSRepoPrisma7Adapter<User>(fakePrisma, { tableName: "user", pkName: "id" });
        }).not.toThrow();
    });

    it("a validação do client roda depois da validação da config (config inválida chega primeiro)", () => {
        // Com 'prisma' undefined E config inválida (sem tableName), o erro
        // esperado é o de config (INVALID_ADAPTER_CONFIG), não o de client —
        // a config é validada antes do client no construtor.
        try {
            new VSRepoPrisma7Adapter<User>(undefined as any, { pkName: "id" } as any);
            throw new Error("deveria ter lançado VSRepoAdapterError");
        } catch (err) {
            expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.INVALID_ADAPTER_CONFIG);
        }
    });
});
