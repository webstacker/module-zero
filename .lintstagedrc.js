module.exports = {
    '*.js': ['eslint --fix --color', 'git add'],
    '*.json': ['prettier --write', 'git add']
};
