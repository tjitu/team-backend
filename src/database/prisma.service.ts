import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    let url = process.env.DATABASE_URL;
    if (url && !url.includes('connection_limit=')) {
      url = `${url}${url.includes('?') ? '&' : '?'}connection_limit=5&pool_timeout=30`;
    }
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit(): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.$connect();
        return;
      } catch (err) {
        this.logger.warn(`Database connection attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
