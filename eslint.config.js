import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// La lógica pura (core, game y la parte lógica del audio) no puede tocar Three.js, el DOM ni Math.random:
// así se mantiene determinista y testeable.
const pureRestrictions = {
  'no-restricted-imports': [
    'error',
    { patterns: [{ group: ['three', 'three/*'], message: 'La lógica pura no importa three.' }] },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'window', message: 'La lógica pura no toca el DOM.' },
    { name: 'document', message: 'La lógica pura no toca el DOM.' },
    { name: 'localStorage', message: 'Usa save/storage.ts.' },
    { name: 'navigator', message: 'La lógica pura no toca el navegador.' },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Usa core/rng.ts con semilla.' },
  ],
};

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[property.name='innerHTML']", message: 'Usa textContent.' },
        { selector: "MemberExpression[property.name='outerHTML']", message: 'Usa textContent.' },
        {
          selector: "CallExpression[callee.property.name='write'][callee.object.name='document']",
          message: 'Prohibido document.write.',
        },
      ],
    },
  },
  {
    files: [
      'src/core/**/*.ts',
      'src/game/**/*.ts',
      'src/data/**/*.ts',
      'src/save/**/*.ts',
      // Parte lógica del audio (la parte con WebAudio vive en mixer.ts, sfx.ts y engine.ts).
      'src/audio/voices.ts',
      'src/audio/sfx-map.ts',
      'src/audio/music.ts',
    ],
    rules: pureRestrictions,
  },
  {
    // storage.ts es el único punto que puede leer y escribir localStorage.
    files: ['src/save/storage.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    files: ['tests/**/*.ts', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
