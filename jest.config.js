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
};
