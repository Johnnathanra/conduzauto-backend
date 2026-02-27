const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Instructor = require('../models/Instructor');
const User = require('../models/User');
const Evaluation = require('../models/Evaluation');

// Middleware de autenticação
const authenticateInstructor = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token não fornecido' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.instructorId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token inválido' });
  }
};

// REGISTRO
router.post('/register', async (req, res) => {
  console.log('📝 [REGISTER] Requisição recebida:', req.body);
  try {
    const { name, email, password, confirmPassword, specialty, bio } = req.body;
    console.log('✅ [REGISTER] Dados extraídos:', { name, email, specialty });

    if (!name || !email || !password || !confirmPassword) {
      console.log('❌ [REGISTER] Campos obrigatórios faltando');
      return res.status(400).json({ message: 'Por favor, preencha todos os campos obrigatórios' });
    }

    if (password !== confirmPassword) {
      console.log('❌ [REGISTER] Senhas não coincidem');
      return res.status(400).json({ message: 'As senhas não coincidem' });
    }

    if (password.length < 6) {
      console.log('❌ [REGISTER] Senha muito curta');
      return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
    }

    console.log('🔍 [REGISTER] Procurando instructor com email:', email);
    const existingInstructor = await Instructor.findOne({ email });
    if (existingInstructor) {
      console.log('❌ [REGISTER] Email já cadastrado');
      return res.status(400).json({ message: 'Email já cadastrado' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const instructor = new Instructor({
      name,
      email,
      password: hashedPassword,
      bio: bio || '',
    });

    await instructor.save();
    console.log('✅ [REGISTER] Instructor salvo:', instructor._id);

    const token = jwt.sign({ id: instructor._id }, process.env.JWT_SECRET, {
      expiresIn: '72h',
    });
    console.log('🔑 [REGISTER] Token gerado');

    res.status(201).json({
      success: true,
      token,
      instructor: {
        _id: instructor._id,
        name: instructor.name,
        email: instructor.email,
        bio: instructor.bio,
      },
    });
  } catch (error) {
    console.error('❌ [REGISTER] ERRO:', error.message);
    console.error('📋 Stack:', error.stack);
    res.status(500).json({ message: 'Erro ao registrar instrutor', error: error.message });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Por favor, forneça email e senha' });
    }

    const instructor = await Instructor.findOne({ email }).select('+password');
    if (!instructor) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const isMatch = await instructor.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const token = jwt.sign({ id: instructor._id }, process.env.JWT_SECRET, {
      expiresIn: '72h',
    });

    res.json({
      success: true,
      token,
      instructor: {
        _id: instructor._id,
        name: instructor.name,
        email: instructor.email,
        bio: instructor.bio,
      },
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({ message: 'Erro ao fazer login' });
  }
});

// OBTER PERFIL DO INSTRUTOR
router.get('/profile', authenticateInstructor, async (req, res) => {
  try {
    const instructor = await Instructor.findById(req.instructorId);
    res.json({
      _id: instructor._id,
      name: instructor.name,
      email: instructor.email,
      bio: instructor.bio,
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar perfil' });
  }
});

// OBTER TODOS OS ALUNOS
router.get('/students', authenticateInstructor, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('name email level totalXP');
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar alunos' });
  }
});

// OBTER AVALIAÇÕES DE UM ALUNO
router.get('/student/:studentId/evaluations', authenticateInstructor, async (req, res) => {
  try {
    const evaluations = await Evaluation.find({
      studentId: req.params.studentId,
      instructorId: req.instructorId,
    }).sort({ evaluatedAt: -1 });
    res.json(evaluations);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar avaliações' });
  }
});

// CRIAR AVALIAÇÃO
router.post('/evaluate', authenticateInstructor, async (req, res) => {
  try {
    const { studentId, courseLesson, rating, concept, feedback, improvementSuggestions } = req.body;

    if (!studentId || !courseLesson || !rating || !concept) {
      return res.status(400).json({ message: 'Dados incompletos' });
    }

    const evaluation = new Evaluation({
      studentId,
      instructorId: req.instructorId,
      courseLesson,
      rating,
      concept,
      feedback,
      improvementSuggestions,
      evaluatedAt: new Date(),
    });

    await evaluation.save();
    res.status(201).json({ success: true, evaluation });
  } catch (error) {
    console.error('Erro ao criar avaliação:', error);
    res.status(500).json({ message: 'Erro ao criar avaliação' });
  }
});

// ATUALIZAR AVALIAÇÃO
router.put('/evaluate/:evaluationId', authenticateInstructor, async (req, res) => {
  try {
    const { rating, concept, feedback, improvementSuggestions } = req.body;

    const evaluation = await Evaluation.findByIdAndUpdate(
      req.params.evaluationId,
      { rating, concept, feedback, improvementSuggestions },
      { new: true }
    );

    res.json({ success: true, evaluation });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar avaliação' });
  }
});

// DELETAR AVALIAÇÃO
router.delete('/evaluate/:evaluationId', authenticateInstructor, async (req, res) => {
  try {
    await Evaluation.findByIdAndDelete(req.params.evaluationId);
    res.json({ success: true, message: 'Avaliação deletada' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao deletar avaliação' });
  }
});

// DELETAR CONTA DO INSTRUTOR
router.delete('/delete-account', authenticateInstructor, async (req, res) => {
  try {
    console.log('🗑️ [DELETE ACCOUNT] Deletando instrutor:', req.instructorId);

    // Deletar todas as avaliações do instrutor
    await Evaluation.deleteMany({ instructorId: req.instructorId });
    console.log('📋 [DELETE ACCOUNT] Avaliações deletadas');

    // Deletar instrutor
    await Instructor.findByIdAndDelete(req.instructorId);
    console.log('👤 [DELETE ACCOUNT] Instrutor deletado');

    res.json({ message: 'Conta deletada com sucesso!' });
  } catch (err) {
    console.error('❌ [DELETE ACCOUNT] Erro:', err);
    res.status(500).json({ message: 'Erro ao deletar a conta', error: err.message });
  }
});

module.exports = router;