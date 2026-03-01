const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Instructor = require('../models/Instructor');
const User = require('../models/User');
const Evaluation = require('../models/Evaluation');

// Middleware de autenticação
const authenticateInstructor = (req, res, next) => {
  console.log('🔐 [AUTH] Middleware executado');
  console.log('🔐 [AUTH] Headers:', req.headers.authorization ? 'Presente' : 'Ausente');
  
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    console.log('❌ [AUTH] Token não fornecido');
    return res.status(401).json({ message: 'Token não fornecido' });
  }
  
  console.log('🔐 [AUTH] Token encontrado, verificando...');
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // 🔴 CORRIGIDO: Sempre converter para string
    const userId = typeof decoded.id === 'string' ? decoded.id : decoded.id.toString();
    console.log('✅ [AUTH] Token válido, userId:', userId);
    
    req.userId = userId;
    req.instructorId = userId;
    
    console.log('✅ [AUTH] Chamando next()');
    next();
  } catch (err) {
    console.error('❌ [AUTH] Erro ao verificar token:', err.message);
    return res.status(401).json({ message: 'Token inválido' });
  }
};

const authenticateToken = authenticateInstructor;

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
      studentsLinked: [],
      invitationCodes: []
    });

    await instructor.save();
    console.log('✅ [REGISTER] Instructor salvo:', instructor._id);
    console.log('✅ [REGISTER] Slug gerado:', instructor.slug);

    // 🔴 CORRIGIDO: Converter ObjectId para string no token
    const token = jwt.sign({ id: instructor._id.toString() }, process.env.JWT_SECRET, {
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
        slug: instructor.slug,
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
  console.log('🔐 [LOGIN] Tentativa de login');
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

    // 🔴 CORRIGIDO: Converter ObjectId para string no token
    const token = jwt.sign({ id: instructor._id.toString() }, process.env.JWT_SECRET, {
      expiresIn: '72h',
    });

    console.log('✅ [LOGIN] Login bem-sucedido:', instructor._id);

    res.json({
      success: true,
      token,
      instructor: {
        _id: instructor._id,
        name: instructor.name,
        email: instructor.email,
        bio: instructor.bio,
        slug: instructor.slug,
      },
    });
  } catch (error) {
    console.error('❌ [LOGIN] Erro ao fazer login:', error);
    res.status(500).json({ message: 'Erro ao fazer login' });
  }
});

// OBTER PERFIL DO INSTRUTOR
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const instructor = await Instructor.findById(req.userId);
    if (!instructor) {
      return res.status(404).json({ message: 'Instrutor não encontrado' });
    }
    res.json({
      _id: instructor._id,
      name: instructor.name,
      email: instructor.email,
      bio: instructor.bio,
      slug: instructor.slug,
    });
  } catch (error) {
    console.error('❌ [PROFILE] Erro ao buscar perfil:', error);
    res.status(500).json({ message: 'Erro ao buscar perfil' });
  }
});

// ✅ PROCURAR ALUNOS
router.get('/search-students', authenticateToken, async (req, res) => {
  try {
    const { search } = req.query;
    
    console.log('🔍 [SEARCH] Instrutor:', req.userId);
    console.log('🔍 [SEARCH] Termo de busca:', search);

    const totalUsers = await User.countDocuments();
    console.log('📊 [SEARCH] Total de alunos no banco:', totalUsers);

    let query = {};

    if (search && search.trim()) {
      query = {
        $or: [
          { name: { $regex: search.trim(), $options: 'i' } },
          { email: { $regex: search.trim(), $options: 'i' } }
        ]
      };
      console.log('🔍 [SEARCH] Query:', JSON.stringify(query));
    } else {
      console.log('🔍 [SEARCH] Sem termo de busca, retornando todos');
    }

    const students = await User.find(query)
      .select('name email level totalXP coursesCompleted hoursLearned')
      .lean();

    console.log('✅ [SEARCH] Encontrados:', students.length, 'alunos');
    
    if (students.length > 0) {
      console.log('✅ [SEARCH] Primeiros 3:', students.slice(0, 3));
    }

    res.json(students);
  } catch (error) {
    console.error('❌ [SEARCH] Erro ao pesquisar alunos:', error);
    res.status(500).json({ message: 'Erro ao pesquisar alunos', error: error.message });
  }
});

