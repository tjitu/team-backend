import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function createTeamApp() {
  const frontendOrigin = process.env.TEAM_FRONTEND_ORIGIN;
  if (!frontendOrigin) {
    throw new Error('TEAM_FRONTEND_ORIGIN must be configured.');
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: frontendOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  return app;
}
