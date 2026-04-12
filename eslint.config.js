// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['store/cameraStore.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
]);
