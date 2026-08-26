import { Collection, Db } from 'mongodb';
import { RawCrawl, RawCrawlInsert } from '../../types/raw-crawl.types';

const COLLECTION_NAME = 'raw_crawls';

export type SaveOutcome = 'inserted' | 'backfilled' | 'skipped';

export interface SaveManyResult {
  saved: number;
  backfilled: number;
  skipped: number;
}

const getCollection = (db: Db): Collection<RawCrawl> => {
  return db.collection<RawCrawl>(COLLECTION_NAME);
};

export const RawCrawlRepository = {
  /**
   * Deduplica por `url`. Se o documento ja existe mas ainda nao tem imagem,
   * preenche o campo — assim uma reexecucao completa registros antigos sem
   * precisar limpar a colecao.
   */
  save: async (db: Db, data: RawCrawlInsert): Promise<SaveOutcome> => {
    const existing = await getCollection(db).findOne(
      { url: data.url },
      { projection: { _id: 1, imageUrl: 1 } },
    );

    if (!existing) {
      await getCollection(db).insertOne(data);
      return 'inserted';
    }

    if (!existing.imageUrl && data.imageUrl) {
      await getCollection(db).updateOne(
        { _id: existing._id },
        { $set: { imageUrl: data.imageUrl } },
      );
      return 'backfilled';
    }

    return 'skipped';
  },

  saveMany: async (db: Db, items: RawCrawlInsert[]): Promise<SaveManyResult> => {
    const result: SaveManyResult = { saved: 0, backfilled: 0, skipped: 0 };

    for (const item of items) {
      const outcome = await RawCrawlRepository.save(db, item);

      if (outcome === 'inserted') result.saved++;
      else if (outcome === 'backfilled') result.backfilled++;
      else result.skipped++;
    }

    return result;
  },

  ensureIndexes: async (db: Db): Promise<void> => {
    await getCollection(db).createIndex({ url: 1 }, { unique: true });
    await getCollection(db).createIndex({ processed: 1 });
    await getCollection(db).createIndex({ site: 1, crawledAt: -1 });
  },
};
