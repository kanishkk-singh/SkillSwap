const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

// Helper: sign JWT
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// Helper: send token response
const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id:       user._id,
      fname:    user.fname,
      lname:    user.lname,
      username: user.username,
      email:    user.email,
      offer:    user.offer,
      want:     user.want,
    },
  });
};

// ── POST /api/auth/register ──────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { fname, lname, username, email, password, offer, want } = req.body;

    // Duplicate checks (mirrors frontend checkUsername logic)
    if (await User.findOne({ username: username.toLowerCase() })) {
      return res.status(400).json({ success: false, message: 'Username already taken. Choose another.' });
    }
    if (await User.findOne({ email: email.toLowerCase() })) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const user = await User.create({ fname, lname, username: username.toLowerCase(), email: email.toLowerCase(), password, offer, want });
    sendToken(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/login ─────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { username, password } = req.body;
    const user = await User.findOne({ username: username.toLowerCase() }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Incorrect username or password.' });
    }

    sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};
