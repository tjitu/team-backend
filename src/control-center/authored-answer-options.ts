import { BadRequestException } from '@nestjs/common';

type AuthoredOption = { content: string; isCorrect: boolean; order: number };

export function validateAuthoredOptions(value: unknown): asserts value is AuthoredOption[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new BadRequestException('Lengkapi pilihan jawaban sebelum menyimpan soal.');
  }
  const contents = new Set<string>();
  const positions = new Set<number>();
  let keys = 0;
  for (const option of value) {
    if (!option || typeof option.content !== 'string' || !option.content.trim()
      || typeof option.isCorrect !== 'boolean' || !Number.isInteger(option.order)
      || option.order < 1 || option.order > value.length) {
      throw new BadRequestException('Setiap opsi memerlukan teks, posisi, dan penanda kunci yang valid.');
    }
    contents.add(option.content.trim().normalize().replace(/\s+/g, ' '));
    positions.add(option.order);
    if (option.isCorrect) keys++;
  }
  if (keys !== 1 || positions.size !== value.length || contents.size !== value.length) {
    throw new BadRequestException('Isi opsi yang berbeda dalam urutan A–E dan tandai tepat satu kunci.');
  }
}
