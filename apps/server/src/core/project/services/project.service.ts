import { Injectable } from '@nestjs/common';
import { ProjectRepo } from '../../../database/repos/project/project.repo';
import { SpaceRepo } from '../../../database/repos/space/space.repo';
import {
  ProjectView,
  InsertableProject,
  Project,
  UpdatableProject,
} from '../../../database/types/entity.types';
import { PaginationOptions } from '../../../lib/pagination/pagination-options';
import { Paginated } from '../../../lib/pagination/paginated';
import { PageService } from '../../page/services/page.service';
import { executeTx } from '@raven-docs/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { AgentMemoryService } from '../../agent-memory/agent-memory.service';
import { TaskService } from './task.service';

@Injectable()
export class ProjectService {
  private buildPlaybookPageContent(title: string, summary: string, bullets: string[]) {
    return JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: title }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: summary }],
        },
        {
          type: 'bulletList',
          content: bullets.map((text) => ({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text }],
              },
            ],
          })),
        },
      ],
    });
  }

  private async createPlaybookPages(
    userId: string,
    workspaceId: string,
    project: Project,
    parentPageId: string,
    trx?: any,
  ) {
    const playbookRoot = await this.pageService.create(
      userId,
      workspaceId,
      {
        title: 'Playbook',
        spaceId: project.spaceId,
        parentPageId,
        content: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Use the pages below to capture scope, architecture, risks, and delivery planning.',
                },
              ],
            },
          ],
        }),
      },
      trx,
    );

    const templates = [
      {
        title: 'Project Brief',
        summary: 'Problem statement, success criteria, and constraints.',
        bullets: ['Problem', 'Success criteria', 'Stakeholders', 'Constraints'],
      },
      {
        title: 'Architecture',
        summary: 'System design, data flows, integrations, and NFRs.',
        bullets: ['System diagram', 'Data model', 'Integrations', 'Non-functional requirements'],
      },
      {
        title: 'Delivery Plan',
        summary: 'Phases, milestones, and schedule assumptions.',
        bullets: ['Phases', 'Milestones', 'Dependencies', 'Timeline'],
      },
      {
        title: 'Backlog',
        summary: 'Epics, stories, and prioritized tasks.',
        bullets: ['Epics', 'Stories', 'Definition of done', 'Definition of ready'],
      },
      {
        title: 'Risks & Assumptions',
        summary: 'Unknowns, blockers, and mitigation steps.',
        bullets: ['Risks', 'Assumptions', 'Mitigations', 'Open questions'],
      },
    ];

    for (const template of templates) {
      await this.pageService.create(
        userId,
        workspaceId,
        {
          title: template.title,
          spaceId: project.spaceId,
          parentPageId: playbookRoot.id,
          content: this.buildPlaybookPageContent(
            template.title,
            template.summary,
            template.bullets,
          ),
        },
        trx,
      );
    }

    return playbookRoot.id;
  }
  private buildProjectOverviewContent(project: Project) {
    return JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Summary, goals, and current status for this project.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Goals' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Add primary goals here.' }],
                },
              ],
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Key Tasks' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Link or reference the most important tasks.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Timeline' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Start date, target date, and milestones.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Notes' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Add notes, updates, and decisions.' }],
        },
      ],
    });
  }

  constructor(
    private readonly projectRepo: ProjectRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageService: PageService,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly agentMemoryService: AgentMemoryService,
    private readonly taskService: TaskService,
  ) {}

  async findById(
    projectId: string,
    options?: {
      includeCreator?: boolean;
    },
  ): Promise<Project | undefined> {
    return this.projectRepo.findById(projectId, options);
  }

  async findBySpaceId(
    spaceId: string,
    pagination: PaginationOptions,
    options?: {
      includeArchived?: boolean;
      includeCreator?: boolean;
      searchTerm?: string;
    },
  ): Promise<Paginated<Project>> {
    return this.projectRepo.findBySpaceId(spaceId, pagination, options);
  }

  async findByWorkspaceId(
    workspaceId: string,
    pagination: PaginationOptions,
    options?: {
      includeArchived?: boolean;
      includeCreator?: boolean;
      searchTerm?: string;
    },
  ): Promise<Paginated<Project>> {
    return this.projectRepo.findByWorkspaceId(workspaceId, pagination, options);
  }

  async create(
    userId: string,
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      spaceId: string;
      icon?: string;
      color?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<Project> {
    console.log('ProjectService.create called with:', {
      userId,
      workspaceId,
      data,
    });

    // Verify the space exists and belongs to the workspace
    const space = await this.spaceRepo.findById(data.spaceId, workspaceId);
    if (!space || space.workspaceId !== workspaceId) {
      throw new Error('Space not found or does not belong to the workspace');
    }

    console.log('Space found:', {
      id: space.id,
      name: space.name,
      workspaceId: space.workspaceId,
    });

    const projectData: InsertableProject = {
      name: data.name,
      description: data.description,
      spaceId: data.spaceId,
      workspaceId,
      creatorId: userId,
      icon: data.icon,
      color: data.color,
      startDate: data.startDate,
      endDate: data.endDate,
      isArchived: false,
    };

    console.log(
      'Creating project with data:',
      JSON.stringify(projectData, null, 2),
    );

    const result = await executeTx(this.db, async (trx) => {
      const project = await this.projectRepo.create(projectData, trx);
      const overviewContent = this.buildProjectOverviewContent(project);
      const projectPage = await this.pageService.create(
        userId,
        workspaceId,
        {
          title: `${project.name} Overview`,
          icon: project.icon,
          spaceId: project.spaceId,
          content: overviewContent,
        },
        trx,
      );
      await this.createPlaybookPages(
        userId,
        workspaceId,
        project,
        projectPage.id,
        trx,
      );
      const updatedProject = await this.projectRepo.update(
        project.id,
        { homePageId: projectPage.id },
        trx,
      );

      return updatedProject ?? project;
    });

    try {
      const phaseTasks = [
        'Discovery phase',
        'Architecture phase',
        'Planning phase',
        'Execution phase',
        'Review phase',
      ];
      for (const title of phaseTasks) {
        await this.taskService.create(userId, workspaceId, {
          title,
          projectId: result.id,
          spaceId: result.spaceId,
        });
      }
    } catch {
      // Task creation should not block project creation.
    }

    try {
      await this.agentMemoryService.ingestMemory({
        workspaceId,
        spaceId: result.spaceId,
        creatorId: userId,
        source: 'project.created',
        summary: `Project created: ${result.name}`,
        tags: ['project', 'created'],
        content: {
          action: 'created',
          projectId: result.id,
          name: result.name,
          spaceId: result.spaceId,
        },
      });
    } catch {
      // Memory ingestion should not block project creation.
    }

    console.log('Project created result:', JSON.stringify(result, null, 2));
    return result;
  }

  async createProjectPage(
    userId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<Project | undefined> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.homePageId) {
      return project;
    }

    return executeTx(this.db, async (trx) => {
      const overviewContent = this.buildProjectOverviewContent(project);
      const projectPage = await this.pageService.create(
        userId,
        workspaceId,
        {
          title: `${project.name} Overview`,
          icon: project.icon,
          spaceId: project.spaceId,
          content: overviewContent,
        },
        trx,
      );

      return this.projectRepo.update(
        project.id,
        { homePageId: projectPage.id },
        trx,
      );
    });
  }

  async update(
    projectId: string,
    data: {
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
      coverImage?: string | null;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<Project | undefined> {
    console.log('ProjectService.update called with:', { projectId, data });
    const updateData: UpdatableProject = {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.coverImage !== undefined && { coverImage: data.coverImage }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.endDate !== undefined && { endDate: data.endDate }),
    };
    console.log('ProjectService.update: prepared updateData:', updateData);

    try {
      const result = await this.projectRepo.update(projectId, updateData);
      console.log('ProjectService.update: result:', result);

      if (result) {
        try {
          await this.agentMemoryService.ingestMemory({
            workspaceId: result.workspaceId,
            spaceId: result.spaceId,
            creatorId: result.creatorId || undefined,
            source: 'project.updated',
            summary: `Project updated: ${result.name}`,
            tags: ['project', 'updated'],
            content: {
              action: 'updated',
              projectId: result.id,
              name: result.name,
              spaceId: result.spaceId,
            },
          });
        } catch {
          // Memory ingestion should not block project updates.
        }
      }

      return result;
    } catch (error) {
      console.error('ProjectService.update: error:', error);
      throw error;
    }
  }

  async delete(projectId: string): Promise<void> {
    const project = await this.projectRepo.findById(projectId);
    await this.projectRepo.softDelete(projectId);

    if (project) {
      try {
        await this.agentMemoryService.ingestMemory({
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          creatorId: project.creatorId || undefined,
          source: 'project.deleted',
          summary: `Project deleted: ${project.name}`,
          tags: ['project', 'deleted'],
          content: {
            action: 'deleted',
            projectId: project.id,
            name: project.name,
            spaceId: project.spaceId,
          },
        });
      } catch {
        // Memory ingestion should not block project deletes.
      }
    }
  }

  async archive(projectId: string): Promise<Project | undefined> {
    const project = await this.projectRepo.archive(projectId);
    if (project) {
      try {
        await this.agentMemoryService.ingestMemory({
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          creatorId: project.creatorId || undefined,
          source: 'project.archived',
          summary: `Project archived: ${project.name}`,
          tags: ['project', 'archived'],
          content: {
            action: 'archived',
            projectId: project.id,
            name: project.name,
            spaceId: project.spaceId,
          },
        });
      } catch {
        // Memory ingestion should not block project archive.
      }
    }
    return project;
  }

  async unarchive(projectId: string): Promise<Project | undefined> {
    const project = await this.projectRepo.unarchive(projectId);
    if (project) {
      try {
        await this.agentMemoryService.ingestMemory({
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          creatorId: project.creatorId || undefined,
          source: 'project.unarchived',
          summary: `Project unarchived: ${project.name}`,
          tags: ['project', 'unarchived'],
          content: {
            action: 'unarchived',
            projectId: project.id,
            name: project.name,
            spaceId: project.spaceId,
          },
        });
      } catch {
        // Memory ingestion should not block project unarchive.
      }
    }
    return project;
  }
}
