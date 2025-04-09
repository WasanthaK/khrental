import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

// Fix by creating custom globals without the whitespace issue
const customGlobals = {
  ...globals.browser
}

// Ensure no keys with leading/trailing whitespace
Object.keys(customGlobals).forEach(key => {
  if (key.trim() !== key) {
    // Copy the value to a clean key and delete the problematic one
    customGlobals[key.trim()] = customGlobals[key];
    delete customGlobals[key];
  }
});

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: customGlobals,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Add a rule to enforce braces around if statements
      'curly': ['error', 'all'],
    },
  },
]
