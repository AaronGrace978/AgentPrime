/**
 * AgentPrime - Team Patterns API Tests
 * Tests for the backend API endpoints for team pattern sharing
 */

const request = require('supertest');
const { createApp } = require('../../backend/app/main');

// Mock the database for testing
jest.mock('../../backend/app/api/team_patterns', () => {
  const originalModule = jest.requireActual('../../backend/app/api/team_patterns');

  // Create in-memory storage for tests
  let testTeamPatternsDb = {};
  let testTeamPatternVersions = {};

  return {
    ...originalModule,
    // Override the database variables for testing
    team_patterns_db: testTeamPatternsDb,
    team_pattern_versions: testTeamPatternVersions,

    // Reset function for tests
    resetTestDb: () => {
      testTeamPatternsDb = {};
      testTeamPatternVersions = {};
    }
  };
});

describe('Team Patterns API', () => {
  let app;
  let testAgent;

  beforeAll(async () => {
    // Create FastAPI test app
    app = createApp();
    testAgent = request(app);
  });

  beforeEach(() => {
    // Reset test database before each test
    const teamPatternsModule = require('../../backend/app/api/team_patterns');
    if (teamPatternsModule.resetTestDb) {
      teamPatternsModule.resetTestDb();
    }
  });

  describe('POST /api/team-patterns/share', () => {
    const validPatternRequest = {
      pattern_id: 'test-pattern-1',
      team_id: 'team-123',
      user_id: 'user-456',
      pattern_data: {
        type: 'architecture',
        language: 'typescript',
        description: 'Test pattern for component structure',
        characteristics: {
          language: 'typescript',
          complexity: 'medium',
          domain: 'frontend'
        },
        examples: ['example code here'],
        confidence: 0.85
      },
      visibility: 'team',
      version: 1
    };

    test('should successfully share a new pattern', async () => {
      const response = await testAgent
        .post('/api/team-patterns/share')
        .send(validPatternRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pattern_id).toBe('test-pattern-1');
      expect(response.body.message).toContain('successfully');
    });

    test('should handle duplicate patterns with merging', async () => {
      // Share first pattern
      await testAgent
        .post('/api/team-patterns/share')
        .send(validPatternRequest)
        .expect(200);

      // Share updated version
      const updatedPattern = {
        ...validPatternRequest,
        pattern_data: {
          ...validPatternRequest.pattern_data,
          examples: ['example code here', 'additional example'],
          confidence: 0.9
        },
        version: 2
      };

      const response = await testAgent
        .post('/api/team-patterns/share')
        .send(updatedPattern)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('merged');
      expect(response.body.conflicts).toBeDefined();
    });

    test('should validate required fields', async () => {
      const invalidRequest = {
        pattern_id: 'test-pattern',
        // Missing required fields
      };

      await testAgent
        .post('/api/team-patterns/share')
        .send(invalidRequest)
        .expect(422); // Validation error
    });

    test('should handle invalid pattern data', async () => {
      const invalidRequest = {
        ...validPatternRequest,
        pattern_data: null // Invalid data
      };

      const response = await testAgent
        .post('/api/team-patterns/share')
        .send(invalidRequest)
        .expect(500);

      expect(response.body.detail).toBeDefined();
    });
  });

  describe('GET /api/team-patterns/team/{team_id}', () => {
    beforeEach(async () => {
      // Setup test data
      const patterns = [
        {
          pattern_id: 'pattern-1',
          team_id: 'team-123',
          user_id: 'user-1',
          pattern_data: {
            type: 'component',
            language: 'typescript',
            characteristics: { language: 'typescript' }
          },
          visibility: 'team',
          shared_at: Date.now(),
          version: 1,
          team_usage_count: 5,
          team_success_rate: 0.8
        },
        {
          pattern_id: 'pattern-2',
          team_id: 'team-123',
          user_id: 'user-2',
          pattern_data: {
            type: 'utility',
            language: 'javascript',
            characteristics: { language: 'javascript' }
          },
          visibility: 'team',
          shared_at: Date.now(),
          version: 1,
          team_usage_count: 3,
          team_success_rate: 0.9
        }
      ];

      for (const pattern of patterns) {
        await testAgent
          .post('/api/team-patterns/share')
          .send(pattern)
          .expect(200);
      }
    });

    test('should retrieve all patterns for a team', async () => {
      const response = await testAgent
        .get('/api/team-patterns/team/team-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.patterns).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.contributors).toBe(2);
    });

    test('should filter patterns by language', async () => {
      const response = await testAgent
        .get('/api/team-patterns/team/team-123?language=typescript')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.patterns).toHaveLength(1);
      expect(response.body.patterns[0].characteristics.language).toBe('typescript');
    });

    test('should return empty array for team with no patterns', async () => {
      const response = await testAgent
        .get('/api/team-patterns/team/nonexistent-team')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.patterns).toHaveLength(0);
      expect(response.body.total).toBe(0);
      expect(response.body.contributors).toBe(0);
    });
  });

  describe('POST /api/team-patterns/recommendations', () => {
    beforeEach(async () => {
      // Setup test patterns with different success rates
      const patterns = [
        {
          pattern_id: 'high-success-pattern',
          team_id: 'team-123',
          user_id: 'user-1',
          pattern_data: {
            type: 'architecture',
            language: 'typescript',
            characteristics: { language: 'typescript', project_type: 'web' }
          },
          visibility: 'team',
          version: 1
        },
        {
          pattern_id: 'medium-success-pattern',
          team_id: 'team-123',
          user_id: 'user-2',
          pattern_data: {
            type: 'utility',
            language: 'typescript',
            characteristics: { language: 'typescript', project_type: 'web' }
          },
          visibility: 'team',
          version: 1
        }
      ];

      for (const pattern of patterns) {
        await testAgent
          .post('/api/team-patterns/share')
          .send(pattern)
          .expect(200);

        // Record usage to set success rates
        const successRate = pattern.pattern_id.includes('high') ? true : false;
        await testAgent
          .post('/api/team-patterns/usage')
          .query({
            team_id: pattern.team_id,
            pattern_id: pattern.pattern_id,
            success: successRate
          })
          .expect(200);
      }
    });

    test('should return recommendations sorted by score', async () => {
      const requestData = {
        team_id: 'team-123',
        language: 'typescript',
        project_type: 'web'
      };

      const response = await testAgent
        .post('/api/team-patterns/recommendations')
        .send(requestData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.recommendations).toBeDefined();
      expect(response.body.recommendations.length).toBeGreaterThan(0);

      // Check that recommendations are sorted by score (higher first)
      const scores = response.body.recommendations.map(r => r.recommendation_score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i-1]).toBeGreaterThanOrEqual(scores[i]);
      }
    });

    test('should filter recommendations by language', async () => {
      const requestData = {
        team_id: 'team-123',
        language: 'javascript' // No patterns match this
      };

      const response = await testAgent
        .post('/api/team-patterns/recommendations')
        .send(requestData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.recommendations).toHaveLength(0);
    });

    test('should limit recommendations to top 10', async () => {
      // This test would need many patterns to test the limit
      // For now, just verify the structure
      const requestData = {
        team_id: 'team-123'
      };

      const response = await testAgent
        .post('/api/team-patterns/recommendations')
        .send(requestData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.recommendations.length).toBeLessThanOrEqual(10);
    });
  });

  describe('POST /api/team-patterns/usage', () => {
    beforeEach(async () => {
      // Setup a test pattern
      await testAgent
        .post('/api/team-patterns/share')
        .send({
          pattern_id: 'usage-test-pattern',
          team_id: 'team-123',
          user_id: 'user-1',
          pattern_data: {
            type: 'test',
            language: 'typescript',
            characteristics: { language: 'typescript' }
          },
          visibility: 'team',
          version: 1
        })
        .expect(200);
    });

    test('should record successful pattern usage', async () => {
      const response = await testAgent
        .post('/api/team-patterns/usage')
        .query({
          team_id: 'team-123',
          pattern_id: 'usage-test-pattern',
          success: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('recorded');
    });

    test('should record failed pattern usage', async () => {
      const response = await testAgent
        .post('/api/team-patterns/usage')
        .query({
          team_id: 'team-123',
          pattern_id: 'usage-test-pattern',
          success: false
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle non-existent patterns', async () => {
      const response = await testAgent
        .post('/api/team-patterns/usage')
        .query({
          team_id: 'team-123',
          pattern_id: 'nonexistent-pattern',
          success: true
        })
        .expect(404);

      expect(response.body.detail).toContain('not found');
    });

    test('should calculate success rate correctly', async () => {
      // Record multiple usages
      await testAgent.post('/api/team-patterns/usage').query({
        team_id: 'team-123', pattern_id: 'usage-test-pattern', success: true
      });
      await testAgent.post('/api/team-patterns/usage').query({
        team_id: 'team-123', pattern_id: 'usage-test-pattern', success: false
      });
      await testAgent.post('/api/team-patterns/usage').query({
        team_id: 'team-123', pattern_id: 'usage-test-pattern', success: true
      });

      // Get pattern to check success rate
      const teamResponse = await testAgent
        .get('/api/team-patterns/team/team-123')
        .expect(200);

      const pattern = teamResponse.body.patterns.find(
        p => p.pattern_id === 'usage-test-pattern'
      );
      expect(pattern.team_usage_count).toBe(3);
      expect(pattern.team_success_rate).toBe(2/3); // 2 successes out of 3 attempts
    });
  });

  describe('GET /api/team-patterns/versions/{team_id}/{pattern_id}', () => {
    beforeEach(async () => {
      // Create initial pattern
      await testAgent
        .post('/api/team-patterns/share')
        .send({
          pattern_id: 'version-test-pattern',
          team_id: 'team-123',
          user_id: 'user-1',
          pattern_data: { type: 'test', version: 1 },
          visibility: 'team',
          version: 1
        })
        .expect(200);

      // Create a "version" by updating
      await testAgent
        .post('/api/team-patterns/share')
        .send({
          pattern_id: 'version-test-pattern',
          team_id: 'team-123',
          user_id: 'user-2',
          pattern_data: { type: 'test', version: 2, updated: true },
          visibility: 'team',
          version: 2
        })
        .expect(200);
    });

    test('should return version history for a pattern', async () => {
      const response = await testAgent
        .get('/api/team-patterns/versions/team-123/version-test-pattern')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.versions).toBeDefined();
      expect(response.body.versions.length).toBeGreaterThan(1);

      // Latest version should be first
      expect(response.body.versions[0].current).toBe(true);
      expect(response.body.versions[0].version).toBe(2);
    });

    test('should handle non-existent patterns', async () => {
      const response = await testAgent
        .get('/api/team-patterns/versions/team-123/nonexistent-pattern')
        .expect(404);

      expect(response.body.detail).toContain('not found');
    });
  });

});
