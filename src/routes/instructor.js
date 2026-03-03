const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Instructor = require('../models/Instructor');
const User = require('../models/User');
const Evaluation = require('../models/Evaluation');

// ✅ Função auxiliar para obter URL do frontend baseado no NODE_ENV
const getFrontendUrl = () => {
  return process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL_PROD
    : process.env.FRONTEND_URL_DEV || 'http://localhost:3000';
};

// ✅ Middleware de autenticação GERAL (aceita alunos E instrutores)
const authenticateToken = (req, res, next) => {
  console.log(`🔐 [AUTH] Middleware executado - Token: ${req.headers.authorization ? 'Presente' : 'Ausente'}`);
  
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    console.log('❌ [AUTH] Token não fornecido');
    return res.status(401).json({ message: 'Token não fornecido' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = typeof decoded.id === 'string' ? decoded.id : decoded.id.toString();
    console.log(`✅ [AUTH] Token válido, userId: ${userId}`);
    
    req.userId = userId;
    req.instructorId = userId;
    
    next();
  } catch (err) {
    console.error(`❌ [AUTH] Erro ao verificar token: ${err.message}`);
    return res.status(401).json({ message: 'Token inválido' });
  }
};

const authenticateInstructor = authenticateToken;

// ========== REGISTRO ==========
router.post('/register', async (req, res) => {
  console.log(`📝 [REGISTER] Requisição recebida`);
  try {
    const { name, email, password, confirmPassword, specialty, bio } = req.body;
    console.log(`✅ [REGISTER] Dados extraídos: ${name} | ${email}`);

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

    console.log(`🔍 [REGISTER] Procurando instructor com email: ${email}`);
    const existingInstructor = await Instructor.findOne({ email });
    if (existingInstructor) {
      console.log('❌ [REGISTER] Email já cadastrado');
      return res.status(400).json({ message: 'Email já cadastrado' });
    }

    // ========== GERAR SLUG ÚNICO ==========
    console.log(`🔧 [REGISTER] Gerando slug para: ${name}`);
    const base = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    let slug = base;
    let counter = 1;
    while (await Instructor.findOne({ slug })) {
      slug = `${base}-${counter}`;
      counter++;
    }
    console.log(`✅ [REGISTER] Slug gerado: ${slug}`);

    // ========== HASH PASSWORD ==========
    console.log('🔐 [REGISTER] Hasheando password...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log('✅ [REGISTER] Password hasheada');

    const instructor = new Instructor({
      name,
      email,
      password: hashedPassword,
      slug,
      bio: bio || '',
      studentsLinked: [],
      invitationCodes: []
    });

    await instructor.save();
    console.log(`✅ [REGISTER] Instructor salvo: ${instructor._id}`);

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
    console.error(`❌ [REGISTER] ERRO: ${error.message}`);
    res.status(500).json({ message: 'Erro ao registrar instrutor', error: error.message });
  }
});

// ========== LOGIN ==========
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

    const token = jwt.sign({ id: instructor._id.toString() }, process.env.JWT_SECRET, {
      expiresIn: '72h',
    });

    console.log(`✅ [LOGIN] Login bem-sucedido: ${instructor._id}`);

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
    console.error(`❌ [LOGIN] Erro ao fazer login: ${error.message}`);
    res.status(500).json({ message: 'Erro ao fazer login' });
  }
});

// ========== OBTER PERFIL DO INSTRUTOR ==========
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
    console.error(`❌ [PROFILE] Erro ao buscar perfil: ${error.message}`);
    res.status(500).json({ message: 'Erro ao buscar perfil' });
  }
});

// ========== PROCURAR ALUNOS ==========
router.get('/search-students', authenticateToken, async (req, res) => {
  try {
    const { search } = req.query;
    
    console.log(`🔍 [SEARCH] Instrutor: ${req.userId} | Termo: ${search || 'nenhum'}`);

    const totalUsers = await User.countDocuments();
    console.log(`📊 [SEARCH] Total de alunos no banco: ${totalUsers}`);

    let query = {};

    if (search && search.trim()) {
      query = {
        $or: [
          { name: { $regex: search.trim(), $options: 'i' } },
          { email: { $regex: search.trim(), $options: 'i' } }
        ]
      };
    }

    const students = await User.find(query)
      .select('name email level totalXP coursesCompleted hoursLearned')
      .lean();

    console.log(`✅ [SEARCH] Encontrados: ${students.length} alunos`);
    
    res.json(students);
  } catch (error) {
    console.error(`❌ [SEARCH] Erro ao pesquisar alunos: ${error.message}`);
    res.status(500).json({ message: 'Erro ao pesquisar alunos', error: error.message });
  }
});

