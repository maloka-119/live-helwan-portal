const { Sequelize } = require("sequelize");
require("dotenv").config();

// من غير throw error - استخدم fallback مباشرة
const dbUrl =
  process.env.DATABASE_URL_2 ||
  process.env.DATABASE_URL1 ||
  process.env.DATABASE_URL ||
  "postgres://postgres:1234@localhost:5432/alumni_db2";

// لو عايز تعرف القيمة المستخدمة (للـ debugging)
console.log("🔌 Using database URL:", dbUrl ? "✅ Found" : "❌ Not found");

function parseDbUrl(dbUrl) {
  try {
    const u = new URL(dbUrl);
    return {
      host: u.hostname,
      port: u.port || 5432,
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace("/", ""),
    };
  } catch (error) {
    console.error("❌ Error parsing database URL:", error.message);
    // استخدم config افتراضي في حالة الخطأ
    return {
      host: "localhost",
      port: 5432,
      username: "postgres",
      password: "1234",
      database: "alumni_db2",
    };
  }
}

const config = parseDbUrl(dbUrl);

const sequelize = new Sequelize({
  dialect: "postgres",
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password,
  database: config.database,
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  dialectOptions: {
    ssl:
      process.env.NODE_ENV === "production"
        ? { require: true, rejectUnauthorized: false }
        : false,
  },
});

module.exports = sequelize;
