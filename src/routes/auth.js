const express = require('express');
const router = express.Router();
const { register, login, deleteAccount } = require('../controllers/authController');
const authenticateToken = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.delete('/delete-account', authenticateToken, deleteAccount);

module.exports = router;