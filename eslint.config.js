import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const relaxedRules = {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
        'warn',
        {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
        },
    ],
    '@typescript-eslint/ban-ts-comment': 'off',
    'no-empty': 'off',
    'no-constant-condition': 'off',
};

export default tseslint.config(
    {
        ignores: ['node_modules/**', 'dist/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        files: ['src/**/*.ts', 'src/**/*.tsx'],
        languageOptions: {
            globals: {
                process: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                Buffer: 'readonly',
                globalThis: 'readonly',
                fetch: 'readonly',
                AbortSignal: 'readonly',
                FormData: 'readonly',
                Blob: 'readonly',
                Timer: 'readonly',
                crypto: 'readonly',
                SharedArrayBuffer: 'readonly',
                Atomics: 'readonly',
                Int32Array: 'readonly',
                TextDecoder: 'readonly',
                WebSocket: 'readonly',
                Bun: 'readonly',
            },
        },
        rules: { ...relaxedRules },
    }
);
