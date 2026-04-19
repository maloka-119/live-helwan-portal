const express = require("express");
const cors = require("cors");
require("dotenv").config();

const sequelize = require("./config/database");
const authRoutes = require("./routes/authRoutes");
const graduateRoutes = require("./routes/graduateRoutes");

const app = express();

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000", // localhost
      "http://10.100.104.148:3000", // server private ip
      "http://172.1.50.88:3000", // server private ip
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Routes registration - يجب أن تكون قبل أي حاجة تانية
console.log("✅ Registering routes...");

// Health check endpoint (before 404)
app.get("/health", (req, res) => {
  console.log("🏥 Health check called");
  res.json({ status: "ok", message: "Graduates system is running" });
});

// Routes
console.log("📌 Mounting /auth routes");
app.use("/auth", authRoutes);

console.log("📌 Mounting /api routes");
app.use("/api", graduateRoutes);

// ✅ Log all requests (بعد الـ routes عشان نشوف إيه اللي بيوصل)
app.use((req, res, next) => {
  console.log(`\n🌐 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 404 handler (must be LAST)
app.use((req, res) => {
  console.log(`❌ 404 - ${req.method} ${req.url} not found`);
  res.status(404).json({ message: "Route not found" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  console.error(`🔥 Error: ${err.message}`);
  res.status(statusCode).json({
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Database connection test
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connection established successfully.");
  } catch (error) {
    console.error("❌ Unable to connect to the database:", error);
  }
}

// Initialize database connection
testConnection();

module.exports = app;
