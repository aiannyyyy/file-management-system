const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

router.post("/login", async (req, res) => {
  try {
    const { user_name, password } = req.body;
    console.log("Login attempt:", user_name, "password length:", password?.length);

    if (!user_name || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }

    const { rows: results } = await db.query(
      "SELECT * FROM users WHERE user_name = $1 LIMIT 1",
      [user_name]
    );

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, user_name: user.user_name, email: user.email, position: user.position },
      process.env.JWT_SECRET || "supersecretkey",
      { expiresIn: "8h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, user_name: user.user_name, name: user.name, role: user.role, email: user.email, department: user.department, position: user.position }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { user_name, name, email, password, department, position, role } = req.body;

    if (!user_name || !name || !email || !password || !department || !position) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if username already exists
    const { rows: existingUser } = await db.query(
      "SELECT id FROM users WHERE user_name = $1",
      [user_name]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Username already taken" });
    }

    // Check if email already exists
    const { rows: existingEmail } = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (existingEmail.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert user
    const { rows: result } = await db.query(
      `INSERT INTO users (user_name, name, email, password_hash, department, position, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id`,
      [user_name, name, email, password_hash, department, position, role || "Regular User"]
    );

    const newUser = result[0];

    const token = jwt.sign(
      { id: newUser.id, role: role || "Regular User", name, user_name, email, position },
      process.env.JWT_SECRET || "supersecretkey",
      { expiresIn: "8h" }
    );

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: { id: newUser.id, user_name, name, email, department, position, role: role || "Regular User" }
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

module.exports = router;
