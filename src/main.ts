import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const frontendOrigin = process.env.TEAM_FRONTEND_ORIGIN;
  if (!frontendOrigin) {
    throw new Error('TEAM_FRONTEND_ORIGIN must be configured.');
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: frontendOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = Number(process.env.PORT ?? 3200);
  await app.listen(port);
}

void bootstrap();
