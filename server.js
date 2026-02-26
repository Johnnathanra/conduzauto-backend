require('dotenv').config();

const app = require('./src/app');
const { initDB } = require('./src/database');

const PORT = process.env.PORT || 5000;

console.log('📝 Conectando ao MongoDB local...');

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error('❌ Erro ao iniciar servidor:', error.message);
  process.exit(1);
});