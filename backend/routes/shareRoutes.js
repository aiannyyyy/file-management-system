//shareRoutes.js
const express = require('express');
const router = express.Router();
const shareController = require('../controllers/shareController');
const { authenticateUser } = require('../middleware/auth'); // ✅ FIXED!

// Share regular file with users
router.post('/files/:fileId/share', authenticateUser, shareController.shareFile);

// Share category file with users
router.post('/category-files/:categoryFileId/share', authenticateUser, shareController.shareCategoryFile);

// Get files shared with me
router.get('/shared-with-me', authenticateUser, shareController.getSharedWithMe);

// Get who has access to a regular file
router.get('/files/:fileId/shares', authenticateUser, shareController.getFileShares);

// Get who has access to a category file
router.get('/category-files/:categoryFileId/shares', authenticateUser, shareController.getCategoryFileShares);

// Remove share
router.delete('/shares/:shareId', authenticateUser, shareController.removeShare);

// Get all users (for dropdown)
router.get('/users/all', authenticateUser, shareController.getAllUsers);

// Check if user has access to file
router.get('/files/:fileId/access/:type', authenticateUser, shareController.checkFileAccess);

// Share entire category with users
router.post('/categories/:categoryId/share', authenticateUser, shareController.shareCategory);

// Get who has access to a category
router.get('/categories/:categoryId/shares', authenticateUser, shareController.getCategoryShares);

// Get categories shared with me
router.get('/shared-categories-with-me', authenticateUser, shareController.getSharedCategoriesWithMe);

// Remove all access for a user to a category
router.delete('/categories/:categoryId/remove-user/:userId', authenticateUser, shareController.removeCategoryShare);
module.exports = router;