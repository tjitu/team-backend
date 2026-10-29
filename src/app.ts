import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureTeamApp } from './create-app';

async function bootstrap(): Promise<void> {
  const app = configureTeamApp(await NestFactory.create(AppModule));
  const port = Number(process.env.PORT ?? 3200);
  await app.listen(port);
}

void bootstrap();
