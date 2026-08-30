import * as v from "valibot";
import { VSLogLevel } from "vsrepo";
import { relationSchema } from "./relation.schema";

export const adapterConfigSchema = v.object({
    tableName: v.pipe(v.string(), v.minLength(1)),
    pkName: v.pipe(v.string(), v.minLength(1)),
    relations: v.optional(v.record(v.string(), relationSchema)),
    logLevel: v.optional(v.enum(VSLogLevel)),
});
