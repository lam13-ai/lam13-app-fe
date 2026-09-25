// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** Architecture boundaries from frontend-architecture.md §3. */
const vendorSdkPatterns = [
  { group: ['@kinde-oss/*'], message: 'Kinde may only be imported inside src/features/auth.' },
  { group: ['@vapi-ai/*'], message: 'Vapi may only be imported inside src/features/calling.' },
];
const featureDeepImport = {
  group: ['@/features/*/*'],
  message: "Import other features through their public index ('@/features/<name>').",
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      // `({ node, ...props })` is the idiomatic way to drop a prop.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
      // Only src/api may talk to the network.
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Use the API client in src/api instead of fetch.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'fetch', message: 'Use the API client in src/api.' },
        { object: 'globalThis', property: 'fetch', message: 'Use the API client in src/api.' },
      ],
      'no-restricted-imports': ['error', { patterns: [...vendorSdkPatterns, featureDeepImport] }],
    },
  },
  {
    // Generic UI must stay feature-agnostic.
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...vendorSdkPatterns,
            { group: ['@/features', '@/features/*'], message: 'components/ must not import features/.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/api/**/*.{ts,tsx}'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    files: ['src/features/auth/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [vendorSdkPatterns[1], featureDeepImport] }],
    },
  },
  {
    files: ['src/features/calling/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [vendorSdkPatterns[0], featureDeepImport] }],
    },
  },
  {
    files: ['*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
