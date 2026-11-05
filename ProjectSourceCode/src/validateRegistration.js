function validateRegistration(input) {
  return Boolean(
    input &&
      typeof input.username === 'string' &&
      input.username.trim().length > 0 &&
      typeof input.password === 'string' &&
      input.password.length >= 8
  );
}

module.exports = validateRegistration;