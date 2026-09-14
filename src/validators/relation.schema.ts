import * as v from "valibot";

/** Espelha o shape de `Relation`, incluindo os dois nomes de `nullable` da v1. */
export const relationSchema = v.pipe(
    v.strictObject({
        mode: v.picklist(["otm", "mtm", "mto", "oto"]),
        restriction: v.picklist(["set", "add"]),
        pk: v.pipe(v.string(), v.minLength(1)),
        nullable: v.optional(v.boolean()),
    }),
    v.partialCheck(
        [["nullable"], ["mode"]],
        input => !(input.nullable === true && input.mode !== "mto" && input.mode !== "oto"),
        "'nullable: true' is only valid for 'mto' and 'oto' relations; 'otm' and 'mtm' relations do not support 'nullable'.",
    ),
);
