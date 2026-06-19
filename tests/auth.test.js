const request = require('supertest');
const { app } = require('../src/index');
const { prisma, closeDatabases } = require('../src/config/db');

beforeAll(async () => {
  // Clean test data
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: '@test-enterprise.com' } } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: '@test-enterprise.com' } } });
  await closeDatabases();
});

describe('Auth - Signup & Login with Refresh Tokens', () => {
  const testUser = {
    email: 'auth@test-enterprise.com',
    password: 'securePass123',
    name: 'Auth Tester',
  };

  let accessToken;
  let refreshToken;

  it('POST /api/v1/auth/signup → 201', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send(testUser);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.role).toBe('DEVELOPER');
  });

  it('POST /api/v1/auth/login → 200 with accessToken + refreshToken', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body).toHaveProperty('expiresIn');
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('POST /api/v1/auth/refresh → 200 with new tokens', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    // Old token should be rotated
    expect(res.body.refreshToken).not.toBe(refreshToken);
    refreshToken = res.body.refreshToken; // update for logout test
  });

  it('POST /api/v1/auth/logout → 200', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out successfully');
  });

  it('POST /api/v1/auth/refresh after logout → 403', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(403);
  });

  it('Duplicate signup → 409', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send(testUser);
    expect(res.status).toBe(409);
  });
});
