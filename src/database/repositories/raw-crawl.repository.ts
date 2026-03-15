import { Collection, Db } from 'mongodb';
import { RawCrawl, RawCrawlInsert } from '../../types/raw-crawl.types';

const COLLECTION_NAME = 'raw_crawls';

const getCollection = (db: Db): Collection<RawCrawl> => {
  return db.collection<RawCrawl>(COLLECTION_NAME);
};

const urlAlreadyExists = async (db: Db, url: string): Promise<boolean> => {
  const count = await getCollection(db).countDocuments({ url });
  return count > 0;
};

export const RawCrawlRepository = {
  save: async (db: Db, data: RawCrawlInsert): Promise<boolean> => {
    const exists = await urlAlreadyExists(db, data.url);
    if (exists) return false;

    await getCollection(db).insertOne(data);
    return true;
  },

  saveMany: async (db: Db, items: RawCrawlInsert[]): Promise<{ saved: number; skipped: number }> => {
    let saved = 0;
    let skipped = 0;

    for (const item of items) {
      const inserted = await RawCrawlRepository.save(db, item);
      inserted ? saved++ : skipped++;
    }

    return { saved, skipped };
  },

  ensureIndexes: async (db: Db): Promise<void> => {
    await getCollection(db).createIndex({ url: 1 }, { unique: true });
    await getCollection(db).createIndex({ processed: 1 });
    await getCollection(db).createIndex({ site: 1, crawledAt: -1 });
  },
};
