module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parser: '@typescript-eslint/parser',
  extends: ['eslint:recommended'],
  plugins: ['react-hooks'],
  ignorePatterns: ['dist', 'node_modules'],
  rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
};
