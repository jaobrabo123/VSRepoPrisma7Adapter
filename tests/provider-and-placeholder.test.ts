// Testes da detecção de provider e da sintaxe de placeholder
// para raw queries (`getPlaceholder`) do `VSRepoPrisma7Adapter` — cobrem a
// ordem de resolução (override da config → `_engineConfig.activeProvider` →
// `_engineConfig.adapter.provider` → `undefined`), cada mapeamento de
// placeholder por provider, e o comportamento de fallback (construtor nunca lança;
// `getPlaceholder` lança `NOT_SUPPORTED` apenas quando é chamado sem provider resolvível).

import { describe, it, expect } from "@jest/globals";
import { AdapterErrorCode, VSRepoAdapterError } from "vsrepo";
import { VSRepoPrisma7Adapter } from "../src";
import { User } from "./helpers/entities";
import { createFakePrisma } from "./helpers/fake-prisma";

function buildAdapter(prisma: any, config?: any): VSRepoPrisma7Adapter<User> {
    return new VSRepoPrisma7Adapter<User>(prisma, config ?? { tableName: "user", pkName: "id" });
}

describe("VSRepoPrisma7Adapter — getPlaceholder (sintaxe por provider)", () => {
    it("postgresql/cockroachdb usam placeholders '$' de base 1", () => {
        const postgres = buildAdapter(createFakePrisma("postgresql").client);
        expect(postgres.getPlaceholder(0)).toBe("$1");
        expect(postgres.getPlaceholder(1)).toBe("$2");
        expect(postgres.getPlaceholder(9)).toBe("$10");

        const cockroach = buildAdapter(createFakePrisma("cockroachdb").client);
        expect(cockroach.getPlaceholder(0)).toBe("$1");
        expect(cockroach.getPlaceholder(3)).toBe("$4");
    });

    it("mysql/sqlite sempre retornam '?' (ignoram o index)", () => {
        const mysql = buildAdapter(createFakePrisma("mysql").client);
        expect(mysql.getPlaceholder(0)).toBe("?");
        expect(mysql.getPlaceholder(1)).toBe("?");

        const sqlite = buildAdapter(createFakePrisma("sqlite").client);
        expect(sqlite.getPlaceholder(0)).toBe("?");
        expect(sqlite.getPlaceholder(5)).toBe("?");
    });

    it("sqlserver usa placeholders '@P' de base 1", () => {
        const sqlserver = buildAdapter(createFakePrisma("sqlserver").client);
        expect(sqlserver.getPlaceholder(0)).toBe("@P1");
        expect(sqlserver.getPlaceholder(1)).toBe("@P2");
        expect(sqlserver.getPlaceholder(8)).toBe("@P9");
    });

    it("o 'provider' da config sobrescreve a detecção no getPlaceholder", () => {
        const { client } = createFakePrisma("postgresql");
        const adapter = buildAdapter(client, {
            tableName: "user",
            pkName: "id",
            provider: "mysql",
        });

        expect(adapter.getPlaceholder(0)).toBe("?");
    });

    it("lança 'NOT_SUPPORTED' apenas quando o provider não é resolvível — com orientação na mensagem", () => {
        const { client } = createFakePrisma(null);
        const adapter = buildAdapter(client);

        try {
            adapter.getPlaceholder(0);
            throw new Error("deveria ter lançado VSRepoAdapterError");
        } catch (err) {
            expect(err).toBeInstanceOf(VSRepoAdapterError);
            expect((err as VSRepoAdapterError).code).toBe(AdapterErrorCode.NOT_SUPPORTED);
            expect((err as Error).message).toContain("provider");
        }
    });
});
