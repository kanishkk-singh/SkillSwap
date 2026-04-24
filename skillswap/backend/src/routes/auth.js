const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/register',
  [
    body('fname').notEmpty().withMessage('First name is required'),
    body('username').notEmpty().withMessage('Username is required')
      .isAlphanumeric('en-US', { ignore: '_' }).withMessage('Username can only contain letters, numbers and underscores'),
    body('email').isEmail().withMessage('Please enter a valid email address'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('offer').notEmpty().withMessage('Please select a skill you offer'),
    body('want').notEmpty().withMessage('Please select a skill you want to learn'),
  ],
  register
);

router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

router.get('/me', protect, getMe);

module.exports = router;
