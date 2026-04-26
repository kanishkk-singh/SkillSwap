const { validationResult } = require('express-validator');
const Skill = require('../models/Skill');

const EMOJIS = {
  'Web Development': '💻', 'Graphic Design': '🎨', 'Photography': '📸',
  'Public Speaking': '🎤', 'Video Editing': '🎬', 'Data Analysis': '📊',
  'Music / Guitar': '🎸', 'Content Writing': '✍️', 'Digital Marketing': '📣', 'Other': '🔧',
};

// ── GET /api/skills ──────────────────────────────────────────────────────────
// Query params: search, category, sort (newest|oldest|alpha)
exports.getSkills = async (req, res, next) => {
  try {
    const { search, category, sort } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name:      { $regex: search, $options: 'i' } },
        { desc:      { $regex: search, $options: 'i' } },
        { offeredBy: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) filter.category = category;

    let sortObj = { createdAt: -1 }; // newest
    if (sort === 'oldest') sortObj = { createdAt: 1 };
    if (sort === 'alpha')  sortObj = { name: 1 };

    const skills = await Skill.find(filter).sort(sortObj).lean();

    // Shape to match frontend structure exactly
    const shaped = skills.map(s => ({
      id:         s._id,
      _id:        s._id,
      name:       s.name,
      category:   s.category,
      desc:       s.desc,
      wantLearn:  s.wantLearn,
      avail:      s.avail,
      emoji:      s.emoji,
      offeredBy:  s.offeredBy,
      username:   s.username,
      added:      s.createdAt,
    }));

    res.json({ success: true, skills: shaped });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/skills ─────────────────────────────────────────────────────────
exports.createSkill = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { name, category, desc, wantLearn, avail } = req.body;
    const user = req.user;

    const skill = await Skill.create({
      name, category, desc, wantLearn, avail,
      emoji:     EMOJIS[category] || '🔧',
      owner:     user._id,
      offeredBy: user.fname ? `${user.fname} ${user.lname || ''}`.trim() : user.username,
      username:  user.username,
    });

    res.status(201).json({
      success: true,
      skill: {
        id:        skill._id,
        _id:       skill._id,
        name:      skill.name,
        category:  skill.category,
        desc:      skill.desc,
        wantLearn: skill.wantLearn,
        avail:     skill.avail,
        emoji:     skill.emoji,
        offeredBy: skill.offeredBy,
        username:  skill.username,
        added:     skill.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/skills/:id ───────────────────────────────────────────────────
exports.deleteSkill = async (req, res, next) => {
  try {
    const skill = await Skill.findById(req.params.id);
    if (!skill) return res.status(404).json({ success: false, message: 'Skill not found' });

    if (skill.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorised to delete this skill' });
    }

    await skill.deleteOne();
    res.json({ success: true, message: 'Skill removed' });
  } catch (err) {
    next(err);
  }
};
