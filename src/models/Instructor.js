const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const invitationCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 2592000
  },
  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
});

const instructorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  bio: {
    type: String,
    default: ''
  },
  studentsLinked: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  invitationCodes: [invitationCodeSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Função para gerar slug
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}

// 🔴 CORRIGIDO: Pre-save para gerar slug (sem async desnecessário)
instructorSchema.pre('save', function(next) {
  console.log('🔧 [InstructorSchema] Pre-save hook acionado');
  
  if (!this.slug && this.name) {
    let slug = generateSlug(this.name);
    let baseSlug = slug;
    let counter = 1;
    
    // 🔴 CORRIGIDO: Usar método correto do Mongoose
    this.constructor.findOne({ slug }).exec()
      .then(doc => {
        if (doc && doc._id.toString() !== this._id.toString()) {
          slug = `${baseSlug}-${counter}`;
          console.log('✅ [InstructorSchema] Slug duplicado, adicionado contador:', slug);
        } else {
          console.log('✅ [InstructorSchema] Slug gerado:', slug);
        }
        this.slug = slug;
        next();
      })
      .catch(err => {
        console.error('❌ [InstructorSchema] Erro ao gerar slug:', err.message);
        next(err);
      });
  } else {
    if (this.slug) {
      console.log('✅ [InstructorSchema] Slug já existe:', this.slug);
    }
    next();
  }
});

// 🔴 CORRIGIDO: Hash da senha antes de salvar
instructorSchema.pre('save', async function(next) {
  // Se a senha não foi modificada, pula
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    console.log('✅ [InstructorSchema] Senha criptografada');
    next();
  } catch (error) {
    console.error('❌ [InstructorSchema] Erro ao criptografar senha:', error.message);
    next(error);
  }
});

// Método para comparar senhas
instructorSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Instructor', instructorSchema);