// ✅ VINCULAR ALUNO AO INSTRUTOR
router.post('/link-student', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: 'studentId é obrigatório' });
    }

    console.log('🔗 [LINK] Vinculando aluno:', studentId);
    console.log('🔗 [LINK] Ao instrutor:', req.userId);

    const student = await User.findById(studentId);
    if (!student) {
      console.log('❌ [LINK] Aluno não encontrado com ID:', studentId);
      return res.status(404).json({ message: 'Aluno não encontrado' });
    }

    console.log('✅ [LINK] Aluno encontrado:', student.name);

    const instructor = await Instructor.findById(req.userId);
    if (!instructor) {
      console.log('❌ [LINK] Instrutor não encontrado');
      return res.status(404).json({ message: 'Instrutor não encontrado' });
    }

    const studentIdStr = studentId.toString();
    const isAlreadyLinked = instructor.studentsLinked.some(id => id.toString() === studentIdStr);

    if (isAlreadyLinked) {
      console.log('❌ [LINK] Aluno já está vinculado');
      return res.status(400).json({ message: 'Aluno já está vinculado' });
    }

    instructor.studentsLinked.push(studentId);
    await instructor.save();

    console.log('✅ [LINK] Aluno vinculado com sucesso');
    res.json({ 
      success: true, 
      message: 'Aluno vinculado com sucesso', 
      student: {
        _id: student._id,
        name: student.name,
        email: student.email
      }
    });
  } catch (error) {
    console.error('❌ [LINK] Erro ao vincular aluno:', error);
    res.status(500).json({ message: 'Erro ao vincular aluno', error: error.message });
  }
});

// ✅ DESVINCULAR ALUNO
router.post('/unlink-student', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: 'studentId é obrigatório' });
    }

    console.log('🔓 [UNLINK] Desvinculando aluno:', studentId);

    const instructor = await Instructor.findById(req.userId);
    if (!instructor) {
      return res.status(404).json({ message: 'Instrutor não encontrado' });
    }

    const studentIdStr = studentId.toString();
    instructor.studentsLinked = instructor.studentsLinked.filter(id => id.toString() !== studentIdStr);
    await instructor.save();

    console.log('✅ [UNLINK] Aluno desvinculado com sucesso');
    res.json({ success: true, message: 'Aluno desvinculado com sucesso' });
  } catch (error) {
    console.error('❌ [UNLINK] Erro ao desvincular aluno:', error);
    res.status(500).json({ message: 'Erro ao desvincular aluno', error: error.message });
  }
});

// ✅ OBTER ALUNOS VINCULADOS DO INSTRUTOR
router.get('/my-students', authenticateToken, async (req, res) => {
  try {
    console.log('👥 [MY-STUDENTS] Buscando alunos do instrutor:', req.userId);
    
    const instructor = await Instructor.findById(req.userId).populate(
      'studentsLinked', 
      'name email level totalXP coursesCompleted hoursLearned'
    );
    
    if (!instructor) {
      console.log('❌ [MY-STUDENTS] Instrutor não encontrado');
      return res.status(404).json({ message: 'Instrutor não encontrado' });
    }

    console.log('✅ [MY-STUDENTS] Encontrados:', instructor.studentsLinked.length, 'alunos');
    res.json(instructor.studentsLinked);
  } catch (error) {
    console.error('❌ [MY-STUDENTS] Erro ao buscar alunos vinculados:', error);
    res.status(500).json({ message: 'Erro ao buscar alunos vinculados', error: error.message });
  }
});

// OBTER TODOS OS ALUNOS
router.get('/students', authenticateToken, async (req, res) => {
  try {
    console.log('📋 [STUDENTS] Buscando todos os alunos');
    
    const students = await User.find({})
      .select('name email level totalXP coursesCompleted hoursLearned')
      .lean();
    
    console.log('✅ [STUDENTS] Total de alunos:', students.length);
    res.json(students);
  } catch (error) {
    console.error('❌ [STUDENTS] Erro ao buscar alunos:', error);
    res.status(500).json({ message: 'Erro ao buscar alunos', error: error.message });
  }
});

// OBTER AVALIAÇÕES DE UM ALUNO
router.get('/student/:studentId/evaluations', authenticateToken, async (req, res) => {
  try {
    const evaluations = await Evaluation.find({
      studentId: req.params.studentId,
    }).sort({ evaluatedAt: -1 });
    
    res.json(evaluations);
  } catch (error) {
    console.error('❌ [EVALUATIONS] Erro ao buscar avaliações:', error);
    res.status(500).json({ message: 'Erro ao buscar avaliações' });
  }
});