// ========== VINCULAR ALUNO AO INSTRUTOR ==========
router.post('/link-student', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: 'studentId é obrigatório' });
    }

    console.log(`🔗 [LINK] Aluno: ${studentId} | Instrutor: ${req.userId}`);

    const student = await User.findById(studentId);
    if (!student) {
      console.log(`❌ [LINK] Aluno não encontrado: ${studentId}`);
      return res.status(404).json({ message: 'Aluno não encontrado' });
    }

    console.log(`✅ [LINK] Aluno encontrado: ${student.name}`);

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
    console.error(`❌ [LINK] Erro ao vincular aluno: ${error.message}`);
    res.status(500).json({ message: 'Erro ao vincular aluno', error: error.message });
  }
});

// ========== DESVINCULAR ALUNO ==========
router.post('/unlink-student', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: 'studentId é obrigatório' });
    }

    console.log(`🔓 [UNLINK] Desvinculando aluno: ${studentId}`);

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
    console.error(`❌ [UNLINK] Erro ao desvincular aluno: ${error.message}`);
    res.status(500).json({ message: 'Erro ao desvincular aluno', error: error.message });
  }
});

// ========== OBTER ALUNOS VINCULADOS DO INSTRUTOR ==========
router.get('/my-students', authenticateToken, async (req, res) => {
  try {
    console.log(`👥 [MY-STUDENTS] Buscando alunos do instrutor: ${req.userId}`);
    
    const instructor = await Instructor.findById(req.userId).populate(
      'studentsLinked', 
      'name email level totalXP coursesCompleted hoursLearned'
    );
    
    if (!instructor) {
      console.log('❌ [MY-STUDENTS] Instrutor não encontrado');
      return res.status(404).json({ message: 'Instrutor não encontrado' });
    }

    console.log(`✅ [MY-STUDENTS] Encontrados: ${instructor.studentsLinked.length} alunos`);
    res.json(instructor.studentsLinked);
  } catch (error) {
    console.error(`❌ [MY-STUDENTS] Erro ao buscar alunos vinculados: ${error.message}`);
    res.status(500).json({ message: 'Erro ao buscar alunos vinculados', error: error.message });
  }
});

// ========== OBTER TODOS OS ALUNOS ==========
router.get('/students', authenticateToken, async (req, res) => {
  try {
    console.log('📋 [STUDENTS] Buscando todos os alunos');
    
    const students = await User.find({})
      .select('name email level totalXP coursesCompleted hoursLearned')
      .lean();
    
    console.log(`✅ [STUDENTS] Total de alunos: ${students.length}`);
    res.json(students);
  } catch (error) {
    console.error(`❌ [STUDENTS] Erro ao buscar alunos: ${error.message}`);
    res.status(500).json({ message: 'Erro ao buscar alunos', error: error.message });
  }
});

// ========== OBTER AVALIAÇÕES DE UM ALUNO ==========
router.get('/student/:studentId/evaluations', authenticateToken, async (req, res) => {
  try {
    const evaluations = await Evaluation.find({
      studentId: req.params.studentId,
    }).sort({ evaluatedAt: -1 });
    
    res.json(evaluations);
  } catch (error) {
    console.error(`❌ [EVALUATIONS] Erro ao buscar avaliações: ${error.message}`);
    res.status(500).json({ message: 'Erro ao buscar avaliações' });
  }
});

// ========== CRIAR AVALIAÇÃO ==========
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
    console.log(`✅ [EVALUATE] Avaliação criada para aluno: ${studentId}`);
    
    res.status(201).json({ success: true, evaluation });
  } catch (error) {
    console.error(`❌ [EVALUATE] Erro ao criar avaliação: ${error.message}`);
    res.status(500).json({ message: 'Erro ao criar avaliação' });
  }
});

// ========== ATUALIZAR AVALIAÇÃO ==========
router.put('/evaluate/:evaluationId', authenticateToken, async (req, res) => {
  try {
    const { rating, concept, feedback, improvementSuggestions } = req.body;

    const evaluation = await Evaluation.findByIdAndUpdate(
      req.params.evaluationId,
      { rating, concept, feedback, improvementSuggestions, evaluatedAt: new Date() },
      { new: true }
    );

    console.log(`✅ [UPDATE] Avaliação atualizada: ${req.params.evaluationId}`);
    res.json({ success: true, evaluation });
  } catch (error) {
    console.error(`❌ [UPDATE] Erro ao atualizar avaliação: ${error.message}`);
    res.status(500).json({ message: 'Erro ao atualizar avaliação' });
  }
});

