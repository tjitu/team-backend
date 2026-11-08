import 'dotenv/config';
import 'reflect-metadata';
import { setDefaultResultOrder } from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureTeamApp } from './create-app';

setDefaultResultOrder('ipv4first');

process.on('unhandledRejection', (reason) => {
  console.error('[team-backend] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[team-backend] Uncaught Exception:', err);
});

async function bootstrap(): Promise<void> {
  const app = configureTeamApp(await NestFactory.create(AppModule));
  const port = Number(process.env.PORT ?? 3200);
  await app.listen(port);
}

void bootstrap();
