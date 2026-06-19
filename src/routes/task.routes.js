const { Router } = require('express');
const { TaskController } = require('../controllers/task.controller');
const { authenticateJWT } = require('../middlewares/auth');
const { upload } = require('../config/multer');
const { validate, createTaskSchema, updateTaskSchema, moveTaskSchema } = require('../middlewares/validation');

const router = Router();
router.use(authenticateJWT);

router.post('/', validate(createTaskSchema), TaskController.createTask);
router.put('/:taskId', validate(updateTaskSchema), TaskController.updateTask);
router.patch('/:taskId/move', validate(moveTaskSchema), TaskController.moveTask);
router.delete('/:taskId', TaskController.deleteTask);
router.post('/:taskId/attachments', upload.single('file'), TaskController.uploadAttachment);

module.exports = router;