// CRIAR AVALIAÇÃO
router.post('/evaluate', authenticateToken, async (req, res) => {
  try {
    const { studentId, courseLesson, rating, concept, feedback, improvementSuggestions } = req.body;

    if (!studentId || !courseLesson || !rating || !concept) {
      return res.status(400).json({ message: 'Dados incompletos' });
    }

    const evaluation = new Evaluation({
      studentId,
      instructorId: req.userId,
      courseLesson,
      rating,
      concept,
      feedback,
      improvementSuggestions,
      evaluatedAt: new Date(),
    });

    await evaluation.save();
    console.log('✅ [EVALUATE] Avaliação criada para aluno:', studentId);
    
    res.status(201).json({ success: true, evaluation });
  } catch (error) {
    console.error('❌ [EVALUATE] Erro ao criar avaliação:', error);
    res.status(500).json({ message: 'Erro ao criar avaliação' });
  }
});

// ATUALIZAR AVALIAÇÃO
router.put('/evaluate/:evaluationId', authenticateToken, async (req, res) => {
  try {
    const { rating, concept, feedback, improvementSuggestions } = req.body;

    const evaluation = await Evaluation.findByIdAndUpdate(
      req.params.evaluationId,
      { rating, concept, feedback, improvementSuggestions, evaluatedAt: new Date() },
      { new: true }
    );

    console.log('✅ [UPDATE] Avaliação atualizada:', req.params.evaluationId);
    res.json({ success: true, evaluation });
  } catch (error) {
    console.error('❌ [UPDATE] Erro ao atualizar avaliação:', error);
    res.status(500).json({ message: 'Erro ao atualizar avaliação' });
  }
});

// DELETAR AVALIAÇÃO
router.delete('/evaluate/:evaluationId', authenticateToken, async (req, res) => {
  try {
    await Evaluation.findByIdAndDelete(req.params.evaluationId);
    console.log('✅ [DELETE] Avaliação deletada:', req.params.evaluationId);
    
    res.json({ success: true, message: 'Avaliação deletada' });
  } catch (error) {
    console.error('❌ [DELETE] Erro ao deletar avaliação:', error);
    res.status(500).json({ message: 'Erro ao deletar avaliação' });
  }
});

// ✅✅✅ ROTAS DE CONVITE ✅✅✅

