//auth.js
const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware
 * Checks if user has a valid JWT token
 */
const authenticateUser = (req, res, next) => {
  try {
    console.log('🔐 Authenticating user...');
    
    // Get token from Authorization header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      console.log('❌ No Authorization header found');
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // Extract token (format: "Bearer <token>")
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      console.log('❌ No token in Authorization header');
      return res.status(401).json({ error: 'Access denied. Invalid token format.' });
    }

    // Verify token (use same secret as in routes/auth.js login)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    
    console.log('✅ User authenticated:', decoded.id);
    
    // Attach user info to request
    req.user = {
      id: decoded.id,
      name: decoded.name,
      user_name: decoded.user_name,
      email: decoded.email,
      role: decoded.role
    };
    
    // Continue to next middleware/route handler
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
 * Requires user to be authenticated AND have Admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role === 'Admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
};

/**
 * Super User or Admin Middleware
 */
const requireSuperUserOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role === 'Admin' || req.user.role === 'Super User') {
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