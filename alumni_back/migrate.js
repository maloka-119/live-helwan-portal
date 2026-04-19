const { Sequelize } = require("sequelize");
const { Umzug, SequelizeStorage } = require("umzug");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });


const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
});

// Umzug config
const umzug = new Umzug({
  migrations: { glob: "migrations/*.js" },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});


(async () => {
  try {
    await umzug.up();
    console.log("All migrations performed successfully ");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
