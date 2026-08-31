// Client Prisma real, usado pelos testes de integração do adapter (requer um
// Postgres acessível via DATABASE_URL — ver README/CI). Mesmo padrão de
// `tests/prisma.ts`, mas isolado aqui para não competir com o client de
// exemplo do repositório.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });

/**
 * Apaga todos os registros das tabelas usadas nos testes, respeitando as FKs:
 * `Post` primeiro (cascade limpa `_PostToTag`), depois `Address` (FK
 * `RESTRICT` para `User`), depois `User`, e por fim `Tag`.
 */
export async function cleanDatabase(): Promise<void> {
    await prisma.post.deleteMany();
    await prisma.address.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tag.deleteMany();
}
