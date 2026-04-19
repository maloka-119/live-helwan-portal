const sequelize = require('../config/database');
const { readdirSync } = require('fs');
const path = require('path');

async function resetAndMigrate() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connection established.\n');

    const queryInterface = sequelize.getQueryInterface();

    // Drop existing tables if they exist (in reverse order due to foreign keys)
    console.log('Dropping existing tables...');
    try {
      await queryInterface.dropTable('refresh_tokens', { cascade: true });
      console.log('✓ Dropped refresh_tokens table');
    } catch (error) {
      if (!error.message.includes('does not exist')) {
        throw error;
      }
      console.log('⚠ refresh_tokens table does not exist');
    }

    try {
      await queryInterface.dropTable('users', { cascade: true });
      console.log('✓ Dropped users table');
    } catch (error) {
      if (!error.message.includes('does not exist')) {
        throw error;
      }
      console.log('⚠ users table does not exist');
    }

    console.log('\nRunning migrations to create tables with new schema...\n');

    // Run migrations
    const migrationsPath = path.join(__dirname, '..', 'migrations');
    const migrationFiles = readdirSync(migrationsPath)
      .filter(file => file.endsWith('.js'))
      .sort();

    for (const file of migrationFiles) {
      console.log(`Running migration: ${file}`);
      const migration = require(path.join(migrationsPath, file));
      await migration.up(queryInterface, sequelize.constructor);
      console.log(`✓ Completed: ${file}\n`);
    }

    console.log('✅ Database reset and migration complete!');
    console.log('Tables now include: full_name, national_id, phone fields');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

resetAndMigrate();

