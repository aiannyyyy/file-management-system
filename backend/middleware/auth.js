//middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware
 * Checks if user has a valid JWT token
 */
const authenticateUser = (req, res, next) => {
  try {
    console.log('🔐 Authenticating user...');

    const authHeader = req.header('Authorization');
    if (!authHeader) {
      console.log('❌ No Authorization header found');
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      console.log('❌ No token in Authorization header');
      return res.status(401).json({ error: 'Access denied. Invalid token format.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');

    // ✅ FIX: support both decoded.id and decoded.user_id (whichever your login route uses)
    const userId = decoded.id ?? decoded.user_id;
    console.log('✅ User authenticated:', userId);

    req.user = {
      id: userId,           // ✅ always populated now
      name: decoded.name,
      user_name: decoded.user_name,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    console.error('❌ Authentication error:', error.message);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Admin-only Middleware
 * ✅ FIX: DB stores role as lowercase 'admin', not 'Admin'
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role?.toLowerCase() === 'admin') {  // ✅ case-insensitive check
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
};

/**
 * Super User or Admin Middleware
 * ✅ FIX: same lowercase fix applied here too
 */
const requireSuperUserOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const role = req.user.role?.toLowerCase();
  if (role === 'admin' || role === 'superuser') {  // ✅ matches DB values
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Super User or Admin privileges required.' });
  }
};

module.exports = {
  authenticateUser,
  requireAdmin,
  requireSuperUserOrAdmin
};