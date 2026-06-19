const { Router } = require('express');
const { ProjectController } = require('../controllers/project.controller');
const { authenticateJWT } = require('../middlewares/auth');
const { validate, createProjectSchema } = require('../middlewares/validation');

const router = Router();
router.use(authenticateJWT);

router.post('/', validate(createProjectSchema), ProjectController.createProject);
router.get('/', ProjectController.getMyProjects);
router.get('/:projectId', ProjectController.getProjectDetails);
router.get('/:projectId/timeline', ProjectController.getProjectTimeline);
router.get('/:projectId/analytics', ProjectController.getProjectAnalytics);

module.exports = router;
