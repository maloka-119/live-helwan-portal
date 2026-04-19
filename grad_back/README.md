# Graduates System - Authentication API

This system provides authentication endpoints with JWT access tokens and refresh tokens using Sequelize ORM.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the `/` directory with the following variables:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
PORT=5002
NODE_ENV=development
```

### 3. Run Migrations

```bash
npm run migrate
```

Or if you have sequelize-cli installed globally:

```bash
npx sequelize-cli db:migrate
```

### 4. Start the Server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

The server will run on port 5002 (or the port specified in your `.env` file).

## API Endpoints

### 1. Login

**POST** `/auth/login`

Request body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Success response (200):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6..."
}
```

Error response (401):

```json
{
  "message": "Invalid email or password"
}
```

### 2. Refresh Token

**POST** `/auth/refresh`

Request body:

```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

Success response (200):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Error response (401):

```json
{
  "message": "Invalid refresh token"
}
```

or

```json
{
  "message": "Refresh token has been revoked"
}
```

or

```json
{
  "message": "Refresh token has expired"
}
```

### 3. Logout

**POST** `/auth/logout`

Request body:

```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

Success response (200):

```json
{
  "message": "Logged out successfully"
}
```

## Database Schema

### Users Table

- `id` (UUID, Primary Key)
- `email` (String, Unique)
- `password_hash` (String)
- `is_active` (Boolean, default: true)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

### Refresh Tokens Table

- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key to users.id)
- `token` (String, Unique)
- `revoked` (Boolean, default: false)
- `expires_at` (DateTime)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

## Token Configuration

- **Access Token**: Expires in 15 minutes
- **Refresh Token**: Expires in 7 days

## Security Features

- Passwords are hashed using bcrypt (10 salt rounds)
- JWT tokens for secure authentication
- Refresh tokens stored in database with revocation support
- Token expiration validation
- User account active status checking
