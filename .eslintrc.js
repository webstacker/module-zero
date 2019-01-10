module.exports = {
    extends: ['airbnb-base', 'prettier'],
    env: {
        jest: true,
        node: true
    },
    rules: {
        'prettier/prettier': ['error'],
        'linebreak-style': ['error', process.platform === 'win32' ? 'windows' : 'unix']
    },
    plugins: ['prettier']
};
