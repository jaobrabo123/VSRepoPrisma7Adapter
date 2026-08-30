/**
 * Configuration of a single relation field, using the same shape the v1 of
 * VSRepository used.
 *
 * - `mode`: cardinality of the relation from the point of view of the entity
 *   that owns the field (`oto` = one-to-one, `mto` = many-to-one,
 *   `otm` = one-to-many, `mtm` = many-to-many).
 * - `restriction`: how `save`/`update`/`upsert` handle to-many relations
 *   (`otm`/`mtm`) and to-one relations pointing to an already-existing record
 *   (matched by `pk`) — `"add"` only creates/connects the items that were
 *   sent (upsert per item), `"set"` also removes/disconnects whatever wasn't
 *   sent.
 * - `pk`: name of the field used as the identifier of the related record,
 *   used to decide between `create` (no pk in the payload) and
 *   `connectOrCreate`/`upsert` (pk present).
 * - `nullable`: for `mto` relations, whether the field accepts being set to
 *   `null` (resolved as `disconnect`).
 *
 * @publicApi
 */
export interface Relation<T = any> {
    mode: "otm" | "mtm" | "mto" | "oto";
    restriction: "set" | "add";
    pk: keyof T;
    nullable?: boolean;
}
