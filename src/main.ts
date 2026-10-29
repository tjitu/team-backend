import 'dotenv/config';
import 'reflect-metadata';
import { createTeamApp } from './create-app';

async function bootstrap(): Promise<void> {
  const app = await createTeamApp();
  const port = Number(process.env.PORT ?? 3200);
  await app.listen(port);
}

void bootstrap();
