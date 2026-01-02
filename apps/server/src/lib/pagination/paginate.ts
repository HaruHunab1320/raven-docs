import { SelectQueryBuilder, sql } from 'kysely';
import { PaginationOptions } from './pagination-options';
import { Paginated } from './paginated';

// A simplified version without complex count queries
export async function paginate<DB, TB extends keyof DB, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  options: PaginationOptions = {},
): Promise<Paginated<O>> {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const offset = (page - 1) * limit;

  // For this simple implementation, we'll just return the data with pagination info
  // In a production app, you would want to count total records properly
  const data = await query.limit(limit).offset(offset).execute();

  // Since we don't have a proper count, we'll estimate totalPages
  const hasMore = data.length === limit;
  const estimatedTotal = hasMore ? page * limit + 1 : page * limit;
  const estimatedTotalPages = Math.ceil(estimatedTotal / limit);

  return {
    data: data as O[],
    pagination: {
      total: estimatedTotal,
      page,
      limit,
      totalPages: estimatedTotalPages,
    },
  };
}
