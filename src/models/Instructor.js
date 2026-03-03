const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Sub‑documento para códigos de convite (expira em 30 dias)
const invitationCodeSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  createdAt: { type: Date, default: Date.now, expires: 2592000 },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

const instructorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  bio: { type: String, default: '' },
  studentsLinked: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  invitationCodes: [invitationCodeSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// ========== MÉTODO: COMPARAR SENHA ==========
instructorSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Instructor', instructorSchema);
