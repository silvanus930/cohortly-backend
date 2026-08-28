import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { CohortsService } from '../src/cohorts/cohorts.service';
import { UserRole } from '../src/common/enums/user-role.enum';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { CategoriesService } from '../src/courses/categories.service';
import { CoursesService } from '../src/courses/courses.service';
import { CurriculumService } from '../src/courses/curriculum.service';
import { type Course } from '../src/courses/entities/course.entity';
import { CoursePricing, LessonType } from '../src/courses/enums/course.enums';
import { EnrollmentsService } from '../src/enrollments/enrollments.service';
import { LessonProgressStatus } from '../src/enrollments/enums/enrollment.enums';
import { ProgressService } from '../src/enrollments/progress.service';
import { OrganizationsService } from '../src/organizations/organizations.service';
import { QuizzesService } from '../src/quizzes/quizzes.service';
import { ReferralsService } from '../src/referrals/referrals.service';
import { type User } from '../src/users/entities/user.entity';
import { UsersService } from '../src/users/users.service';

/**
 * Populates a development database with a realistic slice of data:
 * staff, instructors, learners, categories, published courses with
 * quizzes and assignments, cohorts, an organization with seats and a
 * partner. Safe to run more than once; existing accounts are reused.
 *
 *   npm run seed
 */
const PASSWORD = 'Password123!';

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

const STAFF: SeedUser[] = [
  { email: 'admin@cohortly.local', firstName: 'Avery', lastName: 'Admin', role: UserRole.ADMIN },
  {
    email: 'ada.instructor@cohortly.local',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: UserRole.INSTRUCTOR,
  },
  {
    email: 'grace.instructor@cohortly.local',
    firstName: 'Grace',
    lastName: 'Hopper',
    role: UserRole.INSTRUCTOR,
  },
  {
    email: 'orgadmin@cohortly.local',
    firstName: 'Olga',
    lastName: 'Owner',
    role: UserRole.LEARNER,
  },
  {
    email: 'partner@cohortly.local',
    firstName: 'Pat',
    lastName: 'Partner',
    role: UserRole.LEARNER,
  },
];

const LEARNERS: SeedUser[] = [
  'Lena Learner',
  'Marco Ruiz',
  'Priya Nair',
  'Tomas Berg',
  'Yuki Tanaka',
  'Sam Okafor',
].map((name, index) => {
  const [firstName, lastName] = name.split(' ');
  return {
    email: `learner${index + 1}@cohortly.local`,
    firstName,
    lastName,
    role: UserRole.LEARNER,
  };
});

const CATEGORIES = [
  { name: 'Web Development', description: 'Frontend, backend and everything between' },
  { name: 'Data Engineering', description: 'Pipelines, warehouses and analytics' },
  { name: 'Cloud & DevOps', description: 'Ship and run software reliably' },
];

interface SeedCourse {
  title: string;
  summary: string;
  category: string;
  pricing: CoursePricing;
  priceCents: number;
  instructor: string;
  tags: string[];
}

const COURSES: SeedCourse[] = [
  {
    title: 'Full Stack TypeScript',
    summary: 'Build and ship a production web app with NestJS, PostgreSQL and React.',
    category: 'Web Development',
    pricing: CoursePricing.PAID,
    priceCents: 24900,
    instructor: 'ada.instructor@cohortly.local',
    tags: ['typescript', 'nestjs', 'react'],
  },
  {
    title: 'Git and GitHub Essentials',
    summary: 'Branching, reviews and release workflows for small teams.',
    category: 'Web Development',
    pricing: CoursePricing.FREE,
    priceCents: 0,
    instructor: 'ada.instructor@cohortly.local',
    tags: ['git', 'collaboration'],
  },
  {
    title: 'Data Pipelines with Python',
    summary: 'Design reliable batch and streaming pipelines with modern tooling.',
    category: 'Data Engineering',
    pricing: CoursePricing.PAID,
    priceCents: 19900,
    instructor: 'grace.instructor@cohortly.local',
    tags: ['python', 'data'],
  },
  {
    title: 'Docker for Developers',
    summary: 'Containerize applications and run them locally and in the cloud.',
    category: 'Cloud & DevOps',
    pricing: CoursePricing.FREE,
    priceCents: 0,
    instructor: 'grace.instructor@cohortly.local',
    tags: ['docker', 'devops'],
  },
];

