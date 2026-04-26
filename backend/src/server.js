const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load env
dotenv.config();

// Connect MongoDB
connectDB();

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/skills',   require('./routes/skills'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/chat',     require('./routes/chat'));
app.use('/api/reviews',  require('./routes/reviews'));
app.use('/api/stats',    require('./routes/stats'));

// ── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 SkillSwap server running on port ${PORT}`));
