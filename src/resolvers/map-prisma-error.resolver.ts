import { AdapterErrorCode, VSRepoAdapterError } from "vsrepo";

/**
 * Maps a Prisma `PrismaClientKnownRequestError.code` (e.g. `"P2002"`) to a
 * stable, adapter-agnostic `AdapterErrorCode`. Only codes an application is
 * realistically expected to react to are listed here — anything else falls
 * back to `AdapterErrorCode.UNKNOWN` in `mapPrismaError`.
 *
 * @see https://www.prisma.io/docs/orm/reference/error-reference
 */
const KNOWN_REQUEST_ERROR_CODE_MAP: Record<string, AdapterErrorCode> = {
    // Connection / engine errors (P1xxx)
    P1000: AdapterErrorCode.INVALID_CREDENTIALS,
    P1001: AdapterErrorCode.CONNECTION_FAILED,
    P1002: AdapterErrorCode.TIMEOUT,
    P1008: AdapterErrorCode.TIMEOUT,
    P1010: AdapterErrorCode.ACCESS_DENIED,
    P1011: AdapterErrorCode.CONNECTION_FAILED,
    P1017: AdapterErrorCode.CONNECTION_CLOSED,

    // Query engine errors (P2xxx)
    P2000: AdapterErrorCode.VALUE_TOO_LONG,
    P2001: AdapterErrorCode.NOT_FOUND,
    P2002: AdapterErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
    P2003: AdapterErrorCode.FOREIGN_KEY_VIOLATION,
    P2004: AdapterErrorCode.CONSTRAINT_VIOLATION,
    P2005: AdapterErrorCode.CONVERSION_ERROR,
    P2006: AdapterErrorCode.INVALID_DATA,
    P2007: AdapterErrorCode.INVALID_DATA,
    P2010: AdapterErrorCode.INVALID_QUERY,
    P2011: AdapterErrorCode.NOT_NULL_VIOLATION,
    P2012: AdapterErrorCode.INVALID_DATA,
    P2014: AdapterErrorCode.CONSTRAINT_VIOLATION,
    P2015: AdapterErrorCode.NOT_FOUND,
    P2016: AdapterErrorCode.INVALID_QUERY,
    P2017: AdapterErrorCode.NOT_FOUND,
    P2018: AdapterErrorCode.NOT_FOUND,
    P2019: AdapterErrorCode.INVALID_DATA,
    P2020: AdapterErrorCode.CONVERSION_ERROR,
    P2021: AdapterErrorCode.TABLE_OR_COLUMN_NOT_FOUND,
    P2022: AdapterErrorCode.TABLE_OR_COLUMN_NOT_FOUND,
    P2023: AdapterErrorCode.CONVERSION_ERROR,
    P2024: AdapterErrorCode.CONNECTION_POOL_EXHAUSTED,
    P2025: AdapterErrorCode.NOT_FOUND,
    P2026: AdapterErrorCode.NOT_SUPPORTED,
    P2028: AdapterErrorCode.TRANSACTION_CLOSED,
    P2030: AdapterErrorCode.NOT_SUPPORTED,
    P2031: AdapterErrorCode.NOT_SUPPORTED,
    P2033: AdapterErrorCode.CONVERSION_ERROR,
    P2034: AdapterErrorCode.TRANSACTION_CONFLICT,
    P2037: AdapterErrorCode.CONNECTION_POOL_EXHAUSTED,
};

/** Duck-typed shape of the handful of Prisma error properties this mapper reads. */
type PrismaLikeError = {
    name?: string;
    code?: string;
    message?: string;
};

/**
 * Reads the Prisma error class name (`PrismaClientKnownRequestError`,
 * `PrismaClientInitializationError`, ...) off a caught error without
 * importing `@prisma/client` — the adapter never imports concrete Prisma
 * types (see `Prisma7ClientLike`), so this duck-types via `error.name`
 * instead of using `instanceof`.
 */
function prismaErrorName(error: unknown): string | undefined {
    if (!(error instanceof Error)) return undefined;
    return error.name || error.constructor?.name;
}

/**
 * Converts any error caught around a Prisma Client call into a
 * `VSRepoAdapterError`, so `VSRepoPrisma7Adapter` never lets a raw Prisma (or
 * other) error escape. Already-wrapped errors — e.g. bubbling up from a
 * nested adapter call, such as `save` inside `saveMany`, or a config/usage
 * error thrown by the adapter itself (see `stripRelationFields`) — are
 * returned as-is instead of being wrapped a second time.
 *
 * @param error - The raw error caught around a Prisma Client call.
 * @param operation - Name of the adapter method that failed, used in the message.
 */
export function mapPrismaError(error: unknown, operation: string): VSRepoAdapterError {
    if (error instanceof VSRepoAdapterError) return error;

    const name = prismaErrorName(error);
    const prismaError = error as PrismaLikeError;

    switch (name) {
        case "PrismaClientKnownRequestError": {
            const code = prismaError.code
                ? KNOWN_REQUEST_ERROR_CODE_MAP[prismaError.code]
                : undefined;

            return new VSRepoAdapterError(
                `'${operation}' failed (Prisma code: ${prismaError.code ?? "unknown"})`,
                code ?? AdapterErrorCode.UNKNOWN,
                error,
            );
        }

        case "PrismaClientInitializationError":
            return new VSRepoAdapterError(
                `'${operation}' failed to initialize/connect to the database`,
                AdapterErrorCode.CONNECTION_FAILED,
                error,
            );

        case "PrismaClientRustPanicError":
            return new VSRepoAdapterError(
                `'${operation}' failed due to an internal Prisma engine panic`,
                AdapterErrorCode.INTERNAL,
                error,
            );

        case "PrismaClientValidationError":
            return new VSRepoAdapterError(
                `'${operation}' received invalid data/arguments`,
                AdapterErrorCode.INVALID_DATA,
                error,
            );

        case "PrismaClientUnknownRequestError":
            return new VSRepoAdapterError(
                `'${operation}' failed with an unrecognized Prisma error`,
                AdapterErrorCode.UNKNOWN,
                error,
            );

        default:
            return new VSRepoAdapterError(
                `'${operation}' failed: ${prismaError?.message ?? "unknown error"}`,
                AdapterErrorCode.UNKNOWN,
                error,
            );
    }
}
