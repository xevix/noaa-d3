module.exports = [
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                console: 'readonly',
                require: 'readonly',
                module: 'readonly',
                __dirname: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                document: 'readonly',
                window: 'readonly',
                d3: 'readonly',
                fetch: 'readonly',
                URLSearchParams: 'readonly',
                alert: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            'no-console': 'off',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single'],
            'indent': ['error', 4],
            'no-trailing-spaces': 'error',
            'eol-last': 'error',
            'no-multiple-empty-lines': ['error', { 'max': 2 }],
            'comma-dangle': ['error', 'never'],
            'brace-style': ['error', '1tbs'],
            'keyword-spacing': 'error',
            'space-before-blocks': 'error',
            'object-curly-spacing': ['error', 'always'],
            'array-bracket-spacing': ['error', 'never']
        }
    }
];
