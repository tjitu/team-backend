import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import { ControlCenterService } from './control-center.service';
import { CreateArticleControlDto, CreateDiscountControlDto, CreatePackageControlDto, CreateQuestionControlDto, CreateSubtopicControlDto, CreateTopicControlDto, CreateTryoutControlDto, UpdateArticleControlDto, UpdateDiscountControlDto, UpdateHiringApplicationDto, UpdateManagedUserDto, UpdatePackageControlDto, UpdateQuestionControlDto, UpdateSubtopicControlDto, UpdateTopicControlDto, UpdateTryoutControlDto } from './control-center.dto';

@Controller('team/control-center')
@UseGuards(SessionGuard)
export class ControlCenterController {
  constructor(private readonly controlCenter: ControlCenterService) {}

  @Get('overview')
  getOverview(@Req() request: AuthenticatedRequest) {
    return this.controlCenter.getOverview(request.user.id);
  }

  @Get('vercel-config')
  getVercelConfig(@Req() request: AuthenticatedRequest) {
    return this.controlCenter.getVercelStatus(request.user.id);
  }

  @Post('vercel-config')
  updateVercelConfig(
    @Req() request: AuthenticatedRequest,
    @Body() body: { token?: string; projectId?: string; teamId?: string },
  ) {
    return this.controlCenter.updateVercelConfig(request.user.id, body);
  }

  @Post('vercel-disconnect')
  disconnectVercelConfig(@Req() request: AuthenticatedRequest) {
    return this.controlCenter.disconnectVercelConfig(request.user.id);
  }

  @Get('revenue')
  getRevenue(@Req() request: AuthenticatedRequest) {
    return this.controlCenter.getRevenue(request.user.id);
  }

  @Get('payments')
  getPayments(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.controlCenter.listPayments(request.user.id, status, search);
  }

  @Get('tryouts')
  getTryouts(@Req() request: AuthenticatedRequest) {
    return this.controlCenter.listTryouts(request.user.id);
  }

  @Post('tryouts')
  createTryout(@Req() request: AuthenticatedRequest, @Body() body: CreateTryoutControlDto) {
    return this.controlCenter.createTryout(request.user.id, body);
  }

  @Patch('tryouts/:id')
  updateTryout(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateTryoutControlDto) {
    return this.controlCenter.updateTryout(request.user.id, id, body);
  }

  @Delete('tryouts/:id')
  deleteTryout(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.controlCenter.deleteTryout(request.user.id, id);
  }

  @Get('packages')
  getPackages(@Req() request: AuthenticatedRequest) {
    return this.controlCenter.listPackages(request.user.id);
  }

  @Post('packages')
  createPackage(@Req() request: AuthenticatedRequest, @Body() body: CreatePackageControlDto) {
    return this.controlCenter.createPackage(request.user.id, body);
  }

  @Patch('packages/:id')
  updatePackage(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdatePackageControlDto) {
    return this.controlCenter.updatePackage(request.user.id, id, body);
  }

  @Delete('packages/:id')
  deletePackage(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.controlCenter.deletePackage(request.user.id, id);
  }

  @Get('discounts')
  getDiscounts(@Req() request: AuthenticatedRequest) {
    return this.controlCenter.listDiscounts(request.user.id);
  }

  @Post('discounts')
  createDiscount(@Req() request: AuthenticatedRequest, @Body() body: CreateDiscountControlDto) {
    return this.controlCenter.createDiscount(request.user.id, body);
  }

  @Patch('discounts/:id')
  updateDiscount(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateDiscountControlDto,
  ) {
    return this.controlCenter.updateDiscount(request.user.id, id, body);
  }

  @Delete('discounts/:id')
  deleteDiscount(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.controlCenter.deleteDiscount(request.user.id, id);
  }

  @Get('users')
  getUsers(@Req() request: AuthenticatedRequest, @Query('search') search?: string) {
    return this.controlCenter.listUsers(request.user.id, search);
  }

  @Patch('users/:id')
  updateUser(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateManagedUserDto) {
    return this.controlCenter.updateUser(request.user.id, id, body);
  }

  @Delete('users/:id')
  deleteUser(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.controlCenter.deleteUser(request.user.id, id);
  }

  @Get('careers/applications')
  getCareerApplications(@Req() request: AuthenticatedRequest, @Query('search') search?: string) {
    return this.controlCenter.listHiringApplications(request.user.id, search);
  }

  @Patch('careers/applications/:id')
  updateCareerApplication(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateHiringApplicationDto) {
    return this.controlCenter.updateHiringApplication(request.user.id, id, body);
  }
  @Get('articles')
  getArticles(
    @Req() request: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.controlCenter.listArticles(request.user.id, search, status);
  }

  @Get('articles/:id')
  getArticle(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.controlCenter.getArticle(request.user.id, id);
  }

  @Post('articles')
  createArticle(@Req() request: AuthenticatedRequest, @Body() body: CreateArticleControlDto) {
    return this.controlCenter.createArticle(request.user.id, body);
  }

  @Patch('articles/:id')
  updateArticle(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateArticleControlDto,
  ) {
    return this.controlCenter.updateArticle(request.user.id, id, body);
  }

  @Delete('articles/:id')
  deleteArticle(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.controlCenter.deleteArticle(request.user.id, id);
  }

  @Get('topics')
  getTopics(@Req() request: AuthenticatedRequest) {
    return this.controlCenter.listTopics(request.user.id);
  }

  @Post('topics')
  createTopic(@Req() request: AuthenticatedRequest, @Body() body: CreateTopicControlDto) {
    return this.controlCenter.createTopic(request.user.id, body);
  }

  @Patch('topics/:id')
  updateTopic(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateTopicControlDto,
  ) {
    return this.controlCenter.updateTopic(request.user.id, id, body);
  }

  @Delete('topics/:id')
  deleteTopic(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.controlCenter.deleteTopic(request.user.id, id);
  }

  @Post('subtopics')
  createSubtopic(@Req() request: AuthenticatedRequest, @Body() body: CreateSubtopicControlDto) {
    return this.controlCenter.createSubtopic(request.user.id, body);
  }

  @Patch('subtopics/:id')
  updateSubtopic(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateSubtopicControlDto,
  ) {
    return this.controlCenter.updateSubtopic(request.user.id, id, body);
  }

  @Delete('subtopics/:id')
  deleteSubtopic(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.controlCenter.deleteSubtopic(request.user.id, id);
  }

  @Get('questions')
  getQuestions(
    @Req() request: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('subtest') subtest?: string,
    @Query('target') target?: string,
  ) {
    return this.controlCenter.listQuestions(request.user.id, search, subtest, target);
  }

  @Post('questions')
  createQuestion(@Req() request: AuthenticatedRequest, @Body() body: CreateQuestionControlDto) {
    return this.controlCenter.createQuestion(request.user.id, body);
  }

  @Patch('questions/:id')
  updateQuestion(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateQuestionControlDto,
  ) {
    return this.controlCenter.updateQuestion(request.user.id, id, body);
  }

  @Delete('questions/:id')
  deleteQuestion(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.controlCenter.deleteQuestion(request.user.id, id);
  }
}
