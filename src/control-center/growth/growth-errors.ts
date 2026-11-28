import { BadRequestException, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function rethrowGrowthError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const message = String(error.meta?.message ?? '');
    const match = message.match(/GROWTH_([A-Z_]+): ([^\n]+)/);
    if (match) {
      const status = match[1] === 'NOT_FOUND' ? 404 : match[1] === 'CONFLICT' ? 409 : match[1] === 'FORBIDDEN' ? 403 : 400;
      throw new HttpException({ code: `GROWTH_${match[1]}`, message: match[2] }, status);
    }
    if (String(error.meta?.code ?? '').startsWith('22')) throw new BadRequestException('Tanggal atau data pengajuan tidak valid.');
  }
  throw error;
}
