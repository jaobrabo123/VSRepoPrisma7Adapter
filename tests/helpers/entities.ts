// Tipos "manuais" que espelham `prisma/schema.prisma`, usados só nos testes.
//
// O `VSRepoPrisma7Adapter` não depende de tipos gerados pelo Prisma Client em
// tempo de execução (o client é recebido como `any` no construtor) — os tipos
// gerados só entram para dar autocomplete/typesafety no código da aplicação.
// Como neste ambiente de teste não é possível baixar os engine binaries do
// Prisma (`prisma generate` precisa de rede irrestrita), replicamos aqui só o
// formato dos modelos que os testes precisam, em vez do client gerado.

export interface Address {
    id: number;
    street: string;
    city: string;
    country: string;
    userId: number;
}

export interface Tag {
    id: number;
    name: string;
}

export interface Post {
    id: number;
    title: string;
    content: string | null;
    published: boolean;
    authorId: number;
    tags?: Tag[];
}

export interface User {
    id: number;
    email: string;
    name: string | null;
    posts?: Post[];
    address?: Address | null;
}
