const { Router } = require('express');
const { CommentController } = require('../controllers/comment.controller');
const { authenticateJWT } = require('../middlewares/auth');

const router = Router();
router.use(authenticateJWT);

router.get('/tasks/:taskId/comments', CommentController.getComments);
router.post('/tasks/:taskId/comments', CommentController.addComment);
router.delete('/comments/:commentId', CommentController.deleteComment);

module.exports = router;
