import { Test, TestingModule } from '@nestjs/testing';
import { PatternDetectionService } from './pattern-detection.service';
import { ResearchGraphService } from '../research-graph/research-graph.service';
import { PatternDetectionRepo } from '../../database/repos/pattern-detection/pattern-detection.repo';
import { KYSELY } from '../../lib/kysely/nestjs-kysely';
import { IntelligenceSettings } from '../workspace/intelligence-defaults';

describe('PatternDetectionService', () => {
  let service: PatternDetectionService;

  const mockDb = {
    selectFrom: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue([]),
    executeTakeFirst: jest.fn().mockResolvedValue(null),
  };

  const mockResearchGraph = {
    getEvidenceChain: jest.fn(),
    findContradictions: jest.fn(),
    getRelationships: jest.fn(),
    getRelatedPages: jest.fn(),
  };

  const mockPatternRepo = {
    findExistingPattern: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset chain methods
    mockDb.selectFrom.mockReturnThis();
    mockDb.select.mockReturnThis();
    mockDb.innerJoin.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.execute.mockResolvedValue([]);
    mockDb.executeTakeFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatternDetectionService,
        { provide: KYSELY, useValue: mockDb },
        { provide: ResearchGraphService, useValue: mockResearchGraph },
        { provide: PatternDetectionRepo, useValue: mockPatternRepo },
      ],
    }).compile();

    service = module.get<PatternDetectionService>(PatternDetectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runAllPatterns', () => {
    it('should run all pattern evaluators from settings', async () => {
      const settings: IntelligenceSettings = {
        enabled: true,
        profileType: 'research',
        defaultTeamAgentType: 'claude',
        pageTypes: [],
        edgeTypes: [],
        teamTemplates: [],
        patternRules: [
          { type: 'convergence', condition: '', params: { threshold: 3 }, action: 'notify' },
          { type: 'contradiction', condition: '', params: {}, action: 'flag' },
        ],
        dashboardWidgets: [],
      };

      mockResearchGraph.findContradictions.mockResolvedValue([]);

      const count = await service.runAllPatterns('workspace-1', settings);
      expect(count).toBe(0);
    });

    it('should handle evaluator failures gracefully', async () => {
      const settings: IntelligenceSettings = {
        enabled: true,
        profileType: 'research',
        defaultTeamAgentType: 'claude',
        pageTypes: [],
        edgeTypes: [],
        teamTemplates: [],
        patternRules: [
          { type: 'convergence', condition: '', params: {}, action: 'notify' },
        ],
        dashboardWidgets: [],
      };

      mockDb.execute.mockRejectedValue(new Error('DB error'));

      const count = await service.runAllPatterns('workspace-1', settings);
      expect(count).toBe(0);
    });
  });

  describe('convergence detection', () => {
    it('should detect convergence when hypothesis has >= threshold validations', async () => {
      mockDb.execute.mockResolvedValueOnce([
        { id: 'hyp-1', title: 'Test Hypothesis' },
      ]);

      mockResearchGraph.getEvidenceChain.mockResolvedValue({
        supporting: [{ from: 'exp-1' }, { from: 'exp-2' }, { from: 'exp-3' }],
        contradicting: [],
        testing: [],
        reproductions: [],
        failedReproductions: [],
      });

      mockPatternRepo.findExistingPattern.mockResolvedValue(null);
      mockPatternRepo.create.mockResolvedValue({});

      const settings: IntelligenceSettings = {
        enabled: true,
        profileType: 'research',
        defaultTeamAgentType: 'claude',
        pageTypes: [],
        edgeTypes: [],
        teamTemplates: [],
        patternRules: [
          { type: 'convergence', condition: '', params: { threshold: 3 }, action: 'notify' },
        ],
        dashboardWidgets: [],
      };

      const count = await service.runAllPatterns('workspace-1', settings);

      expect(count).toBe(1);
      expect(mockPatternRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-1',
          patternType: 'convergence',
          severity: 'medium',
        }),
      );
    });

    it('should skip if pattern already exists', async () => {
      mockDb.execute.mockResolvedValueOnce([
        { id: 'hyp-1', title: 'Test Hypothesis' },
      ]);

      mockResearchGraph.getEvidenceChain.mockResolvedValue({
        supporting: [{ from: 'exp-1' }, { from: 'exp-2' }, { from: 'exp-3' }],
        contradicting: [],
        testing: [],
        reproductions: [],
        failedReproductions: [],
      });

      mockPatternRepo.findExistingPattern.mockResolvedValue({ id: 'existing' });

      const settings: IntelligenceSettings = {
        enabled: true,
        profileType: 'research',
        defaultTeamAgentType: 'claude',
        pageTypes: [],
        edgeTypes: [],
        teamTemplates: [],
        patternRules: [
          { type: 'convergence', condition: '', params: { threshold: 3 }, action: 'notify' },
        ],
        dashboardWidgets: [],
      };

      const count = await service.runAllPatterns('workspace-1', settings);
      expect(count).toBe(0);
      expect(mockPatternRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('contradiction detection', () => {
    it('should detect contradictions from graph edges', async () => {
      mockResearchGraph.findContradictions.mockResolvedValue([
        { from: 'exp-1', to: 'hyp-1', type: 'CONTRADICTS' },
      ]);

      mockPatternRepo.findExistingPattern.mockResolvedValue(null);
      mockPatternRepo.create.mockResolvedValue({});

      mockDb.execute.mockResolvedValueOnce([
        { id: 'exp-1', title: 'Experiment A' },
        { id: 'hyp-1', title: 'Hypothesis B' },
      ]);

      const settings: IntelligenceSettings = {
        enabled: true,
        profileType: 'research',
        defaultTeamAgentType: 'claude',
        pageTypes: [],
        edgeTypes: [],
        teamTemplates: [],
        patternRules: [
          { type: 'contradiction', condition: '', params: {}, action: 'flag' },
        ],
        dashboardWidgets: [],
      };

      const count = await service.runAllPatterns('workspace-1', settings);

      expect(count).toBe(1);
      expect(mockPatternRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patternType: 'contradiction',
          severity: 'high',
        }),
      );
    });
  });

  describe('intake gate detection', () => {
    it('should flag hypothesis marked proved without intake gate', async () => {
      mockDb.execute.mockResolvedValueOnce([
        {
          id: 'hyp-1',
          title: 'Proved Hypothesis',
          metadata: { claimLabel: 'proved', intakeGateCompleted: false },
        },
      ]);

      mockPatternRepo.findExistingPattern.mockResolvedValue(null);
      mockPatternRepo.create.mockResolvedValue({});

      const settings: IntelligenceSettings = {
        enabled: true,
        profileType: 'research',
        defaultTeamAgentType: 'claude',
        pageTypes: [],
        edgeTypes: [],
        teamTemplates: [],
        patternRules: [
          { type: 'intake_gate', condition: '', params: {}, action: 'flag' },
        ],
        dashboardWidgets: [],
      };

      const count = await service.runAllPatterns('workspace-1', settings);

      expect(count).toBe(1);
      expect(mockPatternRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patternType: 'intake_gate',
          severity: 'high',
          title: expect.stringContaining('Intake gate violation'),
        }),
      );
    });

    it('should not flag when intake gate is completed', async () => {
      mockDb.execute.mockResolvedValueOnce([
        {
          id: 'hyp-1',
          title: 'Proved Hypothesis',
          metadata: { claimLabel: 'proved', intakeGateCompleted: true },
        },
      ]);

      const settings: IntelligenceSettings = {
        enabled: true,
        profileType: 'research',
        defaultTeamAgentType: 'claude',
        pageTypes: [],
        edgeTypes: [],
        teamTemplates: [],
        patternRules: [
          { type: 'intake_gate', condition: '', params: {}, action: 'flag' },
        ],
        dashboardWidgets: [],
      };

      const count = await service.runAllPatterns('workspace-1', settings);
      expect(count).toBe(0);
      expect(mockPatternRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('evidence gap detection', () => {
    it('should detect papers citing hypotheses without experiments', async () => {
      mockDb.execute.mockResolvedValueOnce([
        { id: 'paper-1', title: 'My Paper' },
      ]);

      mockResearchGraph.getRelationships.mockResolvedValue([
        { from: 'paper-1', to: 'hyp-1', type: 'FORMALIZES' },
      ]);

      mockResearchGraph.getEvidenceChain.mockResolvedValue({
        supporting: [],
        contradicting: [],
        testing: [],
        reproductions: [],
        failedReproductions: [],
      });

      mockDb.executeTakeFirst.mockResolvedValue({
        id: 'hyp-1',
        title: 'Untested Hypothesis',
      });

      mockPatternRepo.findExistingPattern.mockResolvedValue(null);
      mockPatternRepo.create.mockResolvedValue({});

      const settings: IntelligenceSettings = {
        enabled: true,
        profileType: 'research',
        defaultTeamAgentType: 'claude',
        pageTypes: [],
        edgeTypes: [],
        teamTemplates: [],
        patternRules: [
          { type: 'evidence_gap', condition: '', params: { minExperiments: 1 }, action: 'surface' },
        ],
        dashboardWidgets: [],
      };

      const count = await service.runAllPatterns('workspace-1', settings);

      expect(count).toBe(1);
      expect(mockPatternRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patternType: 'evidence_gap',
          severity: 'medium',
          title: expect.stringContaining('Evidence gap'),
        }),
      );
    });
  });

  describe('reproduction failure detection', () => {
    it('should flag experiments with failed reproductions', async () => {
      mockDb.execute.mockResolvedValueOnce([
        { id: 'exp-1', title: 'Original Experiment' },
      ]);

      mockResearchGraph.getRelationships.mockResolvedValue([
        { from: 'exp-2', to: 'exp-1', type: 'FAILS_TO_REPRODUCE' },
      ]);

      mockPatternRepo.findExistingPattern.mockResolvedValue(null);
      mockPatternRepo.create.mockResolvedValue({});

      const settings: IntelligenceSettings = {
        enabled: true,
        profileType: 'research',
        defaultTeamAgentType: 'claude',
        pageTypes: [],
        edgeTypes: [],
        teamTemplates: [],
        patternRules: [
          { type: 'reproduction_failure', condition: '', params: {}, action: 'flag' },
        ],
        dashboardWidgets: [],
      };

      const count = await service.runAllPatterns('workspace-1', settings);

      expect(count).toBe(1);
      expect(mockPatternRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patternType: 'reproduction_failure',
          severity: 'high',
          title: expect.stringContaining('Reproduction failure'),
        }),
      );
    });

    it('should not flag experiments without failed reproductions', async () => {
      mockDb.execute.mockResolvedValueOnce([
        { id: 'exp-1', title: 'Solid Experiment' },
      ]);

      mockResearchGraph.getRelationships.mockResolvedValue([]);

      const settings: IntelligenceSettings = {
        enabled: true,
        profileType: 'research',
        defaultTeamAgentType: 'claude',
        pageTypes: [],
        edgeTypes: [],
        teamTemplates: [],
        patternRules: [
          { type: 'reproduction_failure', condition: '', params: {}, action: 'flag' },
        ],
        dashboardWidgets: [],
      };

      const count = await service.runAllPatterns('workspace-1', settings);
      expect(count).toBe(0);
      expect(mockPatternRepo.create).not.toHaveBeenCalled();
    });
  });
});
