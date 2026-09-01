// Helper que cria um "Prisma Client" falso (delegates mockados com jest.fn()),
// no mesmo espírito do `fakePrisma` usado em `error-handling.test.ts` na v1 de
// VSRepository — mas aqui também usado para os testes "felizes" do adapter,
// já que o objetivo é verificar QUAIS chamadas o adapter faz no client, e com
// QUAIS argumentos, sem precisar de um Postgres real.

/** Delegate mockado de uma tabela do Prisma (ex.: `prisma.user`). */
export function createFakeDelegate() {
    return {
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        createManyAndReturn: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        updateManyAndReturn: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
    };
}

export type FakeDelegate = ReturnType<typeof createFakeDelegate>;

/**
 * Cria um client Prisma falso com delegates para `user`, `address`, `post` e
 * `tag`, além de `$transaction`/`$queryRawUnsafe`/`$executeRawUnsafe`/`$on`.
 *
 * `$transaction` por padrão só executa o callback passando o próprio client
 * falso como `tx` (não simula rollback/commit de verdade) — suficiente para
 * verificar que o adapter participa/inicia transações corretamente.
 */
export function createFakePrisma() {
    const user = createFakeDelegate();
    const address = createFakeDelegate();
    const post = createFakeDelegate();
    const tag = createFakeDelegate();

    const client: any = {
        user,
        address,
        post,
        tag,
        $queryRawUnsafe: jest.fn(),
        $executeRawUnsafe: jest.fn(),
        // Presente só no client raiz (ver `isRootClient` do adapter).
        $on: jest.fn(),
        $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => fn(client)),
    };

    return { client, user, address, post, tag };
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;
