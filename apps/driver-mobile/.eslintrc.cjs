module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
    jest: true,
  },
  globals: {
    __DEV__: 'readonly',
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['node_modules/', 'android/', 'ios/', '.expo/', 'dist/'],
};
