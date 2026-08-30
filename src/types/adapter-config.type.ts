import type { VSLogLevel } from "vsrepo";
import { AdapterRelations } from "./adapter-relations.type";

/**
 * Configuração recebida pelo `VSRepoPrisma7Adapter` no segundo parâmetro do
 * construtor.
 * @publicApi
 */
export interface VSRepoPrisma7AdapterConfig<T = any> {
    /** Nome do model/delegate do Prisma Client (ex: `"user"`, como em `prisma.user`). */
    tableName: string;
    /** Nome do campo de primary key da entidade (ex: `"id"`). */
    pkName: string;
    /**
     * Configuração das relations da entidade, necessária para os parsers de
     * `create`/`update`/`merge` resolverem corretamente campos de relação
     * (ver `Relation`/`AdapterRelations`). Opcional: sem ela, campos de
     * relação são repassados como estão (raw) para o Prisma.
     */
    relations?: AdapterRelations<T>;
    /** Nível mínimo de log do `VSLogger` interno do adapter. @default VSLogLevel.WARN */
    logLevel?: VSLogLevel;
}