// ✅ GERAR CÓDIGO DE CONVITE
router.post('/generate-invitation', authenticateToken, async (req, res) => {
  try {
    console.log('🎫 [GENERATE-INVITATION] Requisição recebida');
    console.log('🎫 [GENERATE-INVITATION] req.userId:', req.userId);
    
    const instructorId = req.userId;
    
    if (!instructorId) {
      console.log('❌ [GENERATE-INVITATION] instructorId não definido');
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const code = crypto.randomBytes(16).toString('hex');
    console.log('🎫 [GENERATE-INVITATION] Código gerado:', code);

    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      console.log('❌ [GENERATE-INVITATION] Instrutor não encontrado com ID:', instructorId);
      return res.status(404).json({ error: 'Instrutor não encontrado' });
    }

    console.log('✅ [GENERATE-INVITATION] Instrutor encontrado:', instructor.name);
    console.log('✅ [GENERATE-INVITATION] Slug:', instructor.slug);

    if (!instructor.invitationCodes) {
      instructor.invitationCodes = [];
    }

    instructor.invitationCodes.push({
      code,
      createdAt: new Date(),
      usedBy: null
    });
    
    await instructor.save();
    console.log('✅ [GENERATE-INVITATION] Instrutor salvo com sucesso');

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const invitationLink = `${frontendUrl}/join-instructor/${instructor.slug}/${code}`;

    console.log(`✅ [GENERATE-INVITATION] Resposta enviada`);
    console.log(`🔗 Link: ${invitationLink}`);

    res.json({ 
      success: true, 
      code,
      invitationLink,
      createdAt: new Date()
    });
  } catch (error) {
    console.error('❌ [GENERATE-INVITATION] Erro ao gerar código:', error);
    console.error('❌ [GENERATE-INVITATION] Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// ✅ VALIDAR E OBTER DADOS DO CONVITE
router.get('/invitation/:slug/:code', async (req, res) => {
  try {
    const { slug, code } = req.params;

    console.log('🔍 [INVITATION] Validando slug:', slug, 'código:', code);

    const instructor = await Instructor.findOne({ slug });
    if (!instructor) {
      console.log('❌ [INVITATION] Instrutor não encontrado com slug:', slug);
      return res.status(404).json({ error: 'Instrutor não encontrado' });
    }

    const invitation = instructor.invitationCodes.find(inv => inv.code === code);
    
    if (!invitation) {
      console.log('❌ [INVITATION] Código inválido para este instrutor');
      return res.status(404).json({ error: 'Código de convite inválido' });
    }
    
    if (invitation.usedBy) {
      console.log('❌ [INVITATION] Código já foi utilizado');
      return res.status(400).json({ error: 'Este código já foi utilizado' });
    }

    console.log(`✅ [INVITATION] Código validado para instrutor ${instructor._id}`);
    
    res.json({
      success: true,
      instructorId: instructor._id,
      instructorName: instructor.name,
      instructorEmail: instructor.email
    });
  } catch (error) {
    console.error('❌ [INVITATION] Erro ao validar código:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ✅ ALUNO ACEITA O CONVITE
router.post('/accept-invitation', authenticateToken, async (req, res) => {
  try {
    const { slug, code } = req.body;
    const studentId = req.userId;

    if (!slug || !code) {
      return res.status(400).json({ error: 'Slug e código são obrigatórios' });
    }

    console.log('🎯 [ACCEPT-INVITATION] Aluno:', studentId, 'slug:', slug, 'código:', code);

    const instructor = await Instructor.findOne({ slug });
    if (!instructor) {
      console.log('❌ [ACCEPT-INVITATION] Instrutor não encontrado');
      return res.status(404).json({ error: 'Instrutor não encontrado' });
    }

    const invitation = instructor.invitationCodes.find(inv => inv.code === code);
    
    if (!invitation) {
      console.log('❌ [ACCEPT-INVITATION] Código inválido');
      return res.status(404).json({ error: 'Código de convite inválido' });
    }
    
    if (invitation.usedBy) {
      console.log('❌ [ACCEPT-INVITATION] Código já foi utilizado');
      return res.status(400).json({ error: 'Este código já foi utilizado' });
    }

    const isAlreadyLinked = instructor.studentsLinked.some(id => id.toString() === studentId.toString());
    if (isAlreadyLinked) {
      console.log('❌ [ACCEPT-INVITATION] Aluno já está vinculado');
      return res.status(400).json({ error: 'Você já está vinculado a este instrutor' });
    }

    instructor.studentsLinked.push(studentId);
    invitation.usedBy = studentId;
    await instructor.save();

    console.log(`✅ [ACCEPT-INVITATION] Aluno ${studentId} aceita convite`);
    
    res.json({ 
      success: true, 
      message: 'Convite aceito com sucesso!',
      instructorName: instructor.name
    });
  } catch (error) {
    console.error('❌ [ACCEPT-INVITATION] Erro ao aceitar convite:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ✅ LISTAR CONVITES ATIVOS DO INSTRUTOR
router.get('/my-invitations', authenticateToken, async (req, res) => {
  try {
    const instructorId = req.userId;

    console.log('📋 [MY-INVITATIONS] Buscando convites do instrutor:', instructorId);

    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      console.log('❌ [MY-INVITATIONS] Instrutor não encontrado');
      return res.status(404).json({ error: 'Instrutor não encontrado' });
    }

    const activeInvitations = instructor.invitationCodes.filter(inv => !inv.usedBy);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const invitationsWithLinks = activeInvitations.map(inv => ({
      code: inv.code,
      createdAt: inv.createdAt,
      usedBy: inv.usedBy,
      invitationLink: `${frontendUrl}/join-instructor/${instructor.slug}/${inv.code}`
    }));

    console.log(`✅ [MY-INVITATIONS] Encontrados ${invitationsWithLinks.length} convites ativos`);
    
    res.json({ 
      success: true, 
      invitations: invitationsWithLinks 
    });
  } catch (error) {
    console.error('❌ [MY-INVITATIONS] Erro ao listar convites:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETAR CONTA DO INSTRUTOR
router.delete('/delete-account', authenticateToken, async (req, res) => {
  try {
    console.log('🗑️ [DELETE ACCOUNT] Deletando instrutor:', req.userId);

    await Evaluation.deleteMany({ instructorId: req.userId });
    console.log('📋 [DELETE ACCOUNT] Avaliações deletadas');

    await Instructor.findByIdAndDelete(req.userId);
    console.log('👤 [DELETE ACCOUNT] Instrutor deletado');

    res.json({ message: 'Conta deletada com sucesso!' });
  } catch (err) {
    console.error('❌ [DELETE ACCOUNT] Erro:', err);
    res.status(500).json({ message: 'Erro ao deletar a conta', error: err.message });
  }
});

module.exports = router;