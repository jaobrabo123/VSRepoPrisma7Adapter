/**
 * Configuração de uma relation, no mesmo formato usado na v1 do VSRepository.
 *
 * - `mode`: cardinalidade da relation do ponto de vista da entidade dona do campo
 *   (`oto` = one-to-one, `mto` = many-to-one, `otm` = one-to-many, `mtm` = many-to-many).
 * - `restriction`: como `save`/`update`/`upsert` tratam relations to-many (`otm`/`mtm`)
 *   e to-one com item já existente (por `pk`) — `"add"` só cria/conecta os itens enviados
 *   (upsert por item), `"set"` também remove/desconecta o que não foi enviado.
 * - `pk`: nome do campo usado como identificador do registro relacionado, usado para
 *   decidir entre `create` (sem pk) e `connectOrCreate`/`upsert` (com pk).
 * - `nullable`: para relations `mto`, indica se o campo aceita ser setado
 *   como `null` (vira `disconnect`). Mantidos os dois nomes por compatibilidade com a v1.
 * 
 * @publicApi
 */
export interface Relation<T = any> {
    mode: "otm" | "mtm" | "mto" | "oto";
    restriction: "set" | "add";
    pk: keyof T;
    nullable?: boolean;
}
