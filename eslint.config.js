import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {ignores:['dist/**','node_modules/**','marketing/**','testing/**']},
  {
    files:['**/*.{js,jsx,mjs,cjs}'],
    languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.es2021,...globals.node,...globals.browser},parserOptions:{ecmaFeatures:{jsx:true}}},
    plugins:{react,'react-hooks':reactHooks},
    rules:{...js.configs.recommended.rules,...reactHooks.configs.recommended.rules,
      'react/jsx-uses-react':'error','react/jsx-uses-vars':'error','curly':['error','all']}
  },
  {files:['**/*.cjs'],languageOptions:{sourceType:'commonjs'}}
];
