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

    console.log("Users found:", results.length);

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const user = results[0];
    console.log("User found:", user.user_name, "hash:", user.password_hash?.substring(0, 20));

    const isMatch = await bcrypt.compare(password, user.password_hash);
    console.log("Password match:", isMatch);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        name: user.name,
        user_name: user.user_name,
        email: user.email,
        position: user.position
      },
      process.env.JWT_SECRET || "supersecretkey",
      { expiresIn: "8h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        user_name: user.user_name,
        name: user.name,
        role: user.role,
        email: user.email,
        department: user.department,
        position: user.position
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
