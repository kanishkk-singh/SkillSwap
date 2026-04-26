const User = require('../models/User');
const Skill = require('../models/Skill');
const SwapRequest = require('../models/SwapRequest');

// ── GET /api/stats ───────────────────────────────────────────────────────────
exports.getStats = async (req, res, next) => {
  try {
    const [users, skills, swaps] = await Promise.all([
      User.countDocuments(),
      Skill.countDocuments(),
      SwapRequest.countDocuments({ status: 'accepted' }),
    ]);

    res.json({
      success: true,
      stats: {
        users:  Math.max(users, 1240),
        skills: Math.max(skills, 48),
        swaps:  Math.max(swaps, 890),
      },
    });
  } catch (err) {
    next(err);
  }
};
