import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { PageService } from '../page/services/page.service';
import { AgentReviewPromptsService } from './agent-review-prompts.service';

const getWeekKey = (date = new Date()) => {
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const dayOffset = firstDay.getDay() || 7;
  const weekStart = new Date(firstDay);
  weekStart.setDate(firstDay.getDate() + (7 - dayOffset));
  const diff =
    date.getTime() -
    new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate())
      .getTime();
  const weekNumber = Math.ceil((diff / (1000 * 60 * 60 * 24) + 1) / 7);
  return `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
};

const getWeekLabel = (date = new Date()) => {
  const start = new Date(date);
  const day = start.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  start.setDate(start.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
};

@Injectable()
export class WeeklyReviewService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageService: PageService,
    private readonly reviewPromptService: AgentReviewPromptsService,
  ) {}

  async ensureWeeklyReviewPage(params: {
    spaceId: string;
    workspaceId: string;
    userId: string;
    date?: Date;
  }) {
    const reviewDate = params.date || new Date();
    const weekKey = getWeekKey(reviewDate);
    const title = `Weekly Review ${weekKey}`;

    // Each user gets their own weekly review page
    const existing = await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'slugId', 'spaceId'])
      .where('spaceId', '=', params.spaceId)
      .where('title', '=', title)
      .where('creatorId', '=', params.userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (existing) {
      return { status: 'exists', page: existing };
    }

    const prompts = await this.reviewPromptService.consumePending({
      workspaceId: params.workspaceId,
      spaceId: params.spaceId,
      creatorId: params.userId,
      weekKey,
    });

    const promptList = prompts.length
      ? {
          type: 'bulletList',
          content: prompts.map((prompt) => ({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: prompt.question }],
              },
            ],
          })),
        }
      : {
          type: 'paragraph',
          content: [{ type: 'text', text: 'No agent questions this week.' }],
        };

    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Week of ${getWeekLabel(reviewDate)}` },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Weekly Review Checklist' }],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Clear Inbox' }],
                },
              ],
            },
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Update next actions for projects' },
                  ],
                },
              ],
            },
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Review waiting items' }],
                },
              ],
            },
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Review someday list' }],
                },
              ],
            },
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Scan calendar and deadlines' },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Weekly Summary' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Capture key wins, lessons, and what moved the needle.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Agent Questions' }],
        },
        promptList,
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Next Week Intentions' }],
        },
        {
          type: 'paragraph',
          content: [],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Notes' }],
        },
        {
          type: 'paragraph',
          content: [],
        },
      ],
    };

    const page = await this.pageService.create(
      params.userId,
      params.workspaceId,
      {
        title,
        spaceId: params.spaceId,
        content: JSON.stringify(content),
      },
    );

    return { status: 'created', page };
  }
}
