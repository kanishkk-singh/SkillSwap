const express    = require('express');
const cors       = require('cors');
const morgan     = require('morgan');
const dotenv     = require('dotenv');
const { createServer } = require('http');
const { Server }       = require('socket.io');
const connectDB  = require('./config/db');

dotenv.config();
connectDB();

const app        = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://skill-swap-chi-nine.vercel.app',
      'https://skill-swap-qxni6wrd9-kanishkk-singhs-projects.vercel.app',
    ],
    methods: ['GET', 'POST'],
  },
});

// rooms[roomId] = { caller: {id,username}, callee: {id,username} | null }
const rooms = {};

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // ── Caller joins first ──────────────────────────────────────────────────
  socket.on('caller-join', ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId   = roomId;
    socket.username = username;
    socket.role     = 'caller';
    rooms[roomId]   = { caller: { id: socket.id, username }, callee: null };
    console.log(`CALLER ${username} joined room ${roomId}`);
  });

  // ── Callee joins (after accepting) ─────────────────────────────────────
  socket.on('callee-join', ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId   = roomId;
    socket.username = username;
    socket.role     = 'callee';

    if (!rooms[roomId]) { socket.emit('room-error'); return; }
    if (rooms[roomId].callee) { socket.emit('room-full'); return; }

    rooms[roomId].callee = { id: socket.id, username };

    // Tell caller that callee is ready — caller should now create offer
    const callerId = rooms[roomId].caller?.id;
    if (callerId) {
      io.to(callerId).emit('callee-ready', { calleeId: socket.id, username });
    }
    console.log(`CALLEE ${username} joined room ${roomId}`);
  });

  // ── Callee page loaded — register to receive incoming call ──────────────
  // Callee opens /meet/:id page, registers socket so caller can ring them
  socket.on('callee-listen', ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId   = roomId;
    socket.username = username;
    socket.role     = 'listening';
    console.log(`LISTENING ${username} in room ${roomId}`);
  });

  // ── Caller rings callee ─────────────────────────────────────────────────
  // Caller emits this after joining, server forwards to callee in same room
  socket.on('ring-callee', ({ roomId, callerName }) => {
    // Find the listening callee in this room (not the caller)
    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    if (socketsInRoom) {
      for (const sid of socketsInRoom) {
        const s = io.sockets.sockets.get(sid);
        if (s && s.role === 'listening') {
          s.emit('incoming-call', { callerId: socket.id, callerName, roomId });
          console.log(`Rang callee ${s.username} in room ${roomId}`);
        }
      }
    }
  });

  // ── WebRTC signaling ────────────────────────────────────────────────────
  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer, username: socket.username });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // ── Call control ────────────────────────────────────────────────────────
  socket.on('call-rejected', ({ to }) => {
    io.to(to).emit('call-rejected');
  });

  socket.on('call-missed', ({ to }) => {
    io.to(to).emit('call-missed');
  });

  socket.on('end-call', ({ roomId, username }) => {
    socket.to(roomId).emit('peer-left', { username });
  });

  // ── Disconnect ──────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('peer-left', { username: socket.username });
      if (rooms[roomId]) {
        const r = rooms[roomId];
        if (r.caller?.id === socket.id || r.callee?.id === socket.id) {
          delete rooms[roomId];
        }
      }
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// ── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'https://skill-swap-chi-nine.vercel.app',
  'https://skill-swap-qxni6wrd9-kanishkk-singhs-projects.vercel.app',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));

app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/skills',   require('./routes/skills'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/chat',     require('./routes/chat'));
app.use('/api/reviews',  require('./routes/reviews'));
app.use('/api/stats',    require('./routes/stats'));

app.get('/', (req, res) => res.send('SkillSwap API is running 🚀'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 SkillSwap server running on port ${PORT}`));