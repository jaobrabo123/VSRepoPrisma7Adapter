// Fixtures que criam registros diretamente via Prisma Client (não via o
// adapter, para manter os testes do adapter independentes de si mesmos).

import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "./db";
import { User } from "./entities";

function uniqueSuffix(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createUser(overrides: Partial<Prisma.UserCreateInput> = {}) {
    return prisma.user.create({
        data: {
            email: `user-${uniqueSuffix()}@example.com`,
            name: "Test User",
            ...overrides,
        },
    }) as unknown as Promise<User>;
}

export function createPost(authorId: number, overrides: Partial<Prisma.PostUncheckedCreateInput> = {}) {
    return prisma.post.create({
        data: {
            title: `Test Post ${uniqueSuffix()}`,
            authorId,
            ...overrides,
        },
    });
}

export function createTag(overrides: Partial<Prisma.TagCreateInput> = {}) {
    return prisma.tag.create({
        data: {
            name: `tag-${uniqueSuffix()}`,
            ...overrides,
        },
    });
}
