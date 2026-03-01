const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Invite = require('../models/Invite');
const Instructor = require('../models/Instructor');

// ✅ Middleware de autenticação CORRETO
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('🔑 [Auth] Authorization header:', authHeader?.substring(0, 50) + '...');
    
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      console.log('❌ [Auth] Token não fornecido');
      return res.status(401).json({ message: 'Token não fornecido' });
    }
    
    console.log('🔐 [Auth] Token extraído, verificando...');
    
    // Decodificar JWT
    const jwtSecret = process.env.JWT_SECRET || 'sua-chave-secreta';
    console.log('🔐 [Auth] JWT_SECRET:', jwtSecret === 'sua-chave-secreta' ? '[padrão]' : '[variável de ambiente]');
    
    const decoded = jwt.verify(token, jwtSecret);
    
    if (!decoded.id) {
      console.log('❌ [Auth] Token não contém id');
      return res.status(401).json({ message: 'Token inválido: sem id' });
    }
    
    req.user = { id: decoded.id };
    
    console.log(`✅ [Auth] Usuário autenticado com sucesso. ID: ${req.user.id}`);
    next();
  } catch (error) {
    console.error('❌ [Auth] Erro ao validar token:', error.message);
    return res.status(401).json({ message: 'Token inválido ou expirado' });
  }
};

// ✅ VALIDAR convite (público - sem autenticação)
router.get('/validate/:slug/:code', async (req, res) => {
  try {
    const { slug, code } = req.params;
    
    console.log(`🔍 [Invites] Validando: slug=${slug}, code=${code}`);
    
    if (!slug || !code) {
      console.log('❌ [Invites] slug ou code ausente');
      return res.status(400).json({ message: 'slug e code são obrigatórios' });
    }
    
    const invite = await Invite.findOne({ slug, code }).populate('instructorId', 'name email');
    
    if (!invite) {
      console.log(`❌ [Invites] Convite não encontrado: ${slug}/${code}`);
      return res.status(404).json({ message: 'Convite não encontrado' });
    }
    
    if (!invite.isActive) {
      console.log('❌ [Invites] Convite desativado');
      return res.status(403).json({ message: 'Convite desativado' });
    }
    
    if (new Date(invite.expiresAt) < new Date()) {
      console.log('❌ [Invites] Convite expirado');
      return res.status(403).json({ message: 'Convite expirado' });
    }
    
    if (invite.maxUses && invite.usageCount >= invite.maxUses) {
      console.log('❌ [Invites] Limite de usos atingido');
      return res.status(403).json({ message: 'Convite atingiu o limite de usos' });
    }
    
    console.log('✅ [Invites] Convite válido:', invite.instructorName);
    
    res.json({
      valid: true,
      instructorId: invite.instructorId._id,
      instructorName: invite.instructorName,
      instructorEmail: invite.instructorEmail,
      expiresAt: invite.expiresAt,
      usagesRemaining: invite.maxUses ? invite.maxUses - invite.usageCount : null
    });
  } catch (error) {
    console.error('❌ [Invites] Erro ao validar convite:', error.message);
    res.status(500).json({ message: 'Erro ao validar convite' });
  }
});

