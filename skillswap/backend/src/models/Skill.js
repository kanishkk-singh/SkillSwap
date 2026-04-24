const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    category:   { type: String, required: true },
    desc:       { type: String, required: true, trim: true },
    wantLearn:  { type: String, required: true },
    avail:      { type: String, required: true, default: 'Flexible' },
    emoji:      { type: String, default: '🔧' },
    // Owner reference
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Denormalized display fields (matches original frontend ss_skills structure)
    offeredBy: { type: String, required: true },   // full name string
    username:  { type: String, required: true },   // owner username
  },
  { timestamps: true }
);

// Text index for search
skillSchema.index({ name: 'text', desc: 'text', offeredBy: 'text' });

module.exports = mongoose.model('Skill', skillSchema);
