const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const dotenv  = require('dotenv');
const { createServer } = require('http');        // ← ADD 1
const { Server }       = require('socket.io');   // ← ADD 2
const connectDB = require('./config/db');

// Load env
dotenv.config();

// Connect MongoDB
connectDB();

const app        = express();
const httpServer = createServer(app);            // ← ADD 3

// ── Socket.io setup ───────────────────────────────────────────────────
const io = new Server(httpServer, {              // ← ADD 4
  cors: {
    origin: [
  'http://localhost:3000',
  'https://skill-swap-chi-nine.vercel.app',
  'https://skill-swap-qxni6wrd9-kanishkk-singhs-projects.vercel.app',
],
    methods: ['GET', 'POST'],
  },
});

// ── Signaling logic ───────────────────────────────────────────────────
const rooms = {};

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join-meet', ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId   = roomId;
    socket.username = username;

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push({ id: socket.id, username });

    const others = rooms[roomId].filter(u => u.id !== socket.id);
    socket.emit('room-peers', others);
    socket.to(roomId).emit('peer-joined', { id: socket.id, username });
    console.log(`${username} joined room ${roomId}`);
  });

  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer, username: socket.username });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
      if (rooms[roomId].length === 0) delete rooms[roomId];
      socket.to(roomId).emit('peer-left', { id: socket.id, username: socket.username });
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// ── CORS ──────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'https://skill-swap-chi-nine.vercel.app',
  'https://skill-swap-qxni6wrd9-kanishkk-singhs-projects.vercel.app',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
}));

// ── Middleware ────────────────────────────────────────────────────────
app.use(express.json());
app.use(morgan('dev'));

// ── Routes ───────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/skills',   require('./routes/skills'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/chat',     require('./routes/chat'));
app.use('/api/reviews',  require('./routes/reviews'));
app.use('/api/stats',    require('./routes/stats'));

// ── Health check ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('SkillSwap API is running 🚀');
});

// ── Global error handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// ── Start server ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () =>
  console.log(`🚀 SkillSwap server running on port ${PORT}`)
);