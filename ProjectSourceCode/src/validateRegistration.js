function validateRegistration(input) {
    return Boolean(
        input &&
        typeof input.username === 'string' &&
        input.username.trim().length > 0 &&
        input.username.length <= 50 &&
        typeof input.email == 'string' &&
        input.email.trim().length > 0 &&
        input.email.length <= 100 &&
        typeof input.password === 'string' &&
        input.password.length > 0
        );
}

module.exports = validateRegistration;
