import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { ProgressService } from '../enrollments/progress.service';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { Quiz } from './entities/quiz.entity';
import { QuizzesController, QuizzesManageController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Quiz, QuizAttempt]), CoursesModule, EnrollmentsModule],
  controllers: [QuizzesManageController, QuizzesController],
  providers: [QuizzesService],
  exports: [QuizzesService, TypeOrmModule],
})
export class QuizzesModule implements OnModuleInit {
  constructor(
    private readonly quizzesService: QuizzesService,
    private readonly progressService: ProgressService,
  ) {}

  /** Quiz lessons and the lesson after a quiz stay locked until the quiz is passed. */
  onModuleInit(): void {
    this.progressService.registerLessonGate((user, lesson) =>
      this.quizzesService.assertQuizGate(user, lesson),
    );
  }
}
