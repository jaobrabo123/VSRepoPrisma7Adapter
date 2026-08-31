/** @type {import('jest').Config} */
module.exports = {
    rootDir: ".",
    testEnvironment: "node",
    testMatch: ["<rootDir>/tests/**/*.test.ts"],
    // Nota: o projeto usa TypeScript 7 (compilador nativo), que ainda não
    // expõe a API de compilador em JS exigida pelo `ts-jest`. Por isso os
    // testes usam `babel-jest` (só transpila, não type-checka) — o
    // type-checking em si continua rodando via `tsc --noEmit` (ver
    // `tests/tsconfig.json` e o script `test:types`).
    transform: {
        "^.+\\.tsx?$": "babel-jest",
    },
    // O generator `prisma-client` do Prisma 7 emite os arquivos do client em
    // TypeScript com imports relativos usando extensão `.js` (padrão
    // `module: nodenext`). Como os testes rodam via babel-jest (transpila em
    // memória, sem emitir `.js` no disco), o Jest não acha o módulo
    // `./enums.js`. Este mapper faz o Jest resolver `./x.js` -> `./x`.
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
    // `prisma7.adapter.test.ts` roda contra um Postgres real e compartilhado
    // (limpo a cada teste) — igual à v1 de VSRepository, os testes de
    // implementação rodam em série (1 worker) pra evitar que dois arquivos
    // limpem/gravem o banco ao mesmo tempo.
    maxWorkers: 1,
    testTimeout: 20000,
};
