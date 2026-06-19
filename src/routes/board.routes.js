const { Router } = require('express');
const { BoardController } = require('../controllers/board.controller');
const { authenticateJWT } = require('../middlewares/auth');
const { validate, createBoardSchema, createColumnSchema } = require('../middlewares/validation');

const router = Router();
router.use(authenticateJWT);

router.post('/', validate(createBoardSchema), BoardController.createBoard);
router.get('/project/:projectId', BoardController.getProjectBoards);
router.post('/columns', validate(createColumnSchema), BoardController.createColumn);
router.get('/:boardId/columns', BoardController.getBoardColumns);
router.put('/:boardId/columns/reorder', BoardController.reorderColumns);

module.exports = router;
