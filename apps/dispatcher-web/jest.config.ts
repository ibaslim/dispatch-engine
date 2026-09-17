module.exports = {
  displayName: 'dispatcher-web',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/apps/dispatcher-web',
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$',
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
  // Mirrors the path aliases in tsconfig.app.json so specs can load code that imports them.
  moduleNameMapper: {
    '^@dispatch/shared/(.*)$': '<rootDir>/../../libs/shared/$1/src/index.ts',
    '^@core/(.*)$': '<rootDir>/src/app/core/$1',
    '^@components/(.*)$': '<rootDir>/src/app/components/$1',
    '^@pages/(.*)$': '<rootDir>/src/app/pages/$1',
    '^@models/(.*)$': '<rootDir>/src/app/models/$1',
    '^@services/(.*)$': '<rootDir>/src/app/services/$1',
  },
  snapshotSerializers: [
    'jest-preset-angular/build/serializers/no-ng-attributes',
    'jest-preset-angular/build/serializers/ng-snapshot',
    'jest-preset-angular/build/serializers/html-comment',
  ],
};
