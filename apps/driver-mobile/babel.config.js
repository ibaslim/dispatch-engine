module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@components': './src/components',
            '@screens': './src/screens',
            '@services': './src/services',
            '@hooks': './src/hooks',
            '@contexts': './src/contexts',
            '@navigation': './src/navigation',
            '@constants': './src/constants',
            '@theme': './src/theme',
            '@types': './src/types',
            '@utils': './src/utils',
            '@dispatch/shared/domain': '../../libs/shared/domain/src/index.ts',
            '@dispatch/shared/contracts': '../../libs/shared/contracts/src/index.ts',
            '@dispatch/shared/api-client': '../../libs/shared/api-client/src/index.ts',
          },
        },
      ],
    ],
  };
};
