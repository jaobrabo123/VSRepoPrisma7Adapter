import * as v from "valibot";
import { VSRepoPrisma7AdapterConfig } from "../types/adapter-config.type";
import { VSRepoPrisma7AdapterError } from "../errors/vsrepo-prisma7-adapter.error";
import { adapterConfigSchema } from "./adapter-config.schema";

/**
 * Valida a config recebida pelo construtor do `VSRepoPrisma7Adapter` (`tableName`,
 * `pkName`, `relations` opcional e `logLevel` opcional) com valibot, lançando
 * `VSRepoPrisma7AdapterError` com uma mensagem apontando o campo inválido.
 */
export function validateAdapterConfig<T>(config: unknown): VSRepoPrisma7AdapterConfig<T> {
    const parsed = v.safeParse(adapterConfigSchema, config);

    if (!parsed.success) {
        const issue = parsed.issues[0];
        const path = issue?.path?.length ? issue.path.map(p => String(p.key)).join(".") : "config";

        throw new VSRepoPrisma7AdapterError(
            `Invalid constructor config (${path}): ${issue?.message ?? "validation failed"}`,
        );
    }

    return parsed.output as unknown as VSRepoPrisma7AdapterConfig<T>;
}