// ========== DELETAR AVALIAÇÃO ==========
router.delete('/evaluate/:evaluationId', authenticateToken, async (req, res) => {
  try {
    await Evaluation.findByIdAndDelete(req.params.evaluationId);
    console.log(`✅ [DELETE] Avaliação deletada: ${req.params.evaluationId}`);
    
    res.json({ success: true, message: 'Avaliação deletada' });
  } catch (error) {
    console.error(`❌ [DELETE] Erro ao deletar avaliação: ${error.message}`);
    res.status(500).json({ message: 'Erro ao deletar avaliação' });
  }
});

// ========== GERAR CÓDIGO DE CONVITE ==========
router.post('/generate-invitation', authenticateToken, async (req, res) => {
  try {
    console.log(`🎫 [GENERATE-INVITATION] Requisição - userId: ${req.userId}`);
    
    const instructorId = req.userId;
    
    if (!instructorId) {
      console.log('❌ [GENERATE-INVITATION] instructorId não definido');
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const code = crypto.randomBytes(16).toString('hex');
    console.log(`🎫 [GENERATE-INVITATION] Código gerado: ${code}`);

    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      console.log(`❌ [GENERATE-INVITATION] Instrutor não encontrado: ${instructorId}`);
      return res.status(404).json({ error: 'Instrutor não encontrado' });
    }

    console.log(`✅ [GENERATE-INVITATION] Instrutor encontrado: ${instructor.name}`);

    // ========== GERAR SLUG SE AUSENTE ==========
    if (!instructor.slug) {
      console.log('⚠️  [GENERATE-INVITATION] Slug ausente, gerando...');
      const base = instructor.name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      let slug = base;
      let counter = 1;
      while (await Instructor.findOne({ slug })) {
        slug = `${base}-${counter}`;
        counter++;
      }
      instructor.slug = slug;
      console.log(`✅ [GENERATE-INVITATION] Slug gerado: ${slug}`);
    }

    console.log(`✅ [GENERATE-INVITATION] Slug: ${instructor.slug}`);

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

    const frontendUrl = getFrontendUrl();
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
    console.error(`❌ [GENERATE-INVITATION] Erro: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ========== VALIDAR E OBTER DADOS DO CONVITE ==========
router.get('/invitation/:slug/:code', async (req, res) => {
  try {
    const { slug, code } = req.params;

    console.log(`🔍 [INVITATION] Validando slug: ${slug} | Código: ${code}`);

    const instructor = await Instructor.findOne({ slug });
    if (!instructor) {
      console.log(`❌ [INVITATION] Instrutor não encontrado: ${slug}`);
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

    console.log(`✅ [INVITATION] Código validado - Instrutor: ${instructor._id}`);
    
    res.json({
      success: true,
      instructorId: instructor._id,
      instructorName: instructor.name,
      instructorEmail: instructor.email
    });
  } catch (error) {
    console.error(`❌ [INVITATION] Erro ao validar código: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ========== ALUNO ACEITA O CONVITE ==========
router.post('/accept-invitation', authenticateToken, async (req, res) => {
  try {
    const { slug, code } = req.body;
    const studentId = req.userId;

    console.log(`🎯 [ACCEPT-INVITATION] Iniciado - slug: ${slug} | code: ${code} | studentId: ${studentId}`);

    // Validações
    if (!slug || !code) {
      console.error('❌ [ACCEPT-INVITATION] Slug ou code ausentes');
      return res.status(400).json({ error: 'Slug e code são obrigatórios' });
    }

    // Verifica se o token pertence a um aluno real
    const student = await User.findById(studentId);
    if (!student) {
      console.error(`❌ [ACCEPT-INVITATION] Aluno não encontrado: ${studentId}`);
      return res.status(401).json({ error: 'Aluno não autenticado corretamente' });
    }
    console.log(`✅ [ACCEPT-INVITATION] Aluno autenticado: ${student.name}`);

    // DEBUG: Listar TODOS os instrutores e seus slugs
    console.log('🔍 [ACCEPT-INVITATION] Buscando todos os instrutores...');
    const allInstructors = await Instructor.find({}, { _id: 1, name: 1, slug: 1, email: 1 });
    console.log(`📋 [ACCEPT-INVITATION] Total de instrutores: ${allInstructors.length}`);
    allInstructors.forEach(i => {
      console.log(`   - ID: ${i._id} | Slug: "${i.slug}" | Nome: ${i.name}`);
    });

    // Busca o instrutor pelo slug (EXATO)
    console.log(`🔍 [ACCEPT-INVITATION] Procurando instrutor com slug: "${slug}"`);
    const instructor = await Instructor.findOne({ slug: slug.trim() });
    
    if (!instructor) {
      console.error(`❌ [ACCEPT-INVITATION] Instrutor não encontrado: ${slug}`);
      return res.status(404).json({ 
        error: 'Instrutor não encontrado',
        searchedSlug: slug,
        availableSlugs: allInstructors.map(i => i.slug)
      });
    }

    console.log(`✅ [ACCEPT-INVITATION] Instrutor encontrado: ${instructor.name} (${instructor._id})`);

    // Busca o código de convite
    console.log('🔍 [ACCEPT-INVITATION] Procurando código de convite...');
    const invitation = instructor.invitationCodes.find(inv => inv.code === code);
    if (!invitation) {
      console.error('❌ [ACCEPT-INVITATION] Código de convite não encontrado');
      return res.status(404).json({ error: 'Convite não encontrado' });
    }

    console.log('✅ [ACCEPT-INVITATION] Convite encontrado');

    // Verifica se expirou (30 dias)
    const now = new Date();
    const expiryDate = new Date(invitation.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    console.log(`⏰ [ACCEPT-INVITATION] Expiração: ${expiryDate} | Agora: ${now}`);
    
    if (now > expiryDate) {
      console.error('❌ [ACCEPT-INVITATION] Convite expirado');
      return res.status(400).json({ error: 'Convite expirado' });
    }

    console.log('✅ [ACCEPT-INVITATION] Convite válido e não expirado');

    // Verifica se já foi usado
    if (invitation.usedBy) {
      console.warn(`⚠️  [ACCEPT-INVITATION] Convite já foi usado por: ${invitation.usedBy}`);
      return res.status(400).json({ error: 'Convite já foi utilizado' });
    }

    console.log('✅ [ACCEPT-INVITATION] Convite ainda não foi usado');

    // Verifica se aluno já está linkado
    const studentIdStr = studentId.toString();
    const isAlreadyLinked = instructor.studentsLinked.some(id => id.toString() === studentIdStr);
    if (isAlreadyLinked) {
      console.warn('⚠️  [ACCEPT-INVITATION] Aluno já estava linkado');
      return res.status(400).json({ error: 'Você já está vinculado a este instrutor' });
    }

    console.log('✅ [ACCEPT-INVITATION] Aluno não está linkado ainda');

    // Marca como usado
    invitation.usedBy = studentId;
    console.log('✅ [ACCEPT-INVITATION] Marcando convite como usado');

    // Linka o aluno ao instrutor
    instructor.studentsLinked.push(studentId);
    console.log(`✅ [ACCEPT-INVITATION] Aluno adicionado (total: ${instructor.studentsLinked.length})`);

    // ========== SALVA DADOS DO INSTRUTOR NO ALUNO ==========
    student.instructorId = instructor._id;
    student.instructorName = instructor.name;
    student.instructorEmail = instructor.email;
    await student.save();
    console.log(`✅ [ACCEPT-INVITATION] Dados do instrutor salvos no aluno: ${student.name}`);
    // =========================================================

    // Salva as mudanças
    await instructor.save();
    console.log('✅ [ACCEPT-INVITATION] Instrutor salvo com sucesso');

    res.json({ 
      success: true, 
      message: 'Convite aceito com sucesso!',
      instructorName: instructor.name,
      instructorId: instructor._id
    });
  } catch (error) {
    console.error(`❌ [ACCEPT-INVITATION] Erro: ${error.message}`);
    res.status(500).json({ error: 'Erro ao aceitar convite', details: error.message });
  }
});

// ========== LISTAR CONVITES ATIVOS DO INSTRUTOR ==========
router.get('/my-invitations', authenticateToken, async (req, res) => {
  try {
    const instructorId = req.userId;

    console.log(`📋 [MY-INVITATIONS] Buscando convites do instrutor: ${instructorId}`);

    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      console.log('❌ [MY-INVITATIONS] Instrutor não encontrado');
      return res.status(404).json({ error: 'Instrutor não encontrado' });
    }

    const activeInvitations = instructor.invitationCodes.filter(inv => !inv.usedBy);
    
    const frontendUrl = getFrontendUrl();
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
    console.error(`❌ [MY-INVITATIONS] Erro: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ========== REVOGAR UM CONVITE ESPECÍFICO ==========
router.post('/revoke-invitation/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const instructorId = req.userId;

    console.log(`🔄 [REVOKE-INVITATION] Revogando convite: ${code} | Instrutor: ${instructorId}`);

    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      console.error('❌ [REVOKE-INVITATION] Instrutor não encontrado');
      return res.status(404).json({ error: 'Instrutor não encontrado' });
    }

    const invitation = instructor.invitationCodes.find(inv => inv.code === code);
    if (!invitation) {
      console.error('❌ [REVOKE-INVITATION] Convite não encontrado');
      return res.status(404).json({ error: 'Convite não encontrado' });
    }

    instructor.invitationCodes = instructor.invitationCodes.filter(inv => inv.code !== code);
    await instructor.save();

    console.log('✅ [REVOKE-INVITATION] Convite revogado com sucesso');
    res.json({ success: true, message: 'Convite removido com sucesso' });
  } catch (error) {
    console.error(`❌ [REVOKE-INVITATION] Erro: ${error.message}`);
    res.status(500).json({ error: 'Erro ao revogar convite', details: error.message });
  }
});

// ========== LIMPAR TODOS OS CONVITES ==========
router.post('/clear-all-invitations', authenticateToken, async (req, res) => {
  try {
    const instructorId = req.userId;

    console.log(`🗑️ [CLEAR-ALL-INVITATIONS] Limpando convites do instrutor: ${instructorId}`);

    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      console.error('❌ [CLEAR-ALL-INVITATIONS] Instrutor não encontrado');
      return res.status(404).json({ error: 'Instrutor não encontrado' });
    }

    const totalBefore = instructor.invitationCodes.length;
    instructor.invitationCodes = [];
    await instructor.save();

    console.log(`✅ [CLEAR-ALL-INVITATIONS] ${totalBefore} convites removidos`);
    res.json({ success: true, message: 'Todos os convites foram removidos' });
  } catch (error) {
    console.error(`❌ [CLEAR-ALL-INVITATIONS] Erro: ${error.message}`);
    res.status(500).json({ error: 'Erro ao limpar convites', details: error.message });
  }
});

// ========== REMOVER INSTRUTOR DO ALUNO ==========
router.post('/remove-instructor', authenticateToken, async (req, res) => {
  try {
    const studentId = req.userId;

    console.log(`🔓 [REMOVE-INSTRUCTOR] Aluno: ${studentId} removendo instrutor`);

    const student = await User.findById(studentId);
    if (!student) {
      console.log('❌ [REMOVE-INSTRUCTOR] Aluno não encontrado');
      return res.status(404).json({ error: 'Aluno não encontrado' });
    }

    if (!student.instructorId) {
      console.log('❌ [REMOVE-INSTRUCTOR] Aluno não tem instrutor vinculado');
      return res.status(400).json({ error: 'Você não tem um instrutor vinculado' });
    }

    const instructorId = student.instructorId;
    console.log(`✅ [REMOVE-INSTRUCTOR] Instrutor encontrado: ${student.instructorName}`);

    // Remove aluno da lista de alunos do instrutor
    const instructor = await Instructor.findById(instructorId);
    if (instructor) {
      instructor.studentsLinked = instructor.studentsLinked.filter(
        id => id.toString() !== studentId.toString()
      );
      await instructor.save();
      console.log('✅ [REMOVE-INSTRUCTOR] Aluno removido da lista do instrutor');
    }

    // Remove instrutor do aluno
    student.instructorId = null;
    student.instructorName = null;
    student.instructorEmail = null;
    await student.save();

    console.log('✅ [REMOVE-INSTRUCTOR] Instrutor removido do aluno com sucesso');
    res.json({ 
      success: true, 
      message: 'Instrutor removido com sucesso!' 
    });
  } catch (error) {
    console.error(`❌ [REMOVE-INSTRUCTOR] Erro: ${error.message}`);
    res.status(500).json({ error: 'Erro ao remover instrutor', details: error.message });
  }
});

// ========== DELETAR CONTA DO INSTRUTOR ==========
router.delete('/delete-account', authenticateToken, async (req, res) => {
  try {
    console.log(`🗑️ [DELETE ACCOUNT] Deletando instrutor: ${req.userId}`);

    await Evaluation.deleteMany({ instructorId: req.userId });
    console.log('📋 [DELETE ACCOUNT] Avaliações deletadas');

    await Instructor.findByIdAndDelete(req.userId);
    console.log('👤 [DELETE ACCOUNT] Instrutor deletado');

    res.json({ message: 'Conta deletada com sucesso!' });
  } catch (err) {
    console.error(`❌ [DELETE ACCOUNT] Erro: ${err.message}`);
    res.status(500).json({ message: 'Erro ao deletar a conta', error: err.message });
  }
});

module.exports = router;
