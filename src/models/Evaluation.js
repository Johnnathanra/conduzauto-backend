const mongoose = require('mongoose');

const EvaluationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instructor',
    required: true,
  },
  courseLesson: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  concept: {
    type: String,
    enum: ['Excelente', 'Bom', 'Satisfatório', 'Insuficiente'],
    required: true,
  },
  feedback: {
    type: String,
    default: '',
  },
  improvementSuggestions: {
    type: String,
    default: '',
  },
  evaluatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Evaluation', EvaluationSchema);