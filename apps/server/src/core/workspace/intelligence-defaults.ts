export interface IntelligenceSettings {
  enabled: boolean;
  profileType: string;
  pageTypes: Array<{
    type: string;
    label: string;
    icon: string;
    statusFlow: string[];
    metadataSchema: Record<
      string,
      {
        type: string;
        required?: boolean;
        values?: string[];
        pageType?: string;
      }
    >;
  }>;
  edgeTypes: Array<{
    name: string;
    label: string;
    from: string;
    to: string;
    color: string;
  }>;
  teamTemplates: Array<{
    name: string;
    description: string;
    roles: Array<{
      role: string;
      systemPrompt: string;
      capabilities: string[];
      count: number;
    }>;
  }>;
  patternRules: Array<{
    type: string;
    condition: string;
    params: Record<string, any>;
    action: string;
  }>;
  dashboardWidgets: string[];
}

export const defaultResearchProfile: IntelligenceSettings = {
  enabled: false,
  profileType: 'research',

  pageTypes: [
    {
      type: 'hypothesis',
      label: 'Hypothesis',
      icon: 'flask',
      statusFlow: [
        'proposed',
        'testing',
        'validated',
        'refuted',
        'inconclusive',
        'superseded',
      ],
      metadataSchema: {
        formalStatement: { type: 'text', required: true },
        predictions: { type: 'text[]' },
        prerequisites: { type: 'text[]' },
        priority: {
          type: 'enum',
          values: ['low', 'medium', 'high', 'critical'],
        },
        domainTags: { type: 'tag[]' },
        successCriteria: { type: 'text' },
      },
    },
    {
      type: 'experiment',
      label: 'Experiment',
      icon: 'test-pipe',
      statusFlow: ['planned', 'running', 'completed', 'failed'],
      metadataSchema: {
        hypothesisId: { type: 'page_ref', pageType: 'hypothesis' },
        method: { type: 'text' },
        metrics: { type: 'json' },
        results: { type: 'json' },
        passedPredictions: { type: 'boolean' },
        unexpectedObservations: { type: 'text[]' },
        suggestedFollowUps: { type: 'text[]' },
        codeRef: { type: 'text' },
      },
    },
    {
      type: 'paper',
      label: 'Paper',
      icon: 'file-text',
      statusFlow: ['outline', 'draft', 'review', 'submitted', 'published'],
      metadataSchema: {
        domainTags: { type: 'tag[]' },
        coauthors: { type: 'text[]' },
        abstract: { type: 'text' },
      },
    },
    {
      type: 'journal',
      label: 'Journal Entry',
      icon: 'notebook',
      statusFlow: [],
      metadataSchema: {
        domainTags: { type: 'tag[]' },
        sessionDate: { type: 'text' },
      },
    },
  ],

  edgeTypes: [
    { name: 'VALIDATES', label: 'Validates', from: 'experiment', to: 'hypothesis', color: '#40c057' },
    { name: 'CONTRADICTS', label: 'Contradicts', from: 'experiment', to: 'hypothesis', color: '#fa5252' },
    { name: 'EXTENDS', label: 'Extends', from: 'hypothesis', to: 'hypothesis', color: '#228be6' },
    { name: 'INSPIRED_BY', label: 'Inspired By', from: 'any', to: 'any', color: '#be4bdb' },
    { name: 'USES_DATA_FROM', label: 'Uses Data From', from: 'experiment', to: 'experiment', color: '#868e96' },
    { name: 'FORMALIZES', label: 'Formalizes', from: 'paper', to: 'hypothesis', color: '#fd7e14' },
    { name: 'TESTS_HYPOTHESIS', label: 'Tests', from: 'experiment', to: 'hypothesis', color: '#15aabf' },
    { name: 'SPAWNED_FROM', label: 'Spawned From', from: 'hypothesis', to: 'experiment', color: '#74c0fc' },
    { name: 'SUPERSEDES', label: 'Supersedes', from: 'hypothesis', to: 'hypothesis', color: '#adb5bd' },
    { name: 'CITES', label: 'Cites', from: 'paper', to: 'any', color: '#dee2e6' },
    { name: 'REPLICATES', label: 'Replicates', from: 'experiment', to: 'experiment', color: '#69db7c' },
  ],

  teamTemplates: [
    {
      name: 'Research Team',
      description: 'PI-directed research team with collaborator, researchers, and synthesizer',
      roles: [
        {
          role: 'collaborator',
          systemPrompt: `You are a senior AI research collaborator. Your job is to:
- Help formalize the PI's intuitions into testable hypotheses
- Design experiments and review experiment designs
- Synthesize findings across multiple experiments
- Identify gaps, contradictions, and opportunities in the knowledge graph
Use context.query to understand what's known before proposing anything new.`,
          capabilities: [
            'hypothesis.create',
            'hypothesis.update',
            'experiment.design',
            'context.query',
            'task.create',
            'task.update',
            'page.create',
          ],
          count: 1,
        },
        {
          role: 'researcher',
          systemPrompt: `You are a research agent. Your job is to:
- Pick up assigned experiment tasks or high-priority open questions
- Query context before starting any work
- Execute experiments (run research, analyze data)
- Capture results in structured experiment pages
- Flag unexpected observations as open questions
- Propose follow-up experiments based on findings`,
          capabilities: [
            'context.query',
            'research.create',
            'page.create',
            'task.update',
            'task.create',
          ],
          count: 3,
        },
        {
          role: 'synthesizer',
          systemPrompt: `You are a synthesis agent. Monitor for:
- Multiple completed experiments in a domain — trigger synthesis
- Contradictions between experiment results
- Stale open questions that need attention
Write synthesis reports as pages, update hypothesis statuses, and flag cross-domain connections.`,
          capabilities: [
            'context.query',
            'page.create',
            'task.create',
            'task.update',
            'hypothesis.update',
          ],
          count: 1,
        },
      ],
    },
  ],

  patternRules: [
    {
      type: 'convergence',
      condition: '3+ experiments validate same hypothesis',
      params: { threshold: 3 },
      action: 'notify',
    },
    {
      type: 'contradiction',
      condition: 'Experiments with CONTRADICTS edges exist',
      params: {},
      action: 'flag',
    },
    {
      type: 'staleness',
      condition: 'Open question with no activity in 14 days',
      params: { maxAgeDays: 14 },
      action: 'surface',
    },
    {
      type: 'cross_domain',
      condition: 'Similar embeddings across different domain tags',
      params: { minSimilarity: 0.8 },
      action: 'surface',
    },
    {
      type: 'untested_implication',
      condition: 'Validated hypothesis extends to untested hypothesis',
      params: {},
      action: 'create_task',
    },
  ],

  dashboardWidgets: [
    'hypothesis-scoreboard',
    'open-questions',
    'recent-findings',
    'active-experiments',
    'domain-map',
    'contradiction-alerts',
  ],
};

export const resolveIntelligenceSettings = (
  settings?: any,
): IntelligenceSettings => ({
  ...defaultResearchProfile,
  ...(settings?.intelligence || {}),
  pageTypes:
    settings?.intelligence?.pageTypes || defaultResearchProfile.pageTypes,
  edgeTypes:
    settings?.intelligence?.edgeTypes || defaultResearchProfile.edgeTypes,
  teamTemplates:
    settings?.intelligence?.teamTemplates ||
    defaultResearchProfile.teamTemplates,
  patternRules:
    settings?.intelligence?.patternRules ||
    defaultResearchProfile.patternRules,
  dashboardWidgets:
    settings?.intelligence?.dashboardWidgets ||
    defaultResearchProfile.dashboardWidgets,
});
