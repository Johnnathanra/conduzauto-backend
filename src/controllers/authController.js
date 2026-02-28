const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Registrar novo usuário
exports.register = async (req, res) => {
  console.log('📨 Dados recebidos:', req.body);
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'As senhas não coincidem' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'Email já cadastrado' });
    }

    const user = new User({ name, email, password });
    await user.save();

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '72h',
    });

    res.status(201).json({
      message: 'Usuário registrado com sucesso!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ message: `Erro ao registrar: ${error.message}` });
  }
};

// Login de usuário
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email e senha são obrigatórios' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const passwordMatch = await user.matchPassword(password);
    if (!passwordMatch) {
      return res.status(400).json({ message: 'Senha incorreta' });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '72h',
    });

    res.status(200).json({
      message: 'Login realizado com sucesso!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        level: user.level,
        totalXP: user.totalXP,
      },
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: `Erro ao fazer login: ${error.message}` });
  }
};

// ✅ NOVA FUNÇÃO - Carregar perfil do usuário
exports.getProfile = async (req, res) => {
  try {
    console.log('👤 [getProfile] Buscando usuário ID:', req.userId);
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    console.log('✅ [getProfile] Perfil encontrado:', user.name);
    res.json(user);
  } catch (err) {
    console.error('❌ [getProfile] Erro:', err);
    res.status(500).json({ message: 'Erro ao carregar perfil', error: err.message });
  }
};

// Deletar conta do usuário
exports.deleteAccount = async (req, res) => {
  try {
    console.log('🗑️ [deleteAccount] Deletando usuário:', req.userId);
    
    const user = await User.findByIdAndDelete(req.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    console.log('✅ [deleteAccount] Usuário deletado com sucesso');
    res.status(200).json({ message: 'Conta deletada com sucesso!' });
  } catch (error) {
    console.error('❌ [deleteAccount] Erro ao deletar conta:', error);
    res.status(500).json({ message: `Erro ao deletar conta: ${error.message}` });
  }
};