// ✅ GERAR novo convite (apenas instrutor autenticado)
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('📝 [Invites] POST /generate INICIADO');
    console.log('========================================');
    
    const instructorId = req.user?.id;
    console.log('👤 [Invites] instructorId do token:', instructorId);
    
    if (!instructorId) {
      console.log('❌ [Invites] instructorId vazio ou undefined');
      return res.status(400).json({ message: 'instructorId não definido' });
    }
    
    console.log('🔍 [Invites] Buscando instrutor no MongoDB com ID:', instructorId);
    const instructor = await Instructor.findById(instructorId);
    
    if (!instructor) {
      console.log('❌ [Invites] Instrutor não encontrado no MongoDB');
      return res.status(404).json({ message: 'Instrutor não encontrado' });
    }
    
    console.log('✅ [Invites] Instrutor encontrado:', instructor.name);
    
    const shortId = instructorId.toString().slice(-6);
    let slug = `${instructor.name.toLowerCase().replace(/\s+/g, '-')}-${shortId}`;
    
    console.log('📝 [Invites] Slug base gerado:', slug);
    
    let counter = 1;
    let baseSlug = slug;
    let existingSlug = await Invite.findOne({ slug });
    
    while (existingSlug) {
      slug = `${baseSlug}-${counter}`;
      existingSlug = await Invite.findOne({ slug });
      counter++;
    }
    
    console.log('✅ [Invites] Slug único verificado:', slug);
    
    const code = crypto.randomBytes(16).toString('hex');
    console.log('✅ [Invites] Code gerado:', code);
    
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    // ✅ USAR .create() em vez de new + .save()
    console.log('💾 [Invites] Criando convite no MongoDB...');
    const inviteData = {
      instructorId,
      instructorName: instructor.name,
      instructorEmail: instructor.email,
      slug,
      code,
      isActive: true,
      expiresAt,
      usageCount: 0,
      maxUses: null
    };
    
    const createdInvite = await Invite.create(inviteData);
    console.log('✅ [Invites] Convite criado com sucesso!');
    console.log('   Documento salvo:', createdInvite._id);
    
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/join-instructor/${slug}/${code}`;
    
    console.log('✅ [Invites] Convite gerado com sucesso:');
    console.log('   Link:', inviteLink);
    console.log('   Slug:', slug);
    console.log('   Code:', code);
    console.log('========================================\n');
    
    res.json({
      success: true,
      inviteLink,
      slug,
      code,
      expiresAt
    });
  } catch (error) {
    console.error('❌ [Invites] Erro ao gerar convite:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({ message: error.message || 'Erro ao gerar convite' });
  }
});

// ✅ LISTAR convites do instrutor
router.get('/my-invites', authMiddleware, async (req, res) => {
  try {
    const instructorId = req.user.id;
    
    console.log(`📋 [Invites] Listando convites do instrutor: ${instructorId}`);
    
    const invites = await Invite.find({ instructorId });
    
    console.log(`✅ [Invites] ${invites.length} convite(s) encontrado(s)`);
    
    const formattedInvites = invites.map(inv => ({
      slug: inv.slug,
      code: inv.code,
      link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/join-instructor/${inv.slug}/${inv.code}`,
      isActive: inv.isActive,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      usageCount: inv.usageCount,
      maxUses: inv.maxUses,
      usagesRemaining: inv.maxUses ? inv.maxUses - inv.usageCount : null
    }));
    
    res.json({
      success: true,
      invites: formattedInvites
    });
  } catch (error) {
    console.error('❌ [Invites] Erro ao listar convites:', error.message);
    res.status(500).json({ message: 'Erro ao listar convites' });
  }
});

// ✅ REVOGAR convite
router.post('/revoke/:code', authMiddleware, async (req, res) => {
  try {
    const { code } = req.params;
    const instructorId = req.user.id;
    
    console.log(`🔴 [Invites] Revogando convite: ${code}`);
    
    const invite = await Invite.findOne({ code, instructorId });
    
    if (!invite) {
      console.log('❌ [Invites] Convite não encontrado ou não pertence ao instrutor');
      return res.status(404).json({ message: 'Convite não encontrado' });
    }
    
    invite.isActive = false;
    await invite.save();
    
    console.log('✅ [Invites] Convite revogado com sucesso:', code);
    
    res.json({ 
      success: true, 
      message: 'Convite revogado com sucesso' 
    });
  } catch (error) {
    console.error('❌ [Invites] Erro ao revogar convite:', error.message);
    res.status(500).json({ message: 'Erro ao revogar convite' });
  }
});

module.exports = router;

