const express = require("express");
const router = express.Router();
const inhouseDb = require("../dbInhouse");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// ============================================
// LOGIN ROUTE
// ============================================
router.post("/login", async  (req, res) => {
  try {
    const { user_name, password } = req.body;
    if (!user_name || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }
    // Find user in DB - using promise-based query
    const [results] = await inhouseDb.query(
      "SELECT * FROM users WHERE user_name = ? LIMIT 1",
      [user_name]
    );
    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    const user = results[0];
    // ⚠️ TEMP: if password is stored as plain text
    const isMatch = password === user.password_hash;
    // ✅ Once you hash passwords, replace above with:
    // const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    // Generate JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        role: user.role, 
        name: user.name, 
        user_name: user.user_name, 
        email: user.email,
        position: user.position  // ✅ ADD POSITION TO JWT
      },
      process.env.JWT_SECRET || "supersecretkey",
      { expiresIn: "8h" }
    );
    res.json({
      message: "✅ Login successful",
      token,
      user: {
        id: user.id,
        user_name: user.user_name,
        name: user.name,
        department: user.department,
        position: user.position,
        role: user.role,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ============================================
// GET ALL USERS FOR CHAT
// ✅ FIXED: Now includes position field
// ============================================
router.get("/users", async (req, res) => {
  try {
    // ✅ FIXED: Added position to SELECT statement
    const [results] = await inhouseDb.query(
      'SELECT id, name, user_name, email, position, role FROM users ORDER BY position ASC, name ASC'
    );
    
    console.log(`✅ [GET /users] Fetched ${results.length} users with position field`);
    console.log(`📋 Sample user:`, results[0]); // Debug log
    
    res.json(results);
  } catch (error) {
    console.error('❌ Error in users endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;