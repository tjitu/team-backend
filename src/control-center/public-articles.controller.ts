import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { JITU_MANAGEMENT_DATA_SOURCE } from './jitu-management.data-source';
import type { JituManagementDataSource } from './jitu-management.data-source';

@Controller('articles')
export class PublicArticlesController {
  constructor(
    @Inject(JITU_MANAGEMENT_DATA_SOURCE)
    private readonly articles: JituManagementDataSource,
  ) {}

  @Get()
  listPublishedArticles() {
    return this.articles.listPublishedArticles();
  }

  @Get(':slug')
  async getPublishedArticle(@Param('slug') slug: string) {
    const article = await this.articles.getPublishedArticleBySlug(slug);
    if (!article) throw new NotFoundException('Article not found.');
    return article;
  }
}
