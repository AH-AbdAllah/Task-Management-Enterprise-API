const request = require('supertest');
const { app } = require('../src/index');
const { prisma, closeDatabases } = require('../src/config/db');

let accessToken;
let testUser;
let team, project, board, todoColumn, doneColumn, task;

beforeAll(async () => {
  // Cleanup old test data
  await prisma.user.deleteMany({ where: { email: { contains: '@tasktest.com' } } });

  // Register & login
  const signupRes = await request(app).post('/api/v1/auth/signup').send({
    email: 'manager@tasktest.com', password: 'testPass123', name: 'Task Manager', role: 'PROJECT_MANAGER',
  });
  testUser = signupRes.body.user;

  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: 'manager@tasktest.com', password: 'testPass123',
  });
  accessToken = loginRes.body.accessToken;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: '@tasktest.com' } } });
  await closeDatabases();
});

const auth = () => ({ Authorization: `Bearer ${accessToken}` });

describe('Task Lifecycle: Team → Project → Board → Column → Task', () => {
  it('Creates a team', async () => {
    const res = await request(app).post('/api/v1/teams').set(auth()).send({ name: 'Test Engineering' });
    expect(res.status).toBe(201);
    team = res.body.team;
  });

  it('Creates a project', async () => {
    const res = await request(app).post('/api/v1/projects').set(auth())
      .send({ name: 'Task Test Project', description: 'For testing', teamId: team.id });
    expect(res.status).toBe(201);
    project = res.body.project;
  });

  it('Creates a board', async () => {
    const res = await request(app).post('/api/v1/boards').set(auth())
      .send({ name: 'Main Board', projectId: project.id });
    expect(res.status).toBe(201);
    board = res.body.board;
  });

  it('Creates To Do column', async () => {
    const res = await request(app).post('/api/v1/boards/columns').set(auth())
      .send({ name: 'To Do', boardId: board.id, position: 0 });
    expect(res.status).toBe(201);
    todoColumn = res.body.column;
  });

  it('Creates Done column', async () => {
    const res = await request(app).post('/api/v1/boards/columns').set(auth())
      .send({ name: 'Done', boardId: board.id, position: 1 });
    expect(res.status).toBe(201);
    doneColumn = res.body.column;
  });

  it('Creates a task with URGENT priority', async () => {
    const res = await request(app).post('/api/v1/tasks').set(auth()).send({
      title: 'Build JS Migration',
      description: 'Convert TS to JS',
      columnId: todoColumn.id,
      priority: 'URGENT',
    });
    expect(res.status).toBe(201);
    expect(res.body.task.priority).toBe('URGENT');
    task = res.body.task;
  });

  it('Updates a task', async () => {
    const res = await request(app).put(`/api/v1/tasks/${task.id}`).set(auth())
      .send({ priority: 'HIGH', description: 'Updated description' });
    expect(res.status).toBe(200);
    expect(res.body.task.priority).toBe('HIGH');
  });

  it('Moves task to Done column', async () => {
    const res = await request(app).patch(`/api/v1/tasks/${task.id}/move`).set(auth())
      .send({ columnId: doneColumn.id });
    expect(res.status).toBe(200);
  });

  it('Gets board columns (with tasks)', async () => {
    const res = await request(app).get(`/api/v1/boards/${board.id}/columns`).set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('Gets project analytics with completion rate', async () => {
    const res = await request(app).get(`/api/v1/projects/${project.id}/analytics`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('completionRate');
    expect(res.body).toHaveProperty('velocity');
  });

  it('Deletes a task', async () => {
    const res = await request(app).delete(`/api/v1/tasks/${task.id}`).set(auth());
    expect(res.status).toBe(200);
  });
});
