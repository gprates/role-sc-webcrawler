import 'dotenv/config';
import { connectToDatabase, closeDatabaseConnection } from './database/mongodb.connection';
import type { RawCrawl } from './types/raw-crawl.types';
import { createLogger } from './utils/logger.utils';

const logger = createLogger('InspectImages');

const municipality = process.argv[2];
const limit = Number(process.argv[3]) || 20;

const run = async (): Promise<void> => {
  const db = await connectToDatabase();
  const collection = db.collection<RawCrawl>('raw_crawls');

  const filter = municipality ? { municipality } : {};

  const total = await collection.countDocuments(filter);
  const withImage = await collection.countDocuments({
    ...filter,
    imageUrl: { $nin: [null, ''] },
  });

  const escopo = municipality ? `municipio "${municipality}"` : 'todos os municipios';
  logger.info(`Escopo: ${escopo}`);
  logger.info(`Total: ${total} | com imagem: ${withImage} | sem imagem: ${total - withImage}`);

  const docs = await collection
    .find(filter, { projection: { title: 1, url: 1, imageUrl: 1 } })
    .sort({ crawledAt: -1 })
    .limit(limit)
    .toArray();

  console.log('');
  for (const doc of docs) {
    console.log(`${doc.imageUrl ? '[OK]  ' : '[----]'} ${doc.title}`);
    console.log(`       artigo: ${doc.url}`);
    console.log(`       imagem: ${doc.imageUrl ?? '(nenhuma)'}`);
    console.log('');
  }

  await closeDatabaseConnection();
};

run().catch((error) => {
  logger.error('Falha na inspecao', { error });
  process.exit(1);
});
