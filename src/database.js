const connectDB = require('./config/database');
const User = require('./models/User');

const db = {};

db.connectDB = connectDB;
db.User = User;

const initDB = async () => {
  try {
    await db.connectDB();
    console.log('📊 MongoDB conectado e pronto!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    process.exit(1);
  }
};

module.exports = { db, initDB };
