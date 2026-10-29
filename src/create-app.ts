import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

export function configureTeamApp(app: INestApplication): INestApplication {
  const frontendOrigin = process.env.TEAM_FRONTEND_ORIGIN;
  if (!frontendOrigin) {
    throw new Error('TEAM_FRONTEND_ORIGIN must be configured.');
  }

  app.setGlobalPrefix('api');
  app.enableCors({ origin: frontendOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  return app;
}
