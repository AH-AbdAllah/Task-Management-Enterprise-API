const { Router } = require('express');
const { TeamController } = require('../controllers/team.controller');
const { authenticateJWT } = require('../middlewares/auth');
const { validate, createTeamSchema, addTeamMemberSchema } = require('../middlewares/validation');

const router = Router();
router.use(authenticateJWT);

router.post('/', validate(createTeamSchema), TeamController.createTeam);
router.get('/my', TeamController.getMyTeams);
router.post('/:teamId/members', validate(addTeamMemberSchema), TeamController.addMember);
router.get('/:teamId/members', TeamController.getTeamMembers);

module.exports = router;