function isoDaysFromNow(days: number, hour = 18): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to seed a production database without --force');
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const users = app.get(UsersService);
  const passwords = app.get(PasswordService);
  const categories = app.get(CategoriesService);
  const courses = app.get(CoursesService);
  const curriculum = app.get(CurriculumService);
  const quizzes = app.get(QuizzesService);
  const assignments = app.get(AssignmentsService);
  const cohorts = app.get(CohortsService);
  const organizations = app.get(OrganizationsService);
  const enrollments = app.get(EnrollmentsService);
  const progress = app.get(ProgressService);
  const referrals = app.get(ReferralsService);

  try {
    const passwordHash = await passwords.hash(PASSWORD);
    const ensureUser = async (seed: SeedUser): Promise<User> =>
      (await users.findByEmail(seed.email)) ??
      users.create({ ...seed, passwordHash, emailVerifiedAt: new Date() });

    const userByEmail = new Map<string, User>();
    for (const seed of [...STAFF, ...LEARNERS]) {
      userByEmail.set(seed.email, await ensureUser(seed));
    }
    const admin = userByEmail.get('admin@cohortly.local')!;
    const learners = LEARNERS.map((seed) => userByEmail.get(seed.email)!);

    const existingCategories = await categories.list();
    const categoryByName = new Map(existingCategories.map((category) => [category.name, category]));
    for (const seed of CATEGORIES) {
      if (!categoryByName.has(seed.name)) {
        categoryByName.set(seed.name, await categories.create(seed));
      }
    }

    const created: Course[] = [];
    for (const seed of COURSES) {
      const instructor = userByEmail.get(seed.instructor)!;
      const existing = await courses.listManaged(admin, { page: 1, limit: 1, search: seed.title });
      if (existing.items.length > 0) {
        created.push(existing.items[0]);
        continue;
      }
      const course = await courses.create(admin, {
        title: seed.title,
        summary: seed.summary,
        description: `${seed.summary}\n\nThis course was generated by the seed script.`,
        categoryId: categoryByName.get(seed.category)!.id,
        pricing: seed.pricing,
        priceCents: seed.priceCents,
        instructorId: instructor.id,
        tags: seed.tags,
      });
      for (const [moduleIndex, moduleTitle] of ['Foundations', 'Building the project'].entries()) {
        const module = await curriculum.addModule(instructor, course.id, { title: moduleTitle });
        const intro = await curriculum.addLesson(instructor, module.id, {
          title: `${moduleTitle}: overview`,
          type: LessonType.VIDEO,
          durationMinutes: 12,
          contentUrl: 'https://videos.cohortly.local/sample.mp4',
          isPreview: moduleIndex === 0,
        });
        await curriculum.addLesson(instructor, module.id, {
          title: `${moduleTitle}: reading`,
          type: LessonType.READING,
          durationMinutes: 20,
          body: `# ${moduleTitle}\n\nRead this before the live session.`,
        });
        const quizLesson = await curriculum.addLesson(instructor, module.id, {
          title: `${moduleTitle}: checkpoint quiz`,
          type: LessonType.QUIZ,
          durationMinutes: 10,
        });
        await quizzes.upsert(instructor, quizLesson.id, {
          title: `${moduleTitle} checkpoint`,
          passingScore: 60,
          maxAttempts: 3,
          questions: [
            {
              id: 'q1',
              prompt: `Which lesson came first in ${moduleTitle}?`,
              type: 'SINGLE',
              options: [
                { id: 'a', text: intro.title },
                { id: 'b', text: 'The quiz' },
              ],
              correctOptionIds: ['a'],
              points: 2,
            },
            {
              id: 'q2',
              prompt: 'Practice matters more than theory alone.',
              type: 'TRUE_FALSE',
              options: [
                { id: 't', text: 'True' },
                { id: 'f', text: 'False' },
              ],
              correctOptionIds: ['t'],
            },
          ],
        });
        if (moduleIndex === 1) {
          const assignmentLesson = await curriculum.addLesson(instructor, module.id, {
            title: 'Capstone project',
            type: LessonType.ASSIGNMENT,
            durationMinutes: 120,
          });
          await assignments.upsert(instructor, assignmentLesson.id, {
            title: 'Capstone project',
            instructions: 'Submit a link to your repository and a short write up of your design.',
            maxPoints: 100,
            passingPoints: 60,
            rubric: [
              { id: 'works', criterion: 'The project runs as documented', maxPoints: 50 },
              { id: 'quality', criterion: 'Code quality and structure', maxPoints: 30 },
              { id: 'writeup', criterion: 'Clarity of the write up', maxPoints: 20 },
            ],
          });
        }
      }
      await courses.publish(instructor, course.id);
      created.push(course);
    }

    for (const [index, course] of created.entries()) {
      const instructor = await users.findByIdOrFail(course.instructorId);
      const existing = await cohorts.listManaged(instructor, {
        page: 1,
        limit: 1,
        courseId: course.id,
        upcomingOnly: false,
      });
      if (existing.items.length > 0) {
        continue;
      }
      const cohort = await cohorts.create(instructor, course.id, {
        title: `${course.title} cohort ${index + 1}`,
        startsAt: isoDaysFromNow(7 + index * 3),
        endsAt: isoDaysFromNow(63 + index * 3),
        capacity: 12,
        timezone: 'Europe/Berlin',
      });
      for (let week = 0; week < 3; week += 1) {
        await cohorts.addSession(instructor, cohort.id, {
          title: `Week ${week + 1} live session`,
          startsAt: isoDaysFromNow(7 + index * 3 + week * 7, 18),
          endsAt: isoDaysFromNow(7 + index * 3 + week * 7, 19),
          meetingUrl: 'https://meet.cohortly.local/session',
        });
      }
    }

    const orgOwner = userByEmail.get('orgadmin@cohortly.local')!;
    const orgs = await organizations.listMine(orgOwner);
    if (orgs.length === 0) {
      const organization = await organizations.create(admin, {
        name: 'Acme Corp',
        website: 'https://acme.example',
        ownerId: orgOwner.id,
      });
      await organizations.grantSeatPack(organization.id, {
        seats: 10,
        note: 'Seeded pilot contract',
      });
    }

    const freeCourses = created.filter((course) => course.pricing === CoursePricing.FREE);
    for (const [index, learner] of learners.entries()) {
      const course = freeCourses[index % freeCourses.length];
      if (await enrollments.hasAccess(learner.id, course.id)) {
        continue;
      }
      await enrollments.enroll(learner, { courseId: course.id });
      const modules = await curriculum.listModules(course.id);
      const lessons = modules.flatMap((module) => module.lessons ?? []);
      const toComplete = lessons
        .filter(
          (lesson) => lesson.type !== LessonType.QUIZ && lesson.type !== LessonType.ASSIGNMENT,
        )
        .slice(0, index + 1);
      for (const lesson of toComplete) {
        try {
          await progress.update(learner, lesson.id, { status: LessonProgressStatus.COMPLETED });
        } catch {
          break;
        }
      }
    }

    const partner = userByEmail.get('partner@cohortly.local')!;
    await referrals.upsertPartner(partner.id, {
      commissionRateBps: 2500,
      payoutMethod: 'bank_transfer',
    });

    console.log('Seed complete. Accounts use the password:', PASSWORD);
    for (const seed of [...STAFF, ...LEARNERS]) {
      console.log(`  ${seed.role.padEnd(10)} ${seed.email}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
