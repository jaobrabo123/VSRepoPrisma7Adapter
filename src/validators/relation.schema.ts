import * as v from "valibot";

/** Espelha o shape de `Relation`, incluindo os dois nomes de `nullable` da v1. */
export const relationSchema = v.strictObject({
    mode: v.picklist(["otm", "mtm", "mto", "oto"]),
    restriction: v.picklist(["set", "add"]),
    pk: v.pipe(v.string(), v.minLength(1)),
    nullable: v.optional(v.boolean()),
});
