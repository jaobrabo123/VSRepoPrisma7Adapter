import type { RelationKeys } from "vsrepo";
import { Relation } from "./relation.type";

/**
 * Configuração de relations da entidade `T`, usada pelos parsers de
 * `create`/`update`/`merge` para resolver campos de relação de acordo com o
 * comportamento da v1 (ver `Relation`).
 *
 * Chaveado pelos campos de relação de `T` (`RelationKeys<T>`). Sem essa
 * configuração (adapter construído sem `relations`), campos de relação são
 * repassados como estão para o Prisma, sem nenhuma resolução especial.
 * 
 * @publicApi
 */
export type AdapterRelations<T> = Partial<{
    [P in RelationKeys<T>]: Relation<T[P] extends Array<infer U> ? U : T[P]>;
}>;
