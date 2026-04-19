# 🎓 Alumni Portal Backend (Node.js + PostgreSQL)

## 🚀 Project Setup

### 1️⃣ Create a new Node.js project

```bash
mkdir Backend-Alumni
cd Backend-Alumni
npm init -y
```

---

### 2️⃣ Install Core Dependencies

```bash
npm install express cors dotenv helmet morgan
npm install --save-dev nodemon
```

---

### 3️⃣ Install PostgreSQL + ORM (Sequelize)

```bash
npm install sequelize pg pg-hstore
```

---

### 4️⃣ Install Authentication & Validation Packages

```bash
npm install bcrypt jsonwebtoken joi
```

---

### 5️⃣ Install Email & File Upload Packages

```bash
npm install nodemailer
npm install aws-sdk multer multer-s3
```

---

### 6️⃣ Install Async Error Handling

```bash
npm install express-async-handler
```

---

### 7️⃣ Update `package.json` Scripts

```json
"scripts": {
  "start": "node src/server.js",
  "dev": "nodemon src/server.js"
}
```

---

## 📂 Project Structure

```
Backend-Alumni/
│-- node_modules/
│-- src/
│   │-- server.js          # Entry point
│   │-- config/db.js       # Database connection
│   │-- routes/            # API routes
│   │-- controllers/       # Business logic
│   │-- migrations/        # DB migrations
│   │-- models/            # Sequelize models
│   │-- middleware/        # Authentication & validation
│   └── utils/             # Helper functions
│       ├── generateToken.js
│       ├── hashPassword.js
│       ├── HttpStatusHelper.js
│       └── logger.js
│-- .env                   # Environment variables
│-- package.json
│-- README.md
```

---

## ▶️ Run the Server

Development mode (with auto-reload):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

---

## 🛠️ Included Packages

* **express** → Web framework for APIs
* **cors** → Enable cross-origin requests
* **dotenv** → Manage environment variables
* **helmet** → Secure HTTP headers
* **morgan** → HTTP request logging
* **nodemon** → Auto-restart server in dev mode
* **sequelize** → PostgreSQL ORM
* **pg / pg-hstore** → PostgreSQL drivers
* **bcrypt** → Password hashing
* **jsonwebtoken** → JWT authentication
* **joi** → Input validation
* **nodemailer** → Sending emails
* **aws-sdk, multer, multer-s3** → File/image uploads
* **express-async-handler** → Async error handling

---

تحبي أجهزلك كمان ملف `.env.example` عشان يبقى عندك القيم الأساسية اللي هتحتاجيها للبيئة؟
