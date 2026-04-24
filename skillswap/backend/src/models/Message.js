const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    swapRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SwapRequest',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    from: { type: String, required: true },   // username (denormalized for display)
    text: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
