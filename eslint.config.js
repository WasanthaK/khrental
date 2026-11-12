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
      // Underscore arguments retain public compatibility signatures and Express error-handler arity.
      'no-unused-vars':['error',{argsIgnorePattern:'^_'}],
      'react/jsx-uses-react':'error','react/jsx-uses-vars':'error','curly':['error','all']}
  },
  {files:['src/api/managementBilling/**/*.js'],ignores:['src/api/managementBilling/clock.js'],rules:{
    'no-restricted-syntax':['error',
      {selector:"CallExpression[callee.object.name='Date'][callee.property.name='now']",message:'Use the injected billing clock.'},
      {selector:"CallExpression[callee.object.name='Date'][callee.property.value='now']",message:'Use the injected billing clock.'},
      {selector:"NewExpression[callee.name='Date'][arguments.length=0]",message:'Use the injected billing clock.'},
      {selector:"CallExpression[callee.name='Date']",message:'Use the injected billing clock.'}]
  }},
  {files:['**/*.cjs'],languageOptions:{sourceType:'commonjs'}}
];
