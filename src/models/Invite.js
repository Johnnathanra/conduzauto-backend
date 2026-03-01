const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema({
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor', required: true },
  instructorName: String,
  instructorEmail: String,
  slug: { type: String, unique: true, sparse: true, index: true },
  code: { type: String, unique: true, required: true, index: true },
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  createdAt: { type: Date, default: Date.now },
  usedBy: [{ studentId: mongoose.Schema.Types.ObjectId, usedAt: Date }],
  usageCount: { type: Number, default: 0 },
  maxUses: { type: Number, default: null }
});

inviteSchema.index({ instructorId: 1, isActive: 1 });
inviteSchema.index({ slug: 1, code: 1 });

module.exports = mongoose.model('Invite', inviteSchema);
