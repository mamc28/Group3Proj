const { expect } = require('chai');
const validateRegistration = require('../src/validateRegistration');

describe('Registration validation', () => {
    it('rejects a missing password', () => {
        expect(validateRegistration({
            username: 'student',
            email: 'student@example.com',
            password: '',
        })).to.equal(false);
    });
});