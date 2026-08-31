// Tipos "manuais" que espelham `prisma/schema.prisma`, usados só nos testes.
//
// O `VSRepoPrisma7Adapter` não depende de tipos gerados pelo Prisma Client em
// tempo de execução (o client é recebido como `any` no construtor) — os tipos
// gerados só entram para dar autocomplete/typesafety no código da aplicação.
// Como neste ambiente de teste não é possível baixar os engine binaries do
// Prisma (`prisma generate` precisa de rede irrestrita), replicamos aqui só o
// formato dos modelos que os testes precisam, em vez do client gerado.

import { PostGetPayload, UserGetPayload } from "../../generated/prisma/models";

export type User = UserGetPayload<{
    include: { address: true; posts: { include: { tags: true } } };
}>;

export type Post = PostGetPayload<{ include: { tags: true } }>;
