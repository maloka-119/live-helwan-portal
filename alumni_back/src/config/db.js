const { Sequelize } = require("sequelize");
require("dotenv").config();

const db1 = process.env.DATABASE_URL1;

if (!db1) {
  throw new Error("DATABASE_URL1 is required");
}

function parseDbUrl(dbUrl) {
  const u = new URL(dbUrl);
  return {
    host: u.hostname,
    port: u.port,
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace("/", ""),
  };
}

const config = parseDbUrl(db1);

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
