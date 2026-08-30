/**
 * @publicApi
 */
export class VSRepoPrisma7AdapterError extends Error {
    constructor(message: string, cause?: unknown) {
        super(`[VSRepoPrisma7Adapter] ${message}`, { cause });
        this.name = "VSRepoPrisma7AdapterError";
    }
}
