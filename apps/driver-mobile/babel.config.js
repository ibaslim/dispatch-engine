module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'nativewind/babel',
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@dispatch/shared/domain': '../../libs/shared/domain/src/index.ts',
            '@dispatch/shared/contracts': '../../libs/shared/contracts/src/index.ts',
            '@dispatch/shared/api-client': '../../libs/shared/api-client/src/index.ts',
          },
        },
      ],
    ],
  };
};
