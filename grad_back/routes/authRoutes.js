const express = require('express');
const router = express.Router();
const { login, register, createTestUser, resetPassword } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/create-test-user', createTestUser);
router.post('/reset-password', resetPassword);

module.exports = router;

