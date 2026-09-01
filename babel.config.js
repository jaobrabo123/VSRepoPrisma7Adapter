/** @type {import('@babel/core').ConfigFunction} */
module.exports = {
    presets: [
        ["@babel/preset-env", { targets: { node: "current" } }],
        ["@babel/preset-typescript", { allowDeclareFields: true }],
    ],
    // `legacy: true` pra bater com `experimentalDecorators: true` do tsconfig
    // (decorators no estilo antigo do TypeScript, usados por `vsrepo` em
    // `@DynamicMethod`/`@QueryMethod`) — sem isso, babel-jest não consegue
    // parsear classes de repositório que usam esses decorators.
    plugins: [["@babel/plugin-proposal-decorators", { legacy: true }]],
};
